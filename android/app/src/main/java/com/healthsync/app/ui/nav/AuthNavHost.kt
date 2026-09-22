package com.healthsync.app.ui.nav

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.healthsync.app.ui.LoginScreen
import com.healthsync.app.ui.VerifyCodeScreen

const val ROUTE_LOGIN = "login"
const val ROUTE_HOME = "home"
private const val ROUTE_VERIFY_CODE = "verify_code/{email}"
private const val ROUTE_DASHBOARD = "dashboard/{clientId}"

private fun verifyCodeRoute(email: String) = "verify_code/${Uri.encode(email)}"
private fun dashboardRoute(clientId: String) = "dashboard/${Uri.encode(clientId)}"

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
    homeContent: @Composable (onOpenDashboard: (clientId: String) -> Unit) -> Unit,
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
            homeContent(onOpenDashboard = { clientId -> navController.navigate(dashboardRoute(clientId)) })
        }
        composable(
            ROUTE_DASHBOARD,
            arguments = listOf(navArgument("clientId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val clientId = Uri.decode(backStackEntry.arguments?.getString("clientId") ?: "")
            dashboardContent(clientId) { navController.popBackStack() }
        }
    }
}
