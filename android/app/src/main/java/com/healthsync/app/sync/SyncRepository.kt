package com.healthsync.app.sync

import android.util.Log
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.exceptions.HealthConnectException
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ChangesMessage
import androidx.health.connect.client.time.TimeRangeFilter
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.healthconnect.SyncSpec
import com.healthsync.app.healthconnect.allSyncSpecs
import com.healthsync.app.supabase.SupabaseRestClient
import kotlinx.coroutines.flow.collect
import java.time.Instant
import java.time.temporal.ChronoUnit

private const val TAG = "SyncRepository"

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

        for (spec in allSyncSpecs) {
            try {
                val (u, d) = syncOne(spec)
                upserted += u
                deleted += d
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed for ${spec.key}", e)
                errors += "${spec.key}: ${e.message ?: e::class.simpleName}"
            }
        }

        return SyncResult(upserted, deleted, errors)
    }

    private suspend fun <T : Record> syncOne(spec: SyncSpec<T>): Pair<Int, Int> {
        val existingToken = syncState.getChangesToken(spec.key)
        return if (existingToken == null) {
            backfill(spec)
        } else {
            drainChanges(spec, existingToken)
        }
    }

    /** First-time sync for a record type: pull recent history by time range, then mint a token. */
    private suspend fun <T : Record> backfill(spec: SyncSpec<T>): Pair<Int, Int> {
        val client = healthConnectManager.client
        val start = Instant.now().minus(spec.initialBackfillDays, ChronoUnit.DAYS)
        val records = readAllPages(spec, TimeRangeFilter.after(start))

        var upserted = 0
        for (record in records) {
            upserted += pushRecord(spec, record)
        }

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
     * API. Note: exact changes-API shape (`getChanges` returning
     * `Flow<ChangesMessage>`, token-expiry surfacing as a thrown
     * [HealthConnectException]) reflects the SDK version pinned in
     * app/build.gradle.kts. If Android Studio flags a mismatch after a
     * Health Connect library bump, check
     * androidx.health.connect.client.response.ChangesMessage in that
     * version's docs — this is the one area of the API that has moved
     * across alpha releases.
     */
    private suspend fun <T : Record> drainChanges(spec: SyncSpec<T>, startToken: String): Pair<Int, Int> {
        val client = healthConnectManager.client
        var upserted = 0
        var deleted = 0
        var latestToken = startToken

        try {
            client.getChanges(startToken).collect { message ->
                when (message) {
                    is ChangesMessage.ChangeList -> {
                        for (change in message.changes) {
                            when (change) {
                                is UpsertionChange -> {
                                    @Suppress("UNCHECKED_CAST")
                                    upserted += pushRecord(spec, change.record as T)
                                }
                                is DeletionChange -> {
                                    deleteRecord(spec, change.recordId)
                                    deleted += 1
                                }
                            }
                        }
                    }
                    is ChangesMessage.NoMoreChanges -> {
                        latestToken = message.nextChangesToken
                    }
                }
            }
        } catch (e: HealthConnectException) {
            // Most commonly a stale/expired changes token. Start over with a
            // fresh time-range backfill, which also mints a new token.
            Log.w(TAG, "Changes token expired for ${spec.key}, falling back to backfill", e)
            syncState.clearChangesToken(spec.key)
            val (u, d) = backfill(spec)
            return (upserted + u) to (deleted + d)
        }

        syncState.saveChangesToken(spec.key, latestToken)
        if (upserted > 0 || deleted > 0) {
            Log.i(TAG, "Synced ${spec.key}: +$upserted / -$deleted row(s)")
        }
        return upserted to deleted
    }

    private fun <T : Record> pushRecord(spec: SyncSpec<T>, record: T): Int {
        val tableRows = spec.toTableRows(record)
        var count = 0
        for ((table, rows) in tableRows) {
            if (rows.isEmpty()) continue
            supabase.upsert(table = table, rows = rows, onConflict = "health_connect_id")
            count += rows.size
        }
        return count
    }

    private fun deleteRecord(spec: SyncSpec<*>, recordId: String) {
        for (table in spec.tables) {
            supabase.deleteByHealthConnectIdPrefix(table = table, prefix = recordId)
        }
    }
}
