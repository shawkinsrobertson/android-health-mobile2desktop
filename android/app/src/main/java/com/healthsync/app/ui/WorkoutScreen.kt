package com.healthsync.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.AssignedWorkout
import com.healthsync.app.data.AssignedWorkoutExercise
import com.healthsync.app.data.SessionExercise
import com.healthsync.app.data.SessionSet
import com.healthsync.app.data.WorkoutRepository
import com.healthsync.app.data.WorkoutSession
import com.healthsync.app.supabase.SupabaseRestClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

private data class WorkoutUiState(
    val workout: AssignedWorkout,
    val exercises: List<AssignedWorkoutExercise>,
    val session: WorkoutSession?,
    // Keyed by assigned_workout_exercise_id / session_exercise_id respectively.
    val sessionExercises: Map<String, SessionExercise>,
    val setsByExercise: Map<String, List<SessionSet>>,
)

/**
 * "Today's Workout": browse -> Start -> per-set logging, one screen with
 * two states rather than a separate detail + session route -- both
 * mockups share the same header, and a client re-opening this screen
 * mid-workout should land straight back in the logging view, not a
 * "start again?" prompt. [clientId] is the signed-in client's own id
 * (Workouts is a client-only SlideOutNav destination, unlike Stats which
 * a coach can also open for one of their clients).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutScreen(clientId: String, authRepository: AuthRepository, onBack: () -> Unit) {
    var state by remember { mutableStateOf<WorkoutUiState?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var repository by remember { mutableStateOf<WorkoutRepository?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(clientId) {
        loading = true
        val token = authRepository.getValidAccessToken()
        if (token == null) {
            error = "Not signed in"
            loading = false
            return@LaunchedEffect
        }
        val repo = WorkoutRepository(SupabaseRestClient(token))
        repository = repo
        try {
            val workout = repo.getTodaysWorkout(clientId)
            if (workout == null) {
                error = "No workout assigned yet."
            } else {
                val exercises = repo.getWorkoutExercises(workout.id)
                val session = repo.findActiveSession(clientId, workout.id)
                state = if (session != null) {
                    val (exerciseRows, setRows) = repo.ensureSessionExercises(session.id, clientId, workout.coachId, exercises)
                    WorkoutUiState(workout, exercises, session, exerciseRows, setRows)
                } else {
                    WorkoutUiState(workout, exercises, null, emptyMap(), emptyMap())
                }
            }
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load this workout"
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Today's Workout") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("←", style = MaterialTheme.typography.headlineSmall)
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            val currentError = error
            val currentState = state
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                currentError != null -> Text(
                    currentError,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                currentState == null -> Unit
                currentState.session != null && currentState.session.completedAt == null -> InProgressWorkout(
                    repository = repository!!,
                    scope = scope,
                    state = currentState,
                    onStateChange = { state = it },
                    onFinished = onBack,
                )
                else -> NotStartedWorkout(
                    state = currentState,
                    onStart = {
                        scope.launch {
                            val repo = repository ?: return@launch
                            val session = repo.startSession(clientId, currentState.workout.coachId, currentState.workout.id)
                            val (exerciseRows, setRows) = repo.ensureSessionExercises(
                                session.id, clientId, currentState.workout.coachId, currentState.exercises,
                            )
                            state = currentState.copy(session = session, sessionExercises = exerciseRows, setsByExercise = setRows)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun NotStartedWorkout(state: WorkoutUiState, onStart: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                state.workout.name,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Button(onClick = onStart) { Text("Start workout") }
        }
        Spacer(Modifier.height(20.dp))
        state.exercises.forEach { exercise ->
            OutlinedCard(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(exercise.name, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(2.dp))
                    Text(
                        exercise.prescriptionSummary(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun InProgressWorkout(
    repository: WorkoutRepository,
    scope: CoroutineScope,
    state: WorkoutUiState,
    onStateChange: (WorkoutUiState) -> Unit,
    onFinished: () -> Unit,
) {
    val session = state.session!!
    var expandedExerciseId by remember(state.workout.id) {
        mutableStateOf(
            state.exercises.firstOrNull { exercise ->
                val sessionExerciseId = state.sessionExercises[exercise.id]?.id
                val sets = state.setsByExercise[sessionExerciseId].orEmpty()
                sets.isEmpty() || !sets.all { it.completed }
            }?.id,
        )
    }

    // Recomputed once a second while the timer is actually running --
    // elapsedSeconds() is always derived fresh from session.startedAt/
    // totalPausedSeconds/pausedAt, never accumulated locally; this state
    // only exists so the Text below has something to actually read and
    // recompose on (a plain unread counter wouldn't trigger anything).
    var elapsedDisplaySeconds by remember(session.startedAt) { mutableStateOf(elapsedSeconds(session)) }
    LaunchedEffect(session.pausedAt, session.startedAt, session.totalPausedSeconds) {
        while (session.pausedAt == null && session.startedAt != null) {
            elapsedDisplaySeconds = elapsedSeconds(session)
            delay(1000)
        }
        elapsedDisplaySeconds = elapsedSeconds(session)
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text(
                formatElapsed(elapsedDisplaySeconds),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                state.workout.name,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = {
                scope.launch {
                    if (session.pausedAt == null) {
                        repository.pauseTimer(session.id)
                        onStateChange(state.copy(session = session.copy(pausedAt = Instant.now().toString())))
                    } else {
                        repository.resumeTimer(session.id, session.pausedAt, session.totalPausedSeconds)
                        val pausedSeconds = java.time.Duration.between(Instant.parse(session.pausedAt), Instant.now()).seconds.coerceAtLeast(0)
                        onStateChange(
                            state.copy(
                                session = session.copy(
                                    pausedAt = null,
                                    totalPausedSeconds = session.totalPausedSeconds + pausedSeconds.toInt(),
                                ),
                            ),
                        )
                    }
                }
            }) {
                Text(if (session.pausedAt == null) "Pause" else "Resume")
            }
            Spacer(Modifier.width(8.dp))
            Button(onClick = {
                scope.launch {
                    repository.finishSession(session.id)
                    onFinished()
                }
            }) { Text("Finish") }
        }
        Spacer(Modifier.height(20.dp))

        state.exercises.forEach { exercise ->
            val sessionExercise = state.sessionExercises[exercise.id]
            val sets = sessionExercise?.let { state.setsByExercise[it.id] }.orEmpty()
            val expanded = expandedExerciseId == exercise.id

            ExerciseLogCard(
                exercise = exercise,
                sets = sets,
                expanded = expanded,
                onToggleExpanded = { expandedExerciseId = if (expanded) null else exercise.id },
                onSetChanged = { updatedSet ->
                    val sessionExerciseId = sessionExercise?.id ?: return@ExerciseLogCard
                    val updatedSets = (state.setsByExercise[sessionExerciseId] ?: emptyList())
                        .map { if (it.id == updatedSet.id) updatedSet else it }
                    onStateChange(state.copy(setsByExercise = state.setsByExercise + (sessionExerciseId to updatedSets)))
                },
                repository = repository,
                scope = scope,
            )
        }
    }
}

@Composable
private fun ExerciseLogCard(
    exercise: AssignedWorkoutExercise,
    sets: List<SessionSet>,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    onSetChanged: (SessionSet) -> Unit,
    repository: WorkoutRepository,
    scope: CoroutineScope,
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        border = if (expanded) {
            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else {
            BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        },
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable(onClick = onToggleExpanded),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    exercise.name,
                    fontWeight = FontWeight.Bold,
                    color = if (expanded) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (sets.isNotEmpty() && sets.all { it.completed }) {
                    Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                }
            }
            if (expanded) {
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth()) {
                    Text("SET", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(40.dp))
                    Text("REPS", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                    Text("WEIGHT", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                    Text("REST", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                    Spacer(Modifier.width(36.dp))
                }
                sets.forEach { set ->
                    SetRow(
                        set = set,
                        onChanged = onSetChanged,
                        repository = repository,
                        scope = scope,
                    )
                }
            }
        }
    }
}

@Composable
private fun SetRow(
    set: SessionSet,
    onChanged: (SessionSet) -> Unit,
    repository: WorkoutRepository,
    scope: CoroutineScope,
) {
    var reps by remember(set.id) { mutableStateOf(set.reps ?: set.durationSeconds?.let { "${it}s" } ?: "") }
    var weight by remember(set.id) { mutableStateOf(set.weight ?: "") }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(set.setNumber.toString(), modifier = Modifier.width(40.dp), fontWeight = FontWeight.Bold)
        OutlinedTextField(
            value = reps,
            onValueChange = { reps = it },
            modifier = Modifier.weight(1f).padding(end = 4.dp).onFocusChanged { focus ->
                if (!focus.isFocused) {
                    scope.launch {
                        repository.updateSet(set.id, reps.ifBlank { null }, weight.ifBlank { null })
                        onChanged(set.copy(reps = reps.ifBlank { null }, weight = weight.ifBlank { null }))
                    }
                }
            },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodySmall,
        )
        OutlinedTextField(
            value = weight,
            onValueChange = { weight = it },
            modifier = Modifier.weight(1f).padding(end = 4.dp).onFocusChanged { focus ->
                if (!focus.isFocused) {
                    scope.launch {
                        repository.updateSet(set.id, reps.ifBlank { null }, weight.ifBlank { null })
                        onChanged(set.copy(reps = reps.ifBlank { null }, weight = weight.ifBlank { null }))
                    }
                }
            },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodySmall,
        )
        RestCell(restSeconds = set.restSeconds, modifier = Modifier.weight(1f))
        IconButton(onClick = {
            scope.launch {
                val newCompleted = !set.completed
                repository.setCompleted(set.id, newCompleted)
                onChanged(set.copy(completed = newCompleted))
            }
        }) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (set.completed) MaterialTheme.colorScheme.primary else Color.Transparent),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "✓",
                    color = if (set.completed) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/**
 * Local, ephemeral rest countdown -- tapping starts a plain coroutine
 * tick from the exercise's prescribed rest_seconds down to zero, showing
 * a checkmark once it reaches zero. Deliberately not persisted anywhere
 * (unlike the reps/weight/completed fields above): a rest timer only
 * matters live, in the moment, and re-opening this screen mid-rest with
 * no way to know how long ago it was started would just show a wrong
 * countdown -- resetting to "not started" on re-entry is the honest
 * behavior, not a gap to fix later.
 */
