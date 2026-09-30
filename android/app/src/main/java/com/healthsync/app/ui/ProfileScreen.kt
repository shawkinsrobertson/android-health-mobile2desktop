package com.healthsync.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.healthconnect.allSyncSpecs
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.sync.SyncStateStore
import com.healthsync.app.ui.components.ConfirmDialog
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// Profile + settings: account info, sync status per data type, and the
// sign-out/force-resync controls that used to live on HomeScreen before
// this UI pass moved Home over to the notification shade + streak
// layout. Weight units / data-sharing consent / profile photo (mentioned
// in the mockup's settings list) aren't editable from Android yet --
// that's a real gap, not an oversight; see PLANNING.md.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    email: String?,
    isSyncing: Boolean,
    lastResult: SyncResult?,
    syncStateStore: SyncStateStore,
    onSyncNow: () -> Unit,
    onForceResync: () -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
) {
    var confirmingSignOut by remember { mutableStateOf(false) }
    var confirmingResync by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Profile") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        containerColor = Color.Transparent,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            Text("Account", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                email?.let { "Signed in as $it" } ?: "Signed in",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { confirmingSignOut = true }) { Text("Sign out") }

            Spacer(Modifier.height(20.dp))
            Text("Sync", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onSyncNow, enabled = !isSyncing) {
                Text(if (isSyncing) "Syncing…" else "Sync now")
            }
            lastResult?.let { result ->
                if (result.success) {
                    Text(
                        "Last sync: +${result.upsertedRows} row(s) written, -${result.deletedRows} removed",
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    Text(
                        "Last sync had errors: ${result.errors.joinToString("; ")}",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Spacer(Modifier.height(8.dp))
            }
            TextButton(onClick = { confirmingResync = true }, enabled = !isSyncing) {
                Text(if (isSyncing) "Syncing…" else "Force full re-sync")
            }
            Text(
                "Re-checks full history for every type below instead of trusting Health " +
                    "Connect's \"what changed\" cursor -- slower than a normal sync, use if " +
                    "a type looks stuck even though the data exists in Health Connect.",
                style = MaterialTheme.typography.bodySmall,
            )

            Spacer(Modifier.height(20.dp))
            Text("Data types", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            allSyncSpecs.forEach { spec ->
                val lastSynced by syncStateStore.lastSyncedFlow(spec.key).collectAsState(initial = null)
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

    if (confirmingSignOut) {
        ConfirmDialog(
            title = "Sign out?",
            body = "You'll need to verify your email again to sign back in.",
            confirmLabel = "Sign out",
            onConfirm = {
                confirmingSignOut = false
                onSignOut()
            },
            onDismiss = { confirmingSignOut = false },
        )
    }
    if (confirmingResync) {
        ConfirmDialog(
            title = "Force a full re-sync?",
            body = "Re-checks full history for every data type instead of trusting Health " +
                "Connect's \"what changed\" cursor -- slower than a normal sync.",
            confirmLabel = "Re-sync",
            onConfirm = {
                confirmingResync = false
                onForceResync()
            },
            onDismiss = { confirmingResync = false },
        )
    }
}
