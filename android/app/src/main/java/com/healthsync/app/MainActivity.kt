package com.healthsync.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
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
import com.healthsync.app.ui.CalendarScreen
import com.healthsync.app.ui.CoachHomeScreen
import com.healthsync.app.ui.DashboardScreen
import com.healthsync.app.ui.HomeScreen
import com.healthsync.app.ui.InboxScreen
import com.healthsync.app.ui.ProfileScreen
import com.healthsync.app.ui.WorkoutScreen
import com.healthsync.app.ui.nav.AuthNavHost
import com.healthsync.app.ui.nav.NavDestination
import com.healthsync.app.ui.nav.ROUTE_HOME
import com.healthsync.app.ui.nav.ROUTE_LOGIN
import com.healthsync.app.ui.nav.ROUTE_PROFILE
import com.healthsync.app.ui.nav.SlideOutNav
import com.healthsync.app.ui.nav.calendarRoute
import com.healthsync.app.ui.nav.dashboardRoute
import com.healthsync.app.ui.nav.inboxRoute
import com.healthsync.app.ui.nav.workoutRoute
import com.healthsync.app.ui.theme.HealthSyncTheme
import com.healthsync.app.ui.theme.dashboardBackgroundBrush
import kotlinx.coroutines.launch

// Standard "persistent nav" navigation pattern -- without this, bouncing
// between top-level destinations via the slide-out nav (Calendar ->
// Inbox -> Calendar -> ... without ever returning to Home first) grows
// the back stack unboundedly, since each hop would otherwise just be a
// plain push. popUpTo(ROUTE_HOME) keeps Home as the floor every such hop
// returns to on system back; saveState/restoreState keep each
// destination's own scroll position etc. intact across hops rather than
// resetting it every time.
private fun NavHostController.navigateTopLevel(route: String) {
    navigate(route) {
        launchSingleTop = true
        popUpTo(ROUTE_HOME) { saveState = true }
        restoreState = true
    }
}