@Composable
private fun RestCell(restSeconds: Int?, modifier: Modifier = Modifier) {
    if (restSeconds == null || restSeconds <= 0) {
        Box(modifier, contentAlignment = Alignment.Center) {
            Text("—", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    var remaining by remember(restSeconds) { mutableStateOf(restSeconds) }
    var running by remember(restSeconds) { mutableStateOf(false) }

    LaunchedEffect(running) {
        while (running && remaining > 0) {
            delay(1000)
            remaining -= 1
        }
        if (remaining <= 0) running = false
    }

    Box(modifier, contentAlignment = Alignment.Center) {
        if (remaining <= 0 && restSeconds > 0 && !running && remaining != restSeconds) {
            Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        } else {
            TextButton(onClick = { if (!running) running = true }) {
                Text(
                    (if (!running && remaining == restSeconds) "▶ " else "") + formatElapsed(remaining.toLong()),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

private fun AssignedWorkoutExercise.prescriptionSummary(): String {
    val setsPart = sets?.let { "$it set${if (it == 1) "" else "s"}" }
    val amountPart = if (prescriptionType == "time") {
        durationSeconds?.let { "${it}s" }
    } else {
        reps
    }
    return listOfNotNull(setsPart, amountPart).joinToString(" · ").ifBlank { "—" }
}

private fun elapsedSeconds(session: WorkoutSession): Long {
    val startedAt = session.startedAt ?: return 0
    val start = Instant.parse(startedAt)
    val pauseCutoff = session.pausedAt?.let { Instant.parse(it) } ?: Instant.now()
    val rawElapsed = java.time.Duration.between(start, pauseCutoff).seconds
    return (rawElapsed - session.totalPausedSeconds).coerceAtLeast(0)
}

private fun formatElapsed(totalSeconds: Long): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}
