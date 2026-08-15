package com.healthsync.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.healthconnect.allSyncSpecs
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.sync.SyncStateStore
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    healthConnectAvailable: Boolean,
    hasPermissions: Boolean?,
    isSyncing: Boolean,
    lastResult: SyncResult?,
    syncStateStore: SyncStateStore,
    onRequestPermissions: () -> Unit,
    onInstallHealthConnect: () -> Unit,
    onSyncNow: () -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Health Sync") }) }) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize(),
        ) {
            when {
                !healthConnectAvailable -> {
                    Text("Health Connect isn't installed on this device, or needs an update.")
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = onInstallHealthConnect) {
                        Text("Install / update Health Connect")
                    }
                }

                hasPermissions == null -> {
                    CircularProgressIndicator()
                }

                hasPermissions == false -> {
                    Text("Health Sync needs permission to read your Health Connect data.")
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = onRequestPermissions) {
                        Text("Grant permissions")
                    }
                }

                else -> {
                    Button(onClick = onSyncNow, enabled = !isSyncing) {
                        Text(if (isSyncing) "Syncing…" else "Sync now")
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Background sync also runs automatically roughly every 15 minutes " +
                            "while the device has network access.",
                        style = MaterialTheme.typography.bodySmall,
                    )

                    lastResult?.let { result ->
                        Spacer(Modifier.height(12.dp))
                        if (result.success) {
                            Text("Last sync: +${result.upsertedRows} row(s) written, -${result.deletedRows} removed")
                        } else {
                            Text(
                                "Last sync had errors: ${result.errors.joinToString("; ")}",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }

                    Spacer(Modifier.height(20.dp))
                    Text("Data types", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))

                    LazyColumn {
                        items(allSyncSpecs) { spec ->
                            val lastSynced by syncStateStore.lastSyncedFlow(spec.key)
                                .collectAsState(initial = null)
                            ListItem(
                                headlineContent = {
                                    Text(spec.key.replace('_', ' ').replaceFirstChar { it.uppercase() })
                                },
                                supportingContent = {
                                    Text(
                                        lastSynced?.let { instant ->
                                            DateTimeFormatter.ofPattern("MMM d, h:mm a")
                                                .withZone(ZoneId.systemDefault())
                                                .format(instant)
                                        } ?: "Never synced yet"
                                    )
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}
