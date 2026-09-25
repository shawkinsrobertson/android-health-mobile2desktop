package com.healthsync.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.healthsync.app.R
import com.healthsync.app.data.HomeSummary
import com.healthsync.app.ui.home.NotificationShade
import com.healthsync.app.ui.home.ShadeContent
import com.healthsync.app.ui.home.StreakHeatmap
import com.healthsync.app.ui.nav.NavDestination
import com.healthsync.app.ui.nav.SlideOutNav

// Sync (manual + force re-sync + per-type status) lives entirely on
// ProfileScreen now, reachable from the slide-out nav -- this screen is
// purely the shade + streak + nav, no data-management controls.
@Composable
fun HomeScreen(
    healthConnectAvailable: Boolean,
    hasPermissions: Boolean?,
    homeSummary: HomeSummary?,
    email: String?,
    onRequestPermissions: () -> Unit,
    onInstallHealthConnect: () -> Unit,
    onOpenStats: () -> Unit,
    onOpenWorkouts: () -> Unit,
    onOpenCalendar: () -> Unit,
    onOpenInbox: () -> Unit,
    onOpenCheckIn: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    // Surface (not a bare Box/Column) is load-bearing here, not
    // decorative -- Scaffold used to wrap this screen in one implicitly,
    // which (a) painted colorScheme.background behind everything and (b)
    // set LocalContentColor so every plain Text() picks up the right
    // on-background color automatically. Dropping Scaffold for the
    // custom top-shade layout lost both: without this, the page falls
    // back to the raw (light) window background with plain black text,
    // regardless of which theme is actually active -- exactly what
    // showed up testing in dark mode, where the shade/heatmap (which set
    // their own colors explicitly off MaterialTheme.colorScheme) looked
    // right while the background and greeting text didn't move at all.
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        // Window-inset padding is a second, separate thing Scaffold used
        // to give us for free -- without this, content draws straight
        // under the status bar and the slide-out nav sits half-hidden
        // behind the system navigation bar on edge-to-edge devices
        // (targetSdk 36 enforces edge-to-edge regardless of any explicit
        // opt-in).
        Box(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
            Column(modifier = Modifier.fillMaxSize()) {
                if (homeSummary != null) {
                    NotificationShade(
                        content = ShadeContent(
                            hasUnreadMessages = homeSummary.hasUnreadMessages,
                            upcomingEvents = homeSummary.upcomingEvents,
                            checkInDue = homeSummary.checkInDue,
                            onOpenInbox = onOpenInbox,
                            onOpenCalendar = onOpenCalendar,
                            onOpenCheckIn = onOpenCheckIn,
                        ),
                    )
                }

                Column(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                ) {
                    Text(
                        email?.let { "Hey, $it" } ?: "Hey",
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Spacer(Modifier.height(20.dp))

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
                            Text("This week", style = MaterialTheme.typography.labelLarge)
                            Spacer(Modifier.height(8.dp))
                            if (homeSummary != null) {
                                StreakHeatmap(weekDays = homeSummary.weekDays)
                            } else {
                                CircularProgressIndicator()
                            }
                        }
                    }

                    // Bottom padding so the last item isn't hidden behind
                    // the slide-out nav anchored over this column.
                    Spacer(Modifier.height(72.dp))
                }
            }

            SlideOutNav(
                destinations = listOf(
                    NavDestination("Stats", iconRes = R.drawable.ic_stats, onClick = onOpenStats),
                    NavDestination("Workouts", iconRes = R.drawable.ic_dumbbell, onClick = onOpenWorkouts),
                    NavDestination("Calendar", iconRes = R.drawable.ic_calendar, onClick = onOpenCalendar),
                    NavDestination("Inbox", iconRes = R.drawable.ic_inbox, onClick = onOpenInbox),
                    // No profile/settings icon in the current icon set --
                    // plain-text fallback until one's added (see NavDestination).
                    NavDestination("Profile", glyph = "👤", onClick = onOpenProfile),
                ),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(16.dp),
            )
        }
    }
}
