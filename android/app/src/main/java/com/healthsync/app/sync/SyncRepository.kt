package com.healthsync.app.sync

import android.util.Log
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.healthconnect.SyncSpec
import com.healthsync.app.healthconnect.allSyncSpecs
import com.healthsync.app.supabase.SupabaseRestClient
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

private const val TAG = "SyncRepository"

/**
 * Max rows per Supabase upsert request. Records are batched into
 * requests of this size rather than one request per Health Connect
 * record -- with high-frequency data (continuous heart rate, steps
 * logged every few minutes) a per-record request count can run into
 * the thousands and make a sync look hung when it's really just very
 * slow.
 */
private const val UPSERT_BATCH_SIZE = 500

data class SyncResult(
    val upsertedRows: Int,
    val deletedRows: Int,
    val errors: List<String>,
    // "steps=0, heart_rate=12, sleep=1, ..." -- how many raw records
    // Health Connect actually handed back per type this run, *before*
    // any of our own filtering/dedup/push logic touches them. Lets the
    // UI show whether a type looks stuck because Health Connect itself
    // has nothing newer to give us, or because something on our side is
    // dropping records it did receive -- see SyncRepository's read vs
    // upserted counts.
    val readSummary: String = "",
) {
    val success: Boolean get() = errors.isEmpty()
}

/**
 * Orchestrates one sync pass across every [SyncSpec]: for a record type
 * synced for the first time, backfill by time range and establish a
 * changes-API token; after that, drain the changes API and only push what
 * actually changed (including propagating deletions).
 *
 * One record type failing (e.g. a permission was revoked) doesn't stop the
 * others — errors are collected and returned rather than thrown.
 *
 * Every pushed row is stamped with [clientId] (the signed-in user's own
 * id) in [pushRecords] -- RLS on the health-data tables (see
 * `supabase/migrations/0015_health_data_auth.sql`) checks `client_id =
 * auth.uid()`, but the `client_id` column itself has no default, so the
 * value has to actually be in the row we send, same as this repository
 * used to stamp a `user_id` value (the manually-entered sync code) onto
 * every row before real per-client auth existed -- just the real id now,
 * not a substitute for it.
 */
