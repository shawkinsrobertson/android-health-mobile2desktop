package com.healthsync.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.HomeSummary
import com.healthsync.app.data.HomeSummaryRepository
import com.healthsync.app.data.ProfileRepository
import com.healthsync.app.healthconnect.HealthConnectManager
import com.healthsync.app.supabase.SupabaseRestClient
import com.healthsync.app.sync.MANUAL_SYNC_WORK_NAME
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.sync.SyncScheduler
import com.healthsync.app.sync.SyncStateStore
import com.healthsync.app.sync.SyncWorker
import com.healthsync.app.ui.CoachHomeScreen
import com.healthsync.app.ui.DashboardScreen
import com.healthsync.app.ui.HomeScreen
import com.healthsync.app.ui.ProfileScreen
import com.healthsync.app.ui.nav.AuthNavHost
import com.healthsync.app.ui.nav.ROUTE_HOME
import com.healthsync.app.ui.nav.ROUTE_LOGIN
import com.healthsync.app.ui.theme.HealthSyncTheme
import kotlinx.coroutines.launch

/** Maps a finished manual-sync [WorkInfo] to the [SyncResult] shape the UI already knows how to render. */
private fun WorkInfo.toSyncResult(): SyncResult? = when (state) {
    WorkInfo.State.SUCCEEDED -> SyncResult(
        upsertedRows = outputData.getInt(SyncWorker.KEY_UPSERTED_ROWS, 0),
        deletedRows = outputData.getInt(SyncWorker.KEY_DELETED_ROWS, 0),
        errors = outputData.getStringArray(SyncWorker.KEY_ERRORS)?.toList().orEmpty(),
        readSummary = outputData.getString(SyncWorker.KEY_READ_SUMMARY) ?: "",
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
    private lateinit var authRepository: AuthRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        healthConnectManager = HealthConnectManager(this)
        syncStateStore = SyncStateStore(this)
        authRepository = AuthRepository(this)

        setContent {
            HealthSyncTheme {
                // null while the session store's first read hasn't landed
                // yet -- same "loading, then resolve" shape as
                // hasPermissions below. Captured into a local val (not
                // read again inline) so the compiler can actually smart-cast
                // it to non-null Boolean past the null check -- a delegated
                // `by collectAsState()` property can't be smart-cast at its
                // use site otherwise.
                val loggedIn = authRepository.isLoggedInFlow.collectAsState(initial = null).value

                if (loggedIn == null) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    return@HealthSyncTheme
                }

                val navController = rememberNavController()
                val scope = rememberCoroutineScope()

                val onSignOut: () -> Unit = {
                    scope.launch {
                        // Order matters: clear sync cursors before the
                        // session is gone, and navigate last so the
                        // Login screen only appears once both are
                        // actually done -- see SyncStateStore
                        // .clearAllChangesTokens()'s doc comment for
                        // why a stale cursor under a new account would
                        // silently skip that account's own backfill.
                        authRepository.logout()
                        syncStateStore.clearAllChangesTokens()
                        navController.navigate(ROUTE_LOGIN) {
                            popUpTo(navController.graph.startDestinationId) { inclusive = true }
                        }
                    }
                }

                AuthNavHost(
                    navController = navController,
                    startDestination = if (loggedIn) ROUTE_HOME else ROUTE_LOGIN,
                    onRequestOtp = { email -> authRepository.login(email) },
                    onVerifyCode = { email, code -> authRepository.verifyCode(email, code) },
                    dashboardContent = { clientId, onBack ->
                        DashboardScreen(clientId = clientId, authRepository = authRepository, onBack = onBack)
                    },
                    profileContent = { onBack ->
                        val email by authRepository.emailFlow.collectAsState(initial = null)
                        val profileWorkInfos by WorkManager.getInstance(this@MainActivity)
                            .getWorkInfosForUniqueWorkFlow(MANUAL_SYNC_WORK_NAME)
                            .collectAsState(initial = emptyList())
                        val profileActiveWork = profileWorkInfos.firstOrNull { it.state != WorkInfo.State.CANCELLED }
                        val profileIsSyncing = profileActiveWork?.state == WorkInfo.State.ENQUEUED ||
                            profileActiveWork?.state == WorkInfo.State.RUNNING
                        val profileLastResult = profileActiveWork?.toSyncResult()
                        val profileScope = rememberCoroutineScope()
                        ProfileScreen(
                            email = email,
                            isSyncing = profileIsSyncing,
                            lastResult = profileLastResult,
                            syncStateStore = syncStateStore,
                            onSyncNow = { SyncScheduler.triggerManualSync(this@MainActivity) },
                            onForceResync = {
                                profileScope.launch {
                                    syncStateStore.clearAllChangesTokens()
                                    SyncScheduler.triggerManualSync(this@MainActivity)
                                }
                            },
                            onSignOut = {
                                profileScope.launch {
                                    authRepository.logout()
                                    syncStateStore.clearAllChangesTokens()
                                    navController.navigate(ROUTE_LOGIN) {
                                        popUpTo(navController.graph.startDestinationId) { inclusive = true }
                                    }
                                }
                            },
                            onBack = onBack,
                        )
                    },
                ) { nav ->
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

                    val email by authRepository.emailFlow.collectAsState(initial = null)

                    // Fetched once per Home composition, purely to decide
                    // what this screen shows -- a coach sees their client
                    // roster instead of the Health Connect/sync UI, since
                    // coaches don't sync their own device data through
                    // this app. Defaults to "client" on any failure (no
                    // network, RLS surprise, etc.) so a signed-in client
                    // is never stuck on a blank screen over this.
                    var userId by remember { mutableStateOf<String?>(null) }
                    var role by remember { mutableStateOf<String?>(null) }
                    var homeSummary by remember { mutableStateOf<HomeSummary?>(null) }
                    LaunchedEffect(Unit) {
                        val token = authRepository.getValidAccessToken()
                        if (token == null) {
                            // getValidAccessToken() clears the stored
                            // session itself when it was GoTrue that
                            // explicitly rejected the refresh token (see
                            // its own doc comment) -- getUserId() still
                            // returning something means this failure was
                            // just a transient one (network, a 5xx) and
                            // the session is fine, so leave the screen
                            // alone rather than sign someone out over a
                            // momentary connectivity blip.
                            if (authRepository.getUserId() == null) {
                                onSignOut()
                            }
                            return@LaunchedEffect
                        }
                        val id = authRepository.getUserId() ?: return@LaunchedEffect
                        userId = id
                        role = try {
                            ProfileRepository(SupabaseRestClient(token)).loadRole(id)
                        } catch (e: Exception) {
                            "client"
                        }
                        if (role != "coach") {
                            // loadSummary() itself already catches each of
                            // its four sub-fetches independently and falls
                            // back to empty/false per one -- this outer
                            // catch is only a last-resort guard against
                            // something failing before that point (e.g.
                            // SupabaseRestClient's own init check). A
                            // non-null empty HomeSummary is what actually
                            // lets HomeScreen tell "still loading" apart
                            // from "loaded, nothing to show."
                            homeSummary = try {
                                HomeSummaryRepository(SupabaseRestClient(token)).loadSummary(id)
                            } catch (e: Exception) {
                                null
                            }
                        }
                    }

                    if (role == "coach") {
                        CoachHomeScreen(
                            authRepository = authRepository,
                            email = email,
                            onOpenClient = nav.onOpenDashboard,
                            onSignOut = onSignOut,
                        )
                    } else {
                        HomeScreen(
                            healthConnectAvailable = healthConnectManager.isAvailable,
                            hasPermissions = hasPermissions,
                            homeSummary = homeSummary,
                            email = email,
                            onRequestPermissions = {
                                permissionLauncher.launch(healthConnectManager.requiredPermissions)
                            },
                            onInstallHealthConnect = {
                                val uri = Uri.parse("market://details?id=com.google.android.apps.healthdata")
                                startActivity(Intent(Intent.ACTION_VIEW, uri))
                            },
                            onOpenStats = { userId?.let { nav.onOpenDashboard(it) } },
                            onOpenWorkouts = { nav.onOpenComingSoon("Workouts") },
                            onOpenCalendar = { nav.onOpenComingSoon("Calendar") },
                            onOpenInbox = { nav.onOpenComingSoon("Inbox") },
                            onOpenCheckIn = { nav.onOpenComingSoon("Weekly check-in") },
                            onOpenProfile = nav.onOpenProfile,
                        )
                    }
                }
            }
        }
    }
}
