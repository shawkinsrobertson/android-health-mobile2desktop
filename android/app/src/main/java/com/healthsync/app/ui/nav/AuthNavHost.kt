package com.healthsync.app.ui.nav

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.healthsync.app.ui.ComingSoonScreen
import com.healthsync.app.ui.LoginScreen
import com.healthsync.app.ui.VerifyCodeScreen

const val ROUTE_LOGIN = "login"
const val ROUTE_HOME = "home"
const val ROUTE_PROFILE = "profile"
private const val ROUTE_VERIFY_CODE = "verify_code/{email}"
private const val ROUTE_DASHBOARD = "dashboard/{clientId}"
private const val ROUTE_WORKOUT = "workout/{clientId}"
private const val ROUTE_CALENDAR = "calendar/{clientId}"
private const val ROUTE_INBOX = "inbox/{clientId}"
private const val ROUTE_COMING_SOON = "coming_soon/{title}"

private fun verifyCodeRoute(email: String) = "verify_code/${Uri.encode(email)}"
private fun dashboardRoute(clientId: String) = "dashboard/${Uri.encode(clientId)}"
private fun workoutRoute(clientId: String) = "workout/${Uri.encode(clientId)}"
private fun calendarRoute(clientId: String) = "calendar/${Uri.encode(clientId)}"
private fun inboxRoute(clientId: String) = "inbox/${Uri.encode(clientId)}"
fun comingSoonRoute(title: String) = "coming_soon/${Uri.encode(title)}"

// Bundled rather than four positional lambdas -- HomeScreen's SlideOutNav
// and NotificationShade both need to reach several of these destinations,
// and a caller composing homeContent shouldn't have to thread each one
// through by position.
class HomeNavCallbacks(
    val onOpenDashboard: (clientId: String) -> Unit,
    val onOpenProfile: () -> Unit,
    val onOpenWorkout: (clientId: String) -> Unit,
    val onOpenCalendar: (clientId: String) -> Unit,
    val onOpenInbox: (clientId: String) -> Unit,
    val onOpenComingSoon: (title: String) -> Unit,
)

/**
 * Login -> VerifyCode -> Home, with Home able to push a Dashboard screen
 * (a client viewing their own data, or a coach viewing one client's --
 * see `homeContent`'s `onOpenDashboard`). [startDestination] is decided
 * by the caller ([com.healthsync.app.MainActivity]) from the current
 * session state *before* this is ever composed, so this graph itself
 * never needs to react to login state changing after the fact --
 * sign-out navigates explicitly instead (see `HomeScreen`'s
 * `onSignOut`, wired in `MainActivity`).
 */
@Composable
fun AuthNavHost(
    navController: NavHostController,
    startDestination: String,
    onRequestOtp: suspend (email: String) -> Unit,
    onVerifyCode: suspend (email: String, code: String) -> Unit,
    dashboardContent: @Composable (clientId: String, onBack: () -> Unit) -> Unit,
    profileContent: @Composable (onBack: () -> Unit) -> Unit,
    workoutContent: @Composable (clientId: String, onBack: () -> Unit) -> Unit,
    calendarContent: @Composable (clientId: String, onBack: () -> Unit) -> Unit,
    inboxContent: @Composable (clientId: String, onBack: () -> Unit) -> Unit,
    homeContent: @Composable (nav: HomeNavCallbacks) -> Unit,
) {
    NavHost(navController = navController, startDestination = startDestination) {
        composable(ROUTE_LOGIN) {
            LoginScreen(
                onRequestOtp = onRequestOtp,
                onCodeSent = { email -> navController.navigate(verifyCodeRoute(email)) },
            )
        }
        composable(
            ROUTE_VERIFY_CODE,
            arguments = listOf(navArgument("email") { type = NavType.StringType }),
        ) { backStackEntry ->
            val email = Uri.decode(backStackEntry.arguments?.getString("email") ?: "")
            VerifyCodeScreen(
                email = email,
                onVerifyCode = onVerifyCode,
                onResendCode = onRequestOtp,
                onVerified = {
                    navController.navigate(ROUTE_HOME) {
                        popUpTo(ROUTE_LOGIN) { inclusive = true }
                    }
                },
            )
        }
        composable(ROUTE_HOME) {
            homeContent(
                HomeNavCallbacks(
                    onOpenDashboard = { clientId -> navController.navigate(dashboardRoute(clientId)) },
                    onOpenProfile = { navController.navigate(ROUTE_PROFILE) },
                    onOpenWorkout = { clientId -> navController.navigate(workoutRoute(clientId)) },
                    onOpenCalendar = { clientId -> navController.navigate(calendarRoute(clientId)) },
                    onOpenInbox = { clientId -> navController.navigate(inboxRoute(clientId)) },
                    onOpenComingSoon = { title -> navController.navigate(comingSoonRoute(title)) },
                ),
            )
        }
        composable(
            ROUTE_DASHBOARD,
            arguments = listOf(navArgument("clientId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val clientId = Uri.decode(backStackEntry.arguments?.getString("clientId") ?: "")
            dashboardContent(clientId) { navController.popBackStack() }
        }
        composable(ROUTE_PROFILE) {
            profileContent { navController.popBackStack() }
        }
        composable(
            ROUTE_WORKOUT,
            arguments = listOf(navArgument("clientId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val clientId = Uri.decode(backStackEntry.arguments?.getString("clientId") ?: "")
            workoutContent(clientId) { navController.popBackStack() }
        }
        composable(
            ROUTE_CALENDAR,
            arguments = listOf(navArgument("clientId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val clientId = Uri.decode(backStackEntry.arguments?.getString("clientId") ?: "")
            calendarContent(clientId) { navController.popBackStack() }
        }
        composable(
            ROUTE_INBOX,
            arguments = listOf(navArgument("clientId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val clientId = Uri.decode(backStackEntry.arguments?.getString("clientId") ?: "")
            inboxContent(clientId) { navController.popBackStack() }
        }
        composable(
            ROUTE_COMING_SOON,
            arguments = listOf(navArgument("title") { type = NavType.StringType }),
        ) { backStackEntry ->
            val title = Uri.decode(backStackEntry.arguments?.getString("title") ?: "")
            ComingSoonScreen(title = title, onBack = { navController.popBackStack() })
        }
    }
}
