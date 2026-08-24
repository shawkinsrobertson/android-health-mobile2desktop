package com.healthsync.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.sync.MANUAL_SYNC_WORK_NAME
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.sync.SyncScheduler
import com.healthsync.app.sync.SyncStateStore
import com.healthsync.app.sync.SyncWorker
import com.healthsync.app.ui.MainScreen
import com.healthsync.app.ui.theme.HealthSyncTheme

/** Maps a finished manual-sync [WorkInfo] to the [SyncResult] shape the UI already knows how to render. */
private fun WorkInfo.toSyncResult(): SyncResult? = when (state) {
    WorkInfo.State.SUCCEEDED -> SyncResult(
        upsertedRows = outputData.getInt(SyncWorker.KEY_UPSERTED_ROWS, 0),
        deletedRows = outputData.getInt(SyncWorker.KEY_DELETED_ROWS, 0),
        errors = outputData.getStringArray(SyncWorker.KEY_ERRORS)?.toList().orEmpty(),
    )
    WorkInfo.State.FAILED -> SyncResult(
        upsertedRows = 0,
        deletedRows = 0,
        errors = listOf(outputData.getString(SyncWorker.KEY_FAILURE_REASON) ?: "Sync failed"),
    )
    else -> null
}

class MainActivity : ComponentActivity() {

    private lateinit var healthConnectManager: HealthConnectManager
    private lateinit var syncStateStore: SyncStateStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        healthConnectManager = HealthConnectManager(this)
        syncStateStore = SyncStateStore(this)

        setContent {
            HealthSyncTheme {
                var hasPermissions by remember { mutableStateOf<Boolean?>(null) }

                val permissionLauncher = rememberLauncherForActivityResult(
                    contract = healthConnectManager.permissionRequestContract(),
                ) { granted ->
                    hasPermissions = granted.containsAll(healthConnectManager.requiredPermissions)
                }

                LaunchedEffect(Unit) {
                    hasPermissions = healthConnectManager.isAvailable &&
                        healthConnectManager.hasAllPermissions()
                }

                // Sync runs as a WorkManager job (see SyncScheduler.triggerManualSync)
                // rather than a coroutine on this Composable's scope, so it survives
                // this Activity being destroyed mid-run -- screen off, app
                // backgrounded, low memory -- instead of being silently cancelled.
                // The UI just observes the unique work's status/output.
                val workInfos by WorkManager.getInstance(this@MainActivity)
                    .getWorkInfosForUniqueWorkFlow(MANUAL_SYNC_WORK_NAME)
                    .collectAsState(initial = emptyList())
                val activeWorkInfo = workInfos.firstOrNull { it.state != WorkInfo.State.CANCELLED }
                val isSyncing = activeWorkInfo?.state == WorkInfo.State.ENQUEUED ||
                    activeWorkInfo?.state == WorkInfo.State.RUNNING
                val lastResult = activeWorkInfo?.toSyncResult()

                MainScreen(
                    healthConnectAvailable = healthConnectManager.isAvailable,
                    hasPermissions = hasPermissions,
                    isSyncing = isSyncing,
                    lastResult = lastResult,
                    syncStateStore = syncStateStore,
                    onRequestPermissions = {
                        permissionLauncher.launch(healthConnectManager.requiredPermissions)
                    },
                    onInstallHealthConnect = {
                        val uri = Uri.parse("market://details?id=com.google.android.apps.healthdata")
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    },
                    onSyncNow = { SyncScheduler.triggerManualSync(this@MainActivity) },
                )
            }
        }
    }
}
