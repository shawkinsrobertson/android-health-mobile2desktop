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
 */
class SyncRepository(
    private val healthConnectManager: HealthConnectManager,
    private val supabase: SupabaseRestClient,
    private val syncState: SyncStateStore,
) {
    suspend fun syncAll(): SyncResult {
        var upserted = 0
        var deleted = 0
        val errors = mutableListOf<String>()

        // Read once per pass rather than per batch -- this is who every row
        // pushed this run gets tagged as (falls back to the `user_id`
        // column's plain default when unset, same as before this existed).
        val userId = syncState.getSyncCode()

        for (spec in allSyncSpecs) {
            try {
                val (u, d) = syncOne(spec, userId)
                upserted += u
                deleted += d
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed for ${spec.key}", e)
                errors += "${spec.key}: ${e.message ?: e::class.simpleName}"
            }
        }

        return SyncResult(upserted, deleted, errors)
    }

    private suspend fun <T : Record> syncOne(spec: SyncSpec<T>, userId: String?): Pair<Int, Int> {
        val existingToken = syncState.getChangesToken(spec.key)
        return if (existingToken == null) {
            backfill(spec, userId)
        } else {
            drainChanges(spec, existingToken, userId)
        }
    }

    /** First-time sync for a record type: pull recent history by time range, then mint a token. */
    private suspend fun <T : Record> backfill(spec: SyncSpec<T>, userId: String?): Pair<Int, Int> {
        val client = healthConnectManager.client
        val start = Instant.now().minus(spec.initialBackfillDays, ChronoUnit.DAYS)
        val records = readAllPages(spec, TimeRangeFilter.after(start))

        val upserted = pushRecords(spec, records, userId)

        val token = client.getChangesToken(ChangesTokenRequest(recordTypes = setOf(spec.recordType)))
        syncState.saveChangesToken(spec.key, token)
        Log.i(TAG, "Backfilled ${spec.key}: ${records.size} record(s), $upserted row(s)")
        return upserted to 0
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
        userId: String?,
    ): Pair<Int, Int> {
        val client = healthConnectManager.client
        var upserted = 0
        var deleted = 0
        var token = startToken

        while (true) {
            val response = client.getChanges(token)

            if (response.changesTokenExpired) {
                Log.w(TAG, "Changes token expired for ${spec.key}, falling back to backfill")
                syncState.clearChangesToken(spec.key)
                val (u, d) = backfill(spec, userId)
                return (upserted + u) to (deleted + d)
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
            upserted += pushRecords(spec, upsertedRecords, userId)

            token = response.nextChangesToken
            if (!response.hasMore) break
        }

        syncState.saveChangesToken(spec.key, token)
        if (upserted > 0 || deleted > 0) {
            Log.i(TAG, "Synced ${spec.key}: +$upserted / -$deleted row(s)")
        }
        return upserted to deleted
    }

    /**
     * Push [records] to Supabase, flattening every record's per-table rows
     * into one row list per table first, then upserting each table in
     * batches of [UPSERT_BATCH_SIZE] rows instead of one request per
     * record. A single request per (table, batch) pair rather than per
     * record is what keeps a large backfill from taking forever.
     */
    private suspend fun <T : Record> pushRecords(
        spec: SyncSpec<T>,
        records: List<T>,
        userId: String?,
    ): Int {
        if (records.isEmpty()) return 0

        val rowsByTable = mutableMapOf<String, MutableList<Map<String, Any?>>>()
        for (record in records) {
            for ((table, rows) in spec.toTableRows(record)) {
                if (rows.isEmpty()) continue
                // Tag with the client's sync code when one is set (see
                // SyncStateStore.getSyncCode); otherwise every row's
                // `user_id` falls back to the table column's own default,
                // same behavior as before sync codes existed.
                val taggedRows = if (userId != null) {
                    rows.map { row -> row + ("user_id" to userId) }
                } else {
                    rows
                }
                rowsByTable.getOrPut(table) { mutableListOf() }.addAll(taggedRows)
            }
        }

        var count = 0
        for ((table, rows) in rowsByTable) {
            for (batch in rows.chunked(UPSERT_BATCH_SIZE)) {
                supabase.upsert(table = table, rows = batch, onConflict = "health_connect_id")
                count += batch.size
            }
        }
        return count
    }

    private suspend fun deleteRecord(spec: SyncSpec<*>, recordId: String) {
        for (table in spec.tables) {
            supabase.deleteByHealthConnectIdPrefix(table = table, prefix = recordId)
        }
    }
}
