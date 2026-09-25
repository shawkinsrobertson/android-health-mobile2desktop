package com.healthsync.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.healthconnect.allSyncSpecs
import com.healthsync.app.sync.SyncStateStore
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
    syncStateStore: SyncStateStore,
    onSyncNow: () -> Unit,
    onForceResync: () -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Profile") }) }) { padding ->
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
            TextButton(onClick = onSignOut) { Text("Sign out") }

            Spacer(Modifier.height(20.dp))
            Text("Sync", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onSyncNow, enabled = !isSyncing) {
                Text(if (isSyncing) "Syncing…" else "Sync now")
            }
            TextButton(onClick = onForceResync, enabled = !isSyncing) {
                Text("Force full re-sync")
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

            Spacer(Modifier.height(20.dp))
            TextButton(onClick = onBack) { Text("Back") }
        }
    }
}
