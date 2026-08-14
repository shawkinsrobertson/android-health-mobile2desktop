package com.healthsync.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.supabase.SupabaseRestClient
import com.healthsync.app.sync.SyncRepository
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.sync.SyncStateStore
import com.healthsync.app.ui.MainScreen
import com.healthsync.app.ui.theme.HealthSyncTheme
import kotlinx.coroutines.launch

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
                var isSyncing by remember { mutableStateOf(false) }
                var lastResult by remember { mutableStateOf<SyncResult?>(null) }
                val scope = rememberCoroutineScope()

                val permissionLauncher = rememberLauncherForActivityResult(
                    contract = healthConnectManager.permissionRequestContract(),
                ) { granted ->
                    hasPermissions = granted.containsAll(healthConnectManager.requiredPermissions)
                }

                LaunchedEffect(Unit) {
                    hasPermissions = healthConnectManager.isAvailable &&
                        healthConnectManager.hasAllPermissions()
                }

                fun runSync() {
                    scope.launch {
                        isSyncing = true
                        val repository = SyncRepository(
                            healthConnectManager = healthConnectManager,
                            supabase = SupabaseRestClient(),
                            syncState = syncStateStore,
                        )
                        lastResult = repository.syncAll()
                        isSyncing = false
                    }
                }

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
                    onSyncNow = ::runSync,
                )
            }
        }
    }
}