class SyncRepository(
    private val healthConnectManager: HealthConnectManager,
    private val supabase: SupabaseRestClient,
    private val syncState: SyncStateStore,
    private val clientId: String,
) {
    suspend fun syncAll(): SyncResult {
        var upserted = 0
        var deleted = 0
        val errors = mutableListOf<String>()
        val readCounts = mutableMapOf<String, Int>()

        // client_profiles.timezone (0038_client_timezone_and_source_
        // preference.sql) -- the server otherwise has no way to know what
        // timezone this client is in, so the dashboard's day-by-day
        // bucketing (lib/queries.ts) falls back to UTC. Cheap, idempotent,
        // and timezone changes (travel, a new device) only matter going
        // forward, so just refreshing it on every sync is enough -- no
        // separate "did it change" check needed. Failure here shouldn't
        // fail the sync itself (the data still syncs fine either way, the
        // dashboard just falls back to UTC bucketing same as before).
        try {
            supabase.patch(
                "client_profiles",
                filters = mapOf("profile_id" to "eq.$clientId"),
                body = mapOf("timezone" to ZoneId.systemDefault().id),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update timezone", e)
        }

        for (spec in allSyncSpecs) {
            try {
                val outcome = syncOne(spec)
                upserted += outcome.upserted
                deleted += outcome.deleted
                readCounts[spec.key] = outcome.read
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed for ${spec.key}", e)
                errors += "${spec.key}: ${e.message ?: e::class.simpleName}"
            }
        }

        val readSummary = readCounts.entries.joinToString(", ") { (key, count) -> "$key=$count" }
        return SyncResult(upserted, deleted, errors, readSummary)
    }

    private data class SyncOutcome(val read: Int, val upserted: Int, val deleted: Int)

    private suspend fun <T : Record> syncOne(spec: SyncSpec<T>): SyncOutcome {
        val existingToken = syncState.getChangesToken(spec.key)
        return if (existingToken == null) {
            backfill(spec)
        } else {
            drainChanges(spec, existingToken)
        }
    }

    /** First-time sync for a record type: pull recent history by time range, then mint a token. */
    private suspend fun <T : Record> backfill(spec: SyncSpec<T>): SyncOutcome {
        val client = healthConnectManager.client
        val start = Instant.now().minus(spec.initialBackfillDays, ChronoUnit.DAYS)
        val records = readAllPages(spec, TimeRangeFilter.after(start))

        val upserted = pushRecords(spec, records)

        val token = client.getChangesToken(ChangesTokenRequest(recordTypes = setOf(spec.recordType)))
        syncState.saveChangesToken(spec.key, token)
        Log.i(TAG, "Backfilled ${spec.key}: ${records.size} record(s), $upserted row(s)")
        return SyncOutcome(read = records.size, upserted = upserted, deleted = 0)
    }

    private suspend fun <T : Record> readAllPages(spec: SyncSpec<T>, filter: TimeRangeFilter): List<T> {
        val client = healthConnectManager.client
        val all = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = spec.recordType,
                    timeRangeFilter = filter,
                    pageToken = pageToken,
                )
            )
            all.addAll(response.records)
            pageToken = response.pageToken
        } while (pageToken != null)
        return all
    }

    /**
     * Pull everything since [startToken] via the Health Connect changes
     * API. `getChanges` is a plain suspend function returning a
     * [androidx.health.connect.client.response.ChangesResponse] page (not
     * a Flow) — loop on `hasMore`/`nextChangesToken` ourselves, and treat
     * `changesTokenExpired` as the signal to fall back to a fresh backfill
     * (changes tokens are only valid ~30 days).
     */
    private suspend fun <T : Record> drainChanges(
        spec: SyncSpec<T>,
        startToken: String,
    ): SyncOutcome {
        val client = healthConnectManager.client
        var upserted = 0
        var deleted = 0
        var read = 0
        var token = startToken

        while (true) {
            val response = client.getChanges(token)

            if (response.changesTokenExpired) {
                Log.w(TAG, "Changes token expired for ${spec.key}, falling back to backfill")
                syncState.clearChangesToken(spec.key)
                val fallback = backfill(spec)
                return SyncOutcome(
                    read = read + fallback.read,
                    upserted = upserted + fallback.upserted,
                    deleted = deleted + fallback.deleted,
                )
            }

            val upsertedRecords = mutableListOf<T>()
            for (change in response.changes) {
                when (change) {
                    is UpsertionChange -> {
                        @Suppress("UNCHECKED_CAST")
                        upsertedRecords += change.record as T
                    }
                    is DeletionChange -> {
                        deleteRecord(spec, change.recordId)
                        deleted += 1
                    }
                }
            }
            read += upsertedRecords.size
            upserted += pushRecords(spec, upsertedRecords)

            token = response.nextChangesToken
            if (!response.hasMore) break
        }

        syncState.saveChangesToken(spec.key, token)
        if (upserted > 0 || deleted > 0) {
            Log.i(TAG, "Synced ${spec.key}: +$upserted / -$deleted row(s)")
        }
        return SyncOutcome(read = read, upserted = upserted, deleted = deleted)
    }

    /**
     * Push [records] to Supabase, flattening every record's per-table rows
     * into one row list per table first, then upserting each table in
     * batches of [UPSERT_BATCH_SIZE] rows instead of one request per
     * record. A single request per (table, batch) pair rather than per
     * record is what keeps a large backfill from taking forever.
     */
    private suspend fun <T : Record> pushRecords(spec: SyncSpec<T>, records: List<T>): Int {
        if (records.isEmpty()) return 0

        val rowsByTable = mutableMapOf<String, MutableList<Map<String, Any?>>>()
        for (record in records) {
            for ((table, rows) in spec.toTableRows(record)) {
                if (rows.isEmpty()) continue
                rowsByTable.getOrPut(table) { mutableListOf() }
                    .addAll(rows.map { row -> row + ("client_id" to clientId) })
            }
        }

        // A single upsert command can't touch the same on_conflict key
        // twice -- Postgres rejects the whole batch with "ON CONFLICT DO
        // UPDATE command cannot affect row a second time" (error 21000)
        // rather than just the offending rows. heart_rate_samples derives
        // its id from the sample's own millisecond timestamp
        // (record.metadata.id:epochMillis), and some sources report more
        // than one sample in the same record at the same millisecond, so
        // this does happen in practice, not just in theory. Deduplicate
        // per table right before chunking/sending -- keeps the batch valid
        // regardless of which SyncSpec produced the collision.
        for ((table, rows) in rowsByTable) {
            rowsByTable[table] = rows.associateBy { it["health_connect_id"] }.values.toMutableList()
        }

        var count = 0
        for ((table, rows) in rowsByTable) {
            for (batch in rows.chunked(UPSERT_BATCH_SIZE)) {
                // client_id,metric_type,health_connect_id -- matches the
                // composite unique constraint from supabase/migrations/
                // 0035_metrics.sql. Every SyncSpec now writes to the single
                // "metrics" table (0001/0015/0022's per-table
                // client_id,health_connect_id key is superseded there), and
                // metric_type guards against two different record types
                // ever landing on the same conflict target -- not a
                // real-world risk given Health Connect's own id scheme, but
                // free to assert explicitly now that the table is shared.
                supabase.upsert(table = table, rows = batch, onConflict = "client_id,metric_type,health_connect_id")
                count += batch.size
            }
        }
        return count
    }

    private suspend fun deleteRecord(spec: SyncSpec<*>, recordId: String) {
        for (table in spec.tables) {
            // health_connect_id prefixes are unique per Health Connect
            // record regardless of type (see deleteByHealthConnectIdPrefix's
            // own doc comment), so a plain prefix match on the shared
            // "metrics" table still only ever matches the rows this one
            // record produced -- no metric_type filter needed here.
            supabase.deleteByHealthConnectIdPrefix(table = table, prefix = recordId)
        }
    }
}
