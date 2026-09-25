package com.healthsync.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.BuildConfig
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.CalendarEventItem
import com.healthsync.app.data.CalendarRepository
import com.healthsync.app.data.GoogleCalendarConnection
import com.healthsync.app.supabase.SupabaseRestClient
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * First pass, read-only: upcoming calendar_events and the client's Google
 * Calendar connection status. Deliberately does NOT implement native
 * Google OAuth -- the web dashboard's connect flow
 * (`app/api/calendar/google/{start,callback}`) is built entirely around a
 * Next.js session *cookie* (`getCurrentProfile()`), while this app
 * authenticates with a bare Supabase JWT that a browser Custom Tab has no
 * way to carry as that cookie. Making this native would mean a new,
 * JWT-aware server route plus a registered deep-link back into the app --
 * real work, not a drop-in. Until that's built, "Connect Google Calendar"
 * hands off to the web dashboard in the device's browser, where the
 * client signs in (or already has a session) and completes the connect
 * there; this screen just re-reads calendar_connections afterward like
 * everything else it shows.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(clientId: String, authRepository: AuthRepository, onBack: () -> Unit) {
    var events by remember { mutableStateOf<List<CalendarEventItem>?>(null) }
    var connection by remember { mutableStateOf<GoogleCalendarConnection?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    LaunchedEffect(clientId) {
        val token = authRepository.getValidAccessToken()
        if (token == null) {
            error = "Not signed in"
            return@LaunchedEffect
        }
        val repo = CalendarRepository(SupabaseRestClient(token))
        try {
            events = repo.getUpcomingEvents(clientId)
            connection = repo.getGoogleConnection(clientId)
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load your calendar"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Calendar") },
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
            Text("Google Calendar", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            val currentConnection = connection
            if (currentConnection != null) {
                Text(
                    "Connected as ${currentConnection.externalAccountEmail ?: "unknown account"}",
                    style = MaterialTheme.typography.bodySmall,
                )
                currentConnection.lastSyncedAt?.let { lastSynced ->
                    Text(
                        "Last synced " + DateTimeFormatter.ofPattern("MMM d, h:mm a")
                            .withZone(ZoneId.systemDefault())
                            .format(lastSynced),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(8.dp))
            } else {
                Text(
                    "Not connected",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
            }
            Button(onClick = {
                val uri = Uri.parse("${BuildConfig.DASHBOARD_URL}/dashboard/calendar")
                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            }) {
                Text(if (currentConnection != null) "Manage in browser" else "Connect Google Calendar")
            }

            Spacer(Modifier.height(24.dp))
            Text("Upcoming", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))

            val currentError = error
            val currentEvents = events
            when {
                currentError != null -> Text(currentError, color = MaterialTheme.colorScheme.error)
                currentEvents == null -> CircularProgressIndicator()
                currentEvents.isEmpty() -> Text(
                    "Nothing coming up.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> currentEvents.forEach { event -> EventCard(event) }
            }
        }
    }
}

@Composable
private fun EventCard(event: CalendarEventItem) {
    OutlinedCard(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(event.title, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (event.hasVideoCall) {
                    Text("📹", style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                DateTimeFormatter.ofPattern("MMM d, h:mm a").withZone(ZoneId.systemDefault()).format(event.startTime),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            event.location?.let { location ->
                Text(location, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
