package com.healthsync.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.supabase.SupabaseRestClient

/**
 * Background sync unit run by WorkManager (see [SyncScheduler]) and also
 * invoked directly for the manual "Sync now" button in the UI.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val healthConnectManager = HealthConnectManager(applicationContext)
        if (!healthConnectManager.isAvailable) {
            return Result.failure()
        }
        if (!healthConnectManager.hasAllPermissions()) {
            // Nothing we can do until the user grants permissions in the app UI.
            return Result.failure()
        }

        val repository = SyncRepository(
            healthConnectManager = healthConnectManager,
            supabase = SupabaseRestClient(),
            syncState = SyncStateStore(applicationContext),
        )

        val result = repository.syncAll()
        return if (result.success) Result.success() else Result.retry()
    }
}