// 80dp beyond the normal 16dp edge padding -- enough to clear a
// bottom-pinned OutlinedTextField + Button row like InboxScreen's
// composer (≈88dp tall) without needing per-screen adjustments.
private val NAV_BOTTOM_CLEARANCE = 80.dp

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
                // The one place the app's background is painted -- every
                // screen's own Scaffold/Surface sets containerColor/color
                // to Transparent so this shows through underneath instead
                // of each screen re-painting a flat color over it.
                Box(Modifier.fillMaxSize().background(dashboardBackgroundBrush())) {
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
                        return@Box
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

                // Hoisted here, above AuthNavHost, rather than inside
                // homeContent's own trailing lambda below -- that lambda
                // is only composed while ROUTE_HOME is the active
                // destination, so state declared inside it (as all of
                // this used to be) got torn down and re-fetched from
                // scratch every single time a client navigated away from
                // Home and back. Living here instead means the fetch
                // below runs once per signed-in session, and -- the
                // actual reason it moved -- userId/role are available to
                // build the persistent nav further down regardless of
                // which screen is currently showing, not just Home.
                var userId by remember { mutableStateOf<String?>(null) }
                var role by remember { mutableStateOf<String?>(null) }
                var displayName by remember { mutableStateOf<String?>(null) }
                var homeSummary by remember { mutableStateOf<HomeSummary?>(null) }
                // rememberSaveable (not plain remember) so the nav's
                // open/closed state also survives process death
                // (rotation, the system reclaiming a backgrounded app),
                // not just in-session navigation between screens.
                var navExpanded by rememberSaveable { mutableStateOf(false) }

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
                        displayName = try {
                            ProfileRepository(SupabaseRestClient(token)).loadDisplayName(id)
                        } catch (e: Exception) {
                            null
                        }
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

                AuthNavHost(
                    navController = navController,
                    startDestination = if (loggedIn) ROUTE_HOME else ROUTE_LOGIN,
                    onRequestOtp = { email -> authRepository.login(email) },
                    onVerifyCode = { email, code -> authRepository.verifyCode(email, code) },
                    dashboardContent = { clientId, onBack ->
                        DashboardScreen(clientId = clientId, authRepository = authRepository, onBack = onBack)
                    },
                    workoutContent = { clientId, onBack ->
                        WorkoutScreen(clientId = clientId, authRepository = authRepository, onBack = onBack)
                    },
                    calendarContent = { clientId, onBack ->
                        CalendarScreen(clientId = clientId, authRepository = authRepository, onBack = onBack)
                    },
                    inboxContent = { clientId, onBack ->
                        InboxScreen(clientId = clientId, authRepository = authRepository, onBack = onBack)
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
                            authRepository = authRepository,
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

                    // userId/role/displayName/homeSummary are hoisted
                    // above AuthNavHost now (see the comment up there) --
                    // this just reads them. role == null (still loading)
                    // falls through to HomeScreen same as role == "client"
                    // does, rather than a third branch here, since
                    // HomeScreen already has its own "still loading"
                    // states (hasPermissions == null, homeSummary == null)
                    // to show meanwhile.
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
                            displayName = displayName,
                            onRequestPermissions = {
                                permissionLauncher.launch(healthConnectManager.requiredPermissions)
                            },
                            onInstallHealthConnect = {
                                val uri = Uri.parse("market://details?id=com.google.android.apps.healthdata")
                                startActivity(Intent(Intent.ACTION_VIEW, uri))
                            },
                            onOpenWorkouts = { userId?.let { nav.onOpenWorkout(it) } },
                            onOpenCalendar = { userId?.let { nav.onOpenCalendar(it) } },
                            onOpenInbox = { userId?.let { nav.onOpenInbox(it) } },
                            onOpenCheckIn = { nav.onOpenComingSoon("Weekly check-in") },
                        )
                    }
                }

                // Persistent slide-out nav -- rendered once, above the
                // whole nav graph (a sibling of AuthNavHost in this same
                // Box, drawn on top of it), instead of nested inside
                // HomeScreen the way it used to be. That meant it only
                // ever existed while Home itself was the active screen --
                // every other destination (Dashboard/Workout/Calendar/
                // Inbox/Profile) had no nav at all, not just a reset one.
                // Living here instead makes it reachable, and keeps its
                // expanded/collapsed state, from every one of those
                // screens too. Coach accounts never had this nav
                // (CoachHomeScreen has its own client-list UI instead) --
                // gating on role == "client" preserves that, and also
                // naturally keeps it off Login/VerifyCode, since role is
                // still null pre-auth.
                if (role == "client" && userId != null) {
                    val id = userId!!
                    SlideOutNav(
                        destinations = listOf(
                            NavDestination(
                                "Home",
                                iconRes = R.drawable.ic_home,
                                onClick = { navController.navigateTopLevel(ROUTE_HOME) },
                            ),
                            NavDestination(
                                "Workouts",
                                iconRes = R.drawable.ic_dumbbell,
                                onClick = { navController.navigateTopLevel(workoutRoute(id)) },
                            ),
                            NavDestination(
                                "Calendar",
                                iconRes = R.drawable.ic_calendar,
                                onClick = { navController.navigateTopLevel(calendarRoute(id)) },
                            ),
                            NavDestination(
                                "Inbox",
                                iconRes = R.drawable.ic_inbox,
                                onClick = { navController.navigateTopLevel(inboxRoute(id)) },
                            ),
                            NavDestination(
                                "Stats",
                                iconRes = R.drawable.ic_stats,
                                onClick = { navController.navigateTopLevel(dashboardRoute(id)) },
                            ),
                            NavDestination(
                                "Profile",
                                iconRes = R.drawable.ic_profile_placeholder,
                                tinted = false,
                                onClick = { navController.navigateTopLevel(ROUTE_PROFILE) },
                            ),
                        ),
                        expanded = navExpanded,
                        onToggleExpanded = { navExpanded = !navExpanded },
                        // Extra bottom clearance beyond the usual 16dp --
                        // on Inbox, the nav's own reserved touch width
                        // (see SlideOutNav's expandedWidth comment) put
                        // its collapsed toggle right on top of the
                        // composer's Send button, which sits at the same
                        // navigation-bar-hugging height otherwise. Lifting
                        // the whole nav up clears any screen's own
                        // bottom-pinned controls, not just Inbox's.
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .navigationBarsPadding()
                            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = NAV_BOTTOM_CLEARANCE),
                    )
                }
                }
            }
        }
    }
}
