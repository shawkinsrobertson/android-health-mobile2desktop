package com.healthsync.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.healthsync.app.data.HomeSummary
import com.healthsync.app.sync.SyncResult
import com.healthsync.app.ui.home.NotificationShade
import com.healthsync.app.ui.home.ShadeContent
import com.healthsync.app.ui.home.StreakHeatmap
import com.healthsync.app.ui.nav.NavDestination
import com.healthsync.app.ui.nav.SlideOutNav

@Composable
fun HomeScreen(
    healthConnectAvailable: Boolean,
    hasPermissions: Boolean?,
    isSyncing: Boolean,
    lastResult: SyncResult?,
    homeSummary: HomeSummary?,
    email: String?,
    onRequestPermissions: () -> Unit,
    onInstallHealthConnect: () -> Unit,
    onSyncNow: () -> Unit,
    onViewMyData: () -> Unit,
    onOpenWorkouts: () -> Unit,
    onOpenCalendar: () -> Unit,
    onOpenInbox: () -> Unit,
    onOpenCheckIn: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
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

                        Spacer(Modifier.height(24.dp))
                        Button(onClick = onSyncNow, enabled = !isSyncing) {
                            Text(if (isSyncing) "Syncing…" else "Sync now")
                        }
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = onViewMyData) {
                            Text("View my data")
                        }

                        lastResult?.let { result ->
                            Spacer(Modifier.height(12.dp))
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
                        }
                    }
                }

                // Bottom padding so the last item isn't hidden behind the
                // slide-out nav anchored over this column.
                Spacer(Modifier.height(72.dp))
            }
        }

        SlideOutNav(
            destinations = listOf(
                NavDestination("Workouts", "🏋", onOpenWorkouts), // 🏋
                NavDestination("Calendar", "📅", onOpenCalendar), // 📅
                NavDestination("Inbox", "✉", onOpenInbox), // ✉
                NavDestination("Profile", "👤", onOpenProfile), // 👤
            ),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp),
        )
    }
}
