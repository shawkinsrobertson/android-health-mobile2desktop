package com.healthsync.app.ui

import android.app.DatePickerDialog
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.BuildConfig
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.CalendarItem
import com.healthsync.app.data.CalendarItemKind
import com.healthsync.app.data.CalendarRepository
import com.healthsync.app.data.GoogleCalendarConnection
import com.healthsync.app.supabase.SupabaseRestClient
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val UPCOMING_WINDOW_DAYS = 30L

/**
 * A client's own calendar: coaching calls, workouts/documents scheduled
 * via `assignments.scheduled_date`, and check-in occurrences, merged by
 * `CalendarRepository.getCalendarItems` -- the Android counterpart to
 * the web dashboard's CalendarCard (`dashboard/components/calendar/
 * CalendarCard.tsx`). Deliberately a plain date-grouped agenda list
 * rather than a month/week grid -- there's no touch drag-and-drop here
 * (see the tap-to-reschedule note below), so a grid buys nothing a list
 * doesn't already give for free, and a list is far simpler to get right
 * on a phone-width screen.
 *
 * Tapping a workout opens it in this app's own WorkoutScreen (via
 * [onOpenWorkout], since that screen is parameterized by a specific
 * assignment now -- see WorkoutScreen's own doc comment). Tapping a
 * document or check-in hands off to the web dashboard in the device's
 * browser, the same established pattern this screen's own Google
 * Calendar connect already uses below -- this app has no native
 * dynamic-form renderer or file-upload pipeline (the web document/
 * check-in forms support six field types including file uploads;
 * building and maintaining a second implementation of that here is a
 * substantial feature in its own right, not a small addition alongside
 * today's other three items, and flagged as a follow-up in PLANNING.md
 * rather than attempted as a half-native version of it).
 *
 * Reschedule is a small pencil icon on a workout/document row (not the
 * row's own tap target, which already means "open/complete it") --
 * opens the platform `DatePickerDialog` and calls the same
 * `reschedule_assignment` RPC the web dashboard's drag-and-drop uses.
 * Still does NOT implement native Google OAuth -- see this screen's
 * original doc comment on why that specific flow stays web-only.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(
    clientId: String,
    authRepository: AuthRepository,
    onBack: () -> Unit,
    onOpenWorkout: (assignedWorkoutId: String) -> Unit,
) {
    var items by remember { mutableStateOf<List<CalendarItem>?>(null) }
    var connection by remember { mutableStateOf<GoogleCalendarConnection?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var rescheduleError by remember { mutableStateOf<String?>(null) }
    var repository by remember { mutableStateOf<CalendarRepository?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    suspend fun reload(repo: CalendarRepository) {
        val today = LocalDate.now(ZoneId.systemDefault())
        items = repo.getCalendarItems(clientId, today, today.plusDays(UPCOMING_WINDOW_DAYS))
    }

    LaunchedEffect(clientId) {
        val token = authRepository.getValidAccessToken()
        if (token == null) {
            error = "Not signed in"
            return@LaunchedEffect
        }
        val repo = CalendarRepository(SupabaseRestClient(token))
        repository = repo
        try {
            reload(repo)
            connection = repo.getGoogleConnection(clientId)
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load your calendar"
        }
    }

    fun openInBrowser(path: String) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.DASHBOARD_URL}$path")))
    }

    fun handleSelect(item: CalendarItem) {
        when (item.kind) {
            CalendarItemKind.CALL -> Unit // Read-only here -- see this screen's doc comment.
            CalendarItemKind.WORKOUT -> item.assignmentId?.let(onOpenWorkout)
            CalendarItemKind.DOCUMENT -> item.assignmentId?.let { openInBrowser("/client/documents/$it") }
            // Always the current week's check-in regardless of which
            // occurrence was tapped -- same simplification the web
            // dashboard's own CalendarCard makes (see its handleSelectItem
            // doc comment): there's no per-occurrence check-in view
            // anywhere in this app today.
            CalendarItemKind.CHECK_IN -> openInBrowser("/client/check-in")
        }
    }

    fun handleReschedule(item: CalendarItem) {
        val assignmentId = item.assignmentId ?: return
        val repo = repository ?: return
        val initial = item.date
        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val newDate = LocalDate.of(year, month + 1, dayOfMonth)
                scope.launch {
                    rescheduleError = null
                    try {
                        repo.rescheduleAssignment(assignmentId, newDate)
                        reload(repo)
                    } catch (e: Exception) {
                        rescheduleError = e.message ?: "Couldn't move it to that day."
                    }
                }
            },
            initial.year,
            initial.monthValue - 1,
            initial.dayOfMonth,
        ).show()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Calendar") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        containerColor = Color.Transparent,
        // contentColor is explicit because Transparent isn't a role
        // Surface/Scaffold can map to an "on-X" text color on its own --
        // see HomeScreen.kt's Surface for the fuller explanation of this
        // exact failure mode (every Text without its own explicit color
        // silently renders black/unreadable instead of theme-correct).
        contentColor = MaterialTheme.colorScheme.onBackground,
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
            Button(
                modifier = Modifier.widthIn(min = 220.dp),
                onClick = { openInBrowser("/dashboard/calendar") },
            ) {
                Text(if (currentConnection != null) "Manage in browser" else "Connect Google Calendar")
            }

            Spacer(Modifier.height(20.dp))
            Text("Upcoming", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))

            rescheduleError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
            }

            val currentError = error
            val currentItems = items
            when {
                currentError != null -> Text(currentError, color = MaterialTheme.colorScheme.error)
                currentItems == null -> CircularProgressIndicator()
                currentItems.isEmpty() -> Text(
                    "Nothing coming up.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> {
                    val byDate = currentItems
                        .sortedWith(compareBy({ it.date }, { it.call?.startTime ?: Instant.MAX }))
                        .groupBy { it.date }
                    byDate.forEach { (date, dayItems) ->
                        Text(
                            DateTimeFormatter.ofPattern("EEE, MMM d").format(date),
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 10.dp, bottom = 4.dp),
                        )
                        dayItems.forEach { item ->
                            ItemCard(item = item, onSelect = ::handleSelect, onReschedule = ::handleReschedule)
                        }
                    }
                }
            }
        }
    }
}

private fun kindColor(kind: CalendarItemKind): Int = when (kind) {
    CalendarItemKind.CALL -> android.graphics.Color.parseColor("#3B82F6")
    CalendarItemKind.WORKOUT -> android.graphics.Color.parseColor("#22C55E")
    CalendarItemKind.DOCUMENT -> android.graphics.Color.parseColor("#F59E0B")
    CalendarItemKind.CHECK_IN -> android.graphics.Color.parseColor("#A855F7")
}

@Composable
private fun ItemCard(item: CalendarItem, onSelect: (CalendarItem) -> Unit, onReschedule: (CalendarItem) -> Unit) {
    val clickable = item.kind != CalendarItemKind.CALL
    OutlinedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .let { if (clickable) it.clickable { onSelect(item) } else it },
        elevation = CardDefaults.outlinedCardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(Color(kindColor(item.kind))),
            )
            Column(Modifier.weight(1f).padding(start = 8.dp)) {
                Text(
                    (if (item.completed) "✓ " else "") + item.title,
                    fontWeight = FontWeight.Medium,
                )
                Text(itemSubtitle(item), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (item.hasVideoCall) {
                Text("📹", style = MaterialTheme.typography.bodyMedium)
            }
            if (item.kind == CalendarItemKind.WORKOUT || item.kind == CalendarItemKind.DOCUMENT) {
                IconButton(onClick = { onReschedule(item) }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Reschedule")
                }
            }
        }
    }
}

private fun itemSubtitle(item: CalendarItem): String = when (item.kind) {
    CalendarItemKind.CALL -> item.call?.let {
        DateTimeFormatter.ofPattern("h:mm a").withZone(ZoneId.systemDefault()).format(it.startTime)
    } ?: "Call"
    CalendarItemKind.WORKOUT -> "Workout"
    CalendarItemKind.DOCUMENT -> "Document"
    CalendarItemKind.CHECK_IN -> "Check-in"
}
