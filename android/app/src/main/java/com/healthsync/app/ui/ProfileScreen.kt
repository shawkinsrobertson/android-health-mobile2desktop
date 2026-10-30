package com.healthsync.app.ui

import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.ProfileRepository
import com.healthsync.app.healthconnect.allSyncSpecs
import com.healthsync.app.supabase.SupabaseRestClient
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.sync.SyncStateStore
import com.healthsync.app.ui.components.ConfirmDialog
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Profile + settings: account info, sync status per data type, and the
// sign-out/force-resync controls that used to live on HomeScreen before
// this UI pass moved Home over to the notification shade + streak
// layout. Weight units / data-sharing consent / profile photo (mentioned
// in the mockup's settings list) aren't editable from Android yet --
// that's a real gap, not an oversight; see PLANNING.md.
// spec.key (healthconnect/SyncSpec.kt) -> metrics.metric_type
// (supabase/migrations/0035_metrics.sql) -- most sync-spec keys already
// match their metric_type 1:1; sleep/exercise don't (spec keys "sleep"/
// "exercise" vs. metric_type "sleep_session"/"exercise_session").
private val METRIC_TYPE_BY_SYNC_SPEC_KEY = mapOf(
    "sleep" to "sleep_session",
    "exercise" to "exercise_session",
)
private fun metricTypeForSyncSpecKey(key: String): String = METRIC_TYPE_BY_SYNC_SPEC_KEY[key] ?: key

// Raw source_package values are Android package ids -- not something a
// client should have to read. Covers the common Health Connect data
// sources this app's users are likely to actually have; anything else
// falls back to a readable guess (the segment after the last dot,
// title-cased) rather than the raw dotted id. Not verified against a real
// device in this environment -- worth double-checking the exact package
// ids once this ships somewhere these can actually be observed.
private val KNOWN_SOURCE_LABELS = mapOf(
    "com.garmin.android.apps.connectmobile" to "Garmin Connect",
    "com.sec.android.app.shealth" to "Samsung Health",
    "com.google.android.apps.fitness" to "Google Fit",
    "com.google.android.apps.healthdata" to "Health Connect",
    "com.fitbit.FitbitMobile" to "Fitbit",
    "com.polar.polarflow" to "Polar Flow",
    "com.whoop.android" to "Whoop",
    "com.oura.ring" to "Oura",
)
private fun labelForSource(sourcePackage: String): String =
    KNOWN_SOURCE_LABELS[sourcePackage] ?: sourcePackage.substringAfterLast('.').replaceFirstChar { it.uppercase() }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    email: String?,
    isSyncing: Boolean,
    lastResult: SyncResult?,
    syncStateStore: SyncStateStore,
    authRepository: AuthRepository,
    onSyncNow: () -> Unit,
    onForceResync: () -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
) {
    var confirmingSignOut by remember { mutableStateOf(false) }
    var confirmingResync by remember { mutableStateOf(false) }

    // Same "build the repository from the signed-in session, inside the
    // screen" pattern DashboardScreen/WorkoutScreen/etc. already use --
    // this screen previously had no reason to touch Supabase directly at
    // all (it only read state its caller already owned), so there's no
    // existing clientId/SupabaseRestClient wiring to reuse from the nav
    // layer the way dashboardContent/workoutContent get one.
    var clientId by remember { mutableStateOf<String?>(null) }
    var profileRepository by remember { mutableStateOf<ProfileRepository?>(null) }
    var sourcePreferences by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val userId = authRepository.getUserId() ?: return@LaunchedEffect
        val token = authRepository.getValidAccessToken() ?: return@LaunchedEffect
        val repo = ProfileRepository(SupabaseRestClient(token))
        clientId = userId
        profileRepository = repo
        sourcePreferences = repo.loadAllSourcePreferences(userId)
    }

    fun refreshPreferences() {
        val id = clientId ?: return
        val repo = profileRepository ?: return
        scope.launch { sourcePreferences = repo.loadAllSourcePreferences(id) }
    }

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
                val metricType = metricTypeForSyncSpecKey(spec.key)
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
                    trailingContent = {
                        SourcePicker(
                            currentSource = sourcePreferences[metricType],
                            onLoadSources = {
                                val id = clientId
                                val repo = profileRepository
                                if (id != null && repo != null) repo.loadDistinctSources(id, metricType) else emptyList()
                            },
                            onSelect = { source ->
                                val id = clientId
                                val repo = profileRepository
                                if (id != null && repo != null) {
                                    scope.launch {
                                        if (source == null) repo.clearSourcePreference(id, metricType)
                                        else repo.setSourcePreference(id, metricType, source)
                                        refreshPreferences()
                                    }
                                }
                            },
                        )
                    },
                )
            }

            // Material3's DropdownMenu (SourcePicker's popup) positions
            // itself against the raw window size, with no awareness of the
            // system nav bar inset at all -- when the last row's anchor
            // sits flush against the bottom of the scrollable content (as
            // it did with no spacer here), the popup can open downward
            // into the area behind the nav bar. Real margin below the last
            // row keeps every anchor comfortably clear of that edge.
            Spacer(Modifier.height(72.dp))
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

// "All sources" (no preference, the default -- merges every source with
// this app's own dedup heuristic) plus whichever sources have actually
// been seen for this client+type, fetched lazily on first open rather
// than for all 8 data types up front.
@Composable
private fun SourcePicker(
    currentSource: String?,
    onLoadSources: suspend () -> List<String>,
    onSelect: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var sources by remember { mutableStateOf<List<String>?>(null) }
    val scope = rememberCoroutineScope()

    Box {
        TextButton(
            modifier = Modifier.widthIn(min = 96.dp),
            onClick = {
                expanded = true
                if (sources == null) scope.launch { sources = onLoadSources() }
            },
        ) {
            Text(currentSource?.let { labelForSource(it) } ?: "All sources")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("All sources") },
                onClick = {
                    expanded = false
                    onSelect(null)
                },
            )
            val loaded = sources
            if (loaded == null) {
                DropdownMenuItem(text = { Text("Loading…") }, onClick = {}, enabled = false)
            } else {
                loaded.forEach { source ->
                    DropdownMenuItem(
                        text = { Text(labelForSource(source)) },
                        onClick = {
                            expanded = false
                            onSelect(source)
                        },
                    )
                }
            }
        }
    }
}
