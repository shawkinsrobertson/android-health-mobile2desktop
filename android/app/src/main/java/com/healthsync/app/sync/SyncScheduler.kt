package com.healthsync.app.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

private const val PERIODIC_WORK_NAME = "health_sync_periodic"

/** Unique work name the UI observes to show "Sync now" progress/results. */
const val MANUAL_SYNC_WORK_NAME = "health_sync_manual"

/**
 * Schedules [SyncWorker] runs: a periodic background sync roughly every 15
 * minutes (the minimum interval WorkManager/Android allow), and one-shot
 * runs for the manual "Sync now" button. Both go through WorkManager
 * rather than a raw coroutine so a sync in progress survives the
 * triggering Activity being destroyed (screen off, backgrounded, low
 * memory) instead of being cancelled mid-flight.
 */
object SyncScheduler {

    fun schedulePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    fun cancelPeriodicSync(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
    }

    /**
     * Enqueues a single immediate sync run for the "Sync now" button.
     * [ExistingWorkPolicy.REPLACE] means a repeat tap restarts rather than
     * queues up behind a stuck previous run. The UI observes this by name
     * via [MANUAL_SYNC_WORK_NAME] rather than holding any local
     * coroutine/state of its own.
     */
    fun triggerManualSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            MANUAL_SYNC_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }
}
