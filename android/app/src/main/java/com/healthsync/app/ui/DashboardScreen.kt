package com.healthsync.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.DailySteps
import com.healthsync.app.data.DashboardData
import com.healthsync.app.data.HealthDataRepository
import com.healthsync.app.data.SleepNight
import com.healthsync.app.supabase.SupabaseRestClient

/**
 * Basic data-viz screen: today's stats, a two-week steps/sleep bar
 * chart, and a short recent-workouts list. Reused for both a client
 * viewing their own data (onOpenDashboard(myUserId) from HomeScreen)
 * and a coach viewing one of their clients (onOpenClient from
 * CoachHomeScreen) -- [clientId] is whichever profile id got navigated
 * here with, and RLS on the underlying tables is what actually decides
 * whether the signed-in user is allowed to see it either way.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    clientId: String,
    authRepository: AuthRepository,
    onBack: () -> Unit,
) {
    var data by remember { mutableStateOf<DashboardData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(clientId) {
        val token = authRepository.getValidAccessToken()
        if (token == null) {
            error = "Not signed in"
            return@LaunchedEffect
        }
        try {
            data = HealthDataRepository(SupabaseRestClient(token)).loadDashboard(clientId)
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load this data"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Stats") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("←", style = MaterialTheme.typography.headlineSmall)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            val currentError = error
            val currentData = data
            when {
                currentError != null -> Text(currentError, color = MaterialTheme.colorScheme.error)
                currentData == null -> CircularProgressIndicator()
                else -> {
                    StatRow("Steps today", currentData.stepsToday.toString())
                    StatRow("Avg heart rate (7d)", currentData.avgHeartRate7d?.let { "$it bpm" } ?: "—")
                    StatRow("Last sleep", currentData.lastSleepHours?.let { "${it}h" } ?: "—")
                    StatRow("Recent workouts", currentData.recentWorkouts.size.toString())

                    Spacer(Modifier.height(20.dp))
                    Text("Steps, last 14 days", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    StepsBarChart(currentData.dailySteps)

                    Spacer(Modifier.height(20.dp))
                    Text("Sleep, last 14 days", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    SleepBarChart(currentData.sleepNights)

                    Spacer(Modifier.height(20.dp))
                    Text("Recent workouts", fontWeight = FontWeight.Bold)
                    if (currentData.recentWorkouts.isEmpty()) {
                        Text("No finished workouts yet.", style = MaterialTheme.typography.bodySmall)
                    } else {
                        currentData.recentWorkouts.forEach { workout ->
                            ListItem(headlineContent = { Text(workout.completedAt.take(10)) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun StepsBarChart(data: List<DailySteps>) {
    if (data.isEmpty()) {
        Text("No steps synced yet.", style = MaterialTheme.typography.bodySmall)
        return
    }
    val maxCount = (data.maxOfOrNull { it.count } ?: 0L).coerceAtLeast(1L)
    Column {
        data.forEach { day ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    day.date.substring(5),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.width(40.dp),
                )
                Box(modifier = Modifier.weight(1f).height(14.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(day.count.toFloat() / maxCount.toFloat())
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.primary),
                    )
                }
                Text(
                    day.count.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun SleepBarChart(data: List<SleepNight>) {
    if (data.isEmpty()) {
        Text("No sleep synced yet.", style = MaterialTheme.typography.bodySmall)
        return
    }
    val maxHours = (data.maxOfOrNull { it.hours } ?: 0.0).coerceAtLeast(0.1)
    Column {
        data.forEach { night ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    night.date.substring(5),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.width(40.dp),
                )
                Box(modifier = Modifier.weight(1f).height(14.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth((night.hours / maxHours).toFloat())
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.secondary),
                    )
                }
                Text(
                    "${night.hours}h",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}
