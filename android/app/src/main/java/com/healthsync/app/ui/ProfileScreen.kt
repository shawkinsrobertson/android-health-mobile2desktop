package com.healthsync.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.delay

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

    // isSyncing/lastResult are owned by the caller (the sync result already
    // shows below), but neither tells this screen which of the two buttons
    // just finished -- track that locally so the right one, specifically,
    // gets a brief "✓" on itself instead of only the shared result text.
    var lastAction by remember { mutableStateOf<String?>(null) }
    var wasSyncing by remember { mutableStateOf(isSyncing) }
    var justSynced by remember { mutableStateOf(false) }
    var justResynced by remember { mutableStateOf(false) }

    LaunchedEffect(isSyncing) {
        if (wasSyncing && !isSyncing) {
            when (lastAction) {
                "sync" -> justSynced = true
                "resync" -> justResynced = true
            }
            lastAction = null
        }
        wasSyncing = isSyncing
    }
    LaunchedEffect(justSynced) {
        if (justSynced) {
            delay(1200)
            justSynced = false
        }
    }
    LaunchedEffect(justResynced) {
        if (justResynced) {
            delay(1200)
            justResynced = false
        }
    }

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
        // See HomeScreen.kt's Surface comment -- Transparent has no "on-X"
        // text color Scaffold can infer, so this has to be explicit or
        // every Text without its own color silently renders black.
        contentColor = MaterialTheme.colorScheme.onBackground,
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
            TextButton(
                modifier = Modifier.widthIn(min = 112.dp),
                onClick = { lastAction = "sync"; onSyncNow() },
                enabled = !isSyncing,
            ) {
                Text(if (isSyncing) "Syncing…" else if (justSynced) "Synced ✓" else "Sync now")
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
            TextButton(
                modifier = Modifier.widthIn(min = 176.dp),
                onClick = { confirmingResync = true },
                enabled = !isSyncing,
            ) {
                Text(if (isSyncing) "Syncing…" else if (justResynced) "Synced ✓" else "Force full re-sync")
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
                lastAction = "resync"
                onForceResync()
            },
            onDismiss = { confirmingResync = false },
        )
    }
}
