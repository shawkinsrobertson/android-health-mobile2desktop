package com.healthsync.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.WorkerParameters
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.supabase.SupabaseRestClient

/**
 * Background sync unit run by WorkManager -- both the periodic ~15-minute
 * background sync ([SyncScheduler.schedulePeriodicSync]) and the manual
 * "Sync now" button ([SyncScheduler.triggerManualSync]) run through this
 * same worker. That matters for the manual case in particular: a
 * WorkManager job survives the triggering Activity being destroyed
 * (screen off, app backgrounded, low memory), where a coroutine launched
 * on a Compose `rememberCoroutineScope()` would be cancelled the moment
 * the Activity goes away -- which is what made "Sync now" look like it
 * hung forever rather than actually completing.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val healthConnectManager = HealthConnectManager(applicationContext)
        if (!healthConnectManager.isAvailable) {
            return Result.failure(
                Data.Builder().putString(KEY_FAILURE_REASON, "Health Connect isn't available").build()
            )
        }
        if (!healthConnectManager.hasAllPermissions()) {
            return Result.failure(
                Data.Builder().putString(KEY_FAILURE_REASON, "Permissions not granted").build()
            )
        }

        val repository = SyncRepository(
            healthConnectManager = healthConnectManager,
            supabase = SupabaseRestClient(),
            syncState = SyncStateStore(applicationContext),
        )

        val result = repository.syncAll()
        // Always succeed here rather than surfacing per-type failures as a
        // WorkManager-level Result.retry(): the sync itself is already
        // idempotent and retry-safe (per-type changes-token cursor, upsert
        // on a stable id), so the next periodic run or manual tap is the
        // retry -- no need to also layer WorkManager's own backoff/retry
        // on top, which for a one-time manual-sync request could otherwise
        // keep re-enqueueing silently in the background.
        val output = Data.Builder()
            .putInt(KEY_UPSERTED_ROWS, result.upsertedRows)
            .putInt(KEY_DELETED_ROWS, result.deletedRows)
            .putStringArray(KEY_ERRORS, result.errors.toTypedArray())
            .build()
        return Result.success(output)
    }

    companion object {
        const val KEY_UPSERTED_ROWS = "upsertedRows"
        const val KEY_DELETED_ROWS = "deletedRows"
        const val KEY_ERRORS = "errors"
        const val KEY_FAILURE_REASON = "failureReason"
    }
}
