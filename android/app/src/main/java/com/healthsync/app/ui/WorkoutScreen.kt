package com.healthsync.app.ui

import android.content.Context
import android.media.MediaPlayer
import android.os.Build
import android.util.Log
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.healthsync.app.R
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.AssignedWorkout
import com.healthsync.app.data.AssignedWorkoutExercise
import com.healthsync.app.data.SessionExercise
import com.healthsync.app.data.SessionSet
import com.healthsync.app.data.WorkoutRepository
import com.healthsync.app.data.WorkoutSession
import com.healthsync.app.supabase.SupabaseRestClient
import com.healthsync.app.ui.components.ConfirmDialog
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
 * The single rest period that can be counting down at any moment, for the
 * whole in-progress workout -- replaces what used to be fully independent
 * per-SetRow timer state. Hoisting it here (to InProgressWorkout, outside
 * any per-exercise-card AnimatedVisibility) fixes two bugs that were really
 * one bug: two rows could each run their own countdown at once, and
 * collapsing a card destroyed whichever row's timer was live, since that
 * row's composable -- and the remembered state/coroutine living on it --
 * got torn down. [startToken] is a fresh value per start (not just
 * [setId]) so re-checking the very same set's checkbox twice in a row still
 * launches a new countdown rather than being a no-op key for LaunchedEffect.
 */
private data class ActiveRest(
    val setId: String,
    val exerciseName: String,
    val totalSeconds: Int,
    val remainingSeconds: Int,
    val startToken: Long,
)

/**
 * "Today's Workout": browse -> Start -> per-set logging -> summary, one
 * screen with three states rather than separate detail/session/summary
 * routes -- all three mockups share the same header, and a client
 * re-opening this screen mid-workout (or right after finishing, before
 * they've tapped Save & Return) should land back in the right one, not a
 * "start again?" prompt. [clientId] is the signed-in client's own id
 * (Workouts is a client-only SlideOutNav destination, unlike Stats which
 * a coach can also open for one of their clients).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutScreen(
    clientId: String,
    authRepository: AuthRepository,
    onBack: () -> Unit,
    // Set when opened from a specific calendar item (see CalendarScreen's
    // tap-to-complete) rather than the Workouts nav destination -- loads
    // that exact assignment instead of the usual "what's next" pick.
    // Session lookup still keys off "today" either way (findTodaysSession),
    // the same pre-existing simplification getNextTrainingItem's own
    // callers already live with -- there's no per-scheduled-day session
    // concept yet, only "today's attempt at this workout."
    assignedWorkoutId: String? = null,
) {
    var state by remember { mutableStateOf<WorkoutUiState?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var repository by remember { mutableStateOf<WorkoutRepository?>(null) }
    var weightUnit by remember { mutableStateOf("lbs") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(clientId, assignedWorkoutId) {
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
            weightUnit = repo.getPreferredWeightUnit(clientId)
            // Same program-aware pick HomeScreen's "Your Training" card
            // shows, so tapping that card and opening Workouts from the
            // nav both land on the same workout -- unless a specific one
            // was requested.
            val workout = if (assignedWorkoutId != null) {
                repo.getWorkoutById(clientId, assignedWorkoutId)
            } else {
                repo.getNextTrainingItem(clientId)?.workout
            }
            if (workout == null) {
                error = "No workout assigned yet."
            } else {
                val exercises = repo.getWorkoutExercises(workout.id)
                val session = repo.findTodaysSession(clientId, workout.id)
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
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        containerColor = Color.Transparent,
        // See HomeScreen.kt's Surface comment -- Transparent has no "on-X"
        // text color Scaffold can infer, so this has to be explicit or
        // every Text without its own color silently renders black.
        contentColor = MaterialTheme.colorScheme.onBackground,
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            val currentError = error
            val currentState = state
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                currentError != null -> Text(
                    currentError,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                )
                currentState == null -> Unit
                currentState.session != null && currentState.session.completedAt != null -> SummaryWorkout(
                    repository = repository!!,
                    scope = scope,
                    state = currentState,
                    onStateChange = { state = it },
                    onSaved = onBack,
                    weightUnit = weightUnit,
                )
                currentState.session != null -> InProgressWorkout(
                    repository = repository!!,
                    scope = scope,
                    state = currentState,
                    onStateChange = { state = it },
                    weightUnit = weightUnit,
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
        // Title on its own row, button below -- keeps a long workout name
        // from ever being squeezed by the adjacent button (see
        // InProgressWorkout's header below for the case this matters more,
        // kept visually consistent between the two states).
        Text(
            state.workout.name,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            "Est. ${formatEstimatedDuration(estimatedWorkoutSeconds(state.exercises))}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        Button(onClick = onStart) { Text("Start workout") }
        Spacer(Modifier.height(20.dp))
        state.exercises.forEach { exercise ->
            OutlinedCard(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                elevation = CardDefaults.outlinedCardElevation(defaultElevation = 3.dp),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(exercise.name, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        exercise.prescriptionSummary(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        // Clearance for the system 3-button nav bar at the very bottom of
        // a long exercise list -- same pattern as ProfileScreen's "Data
        // types" section.
        Spacer(Modifier.height(72.dp))
    }
}

@Composable
private fun InProgressWorkout(
    repository: WorkoutRepository,
    scope: CoroutineScope,
    state: WorkoutUiState,
    onStateChange: (WorkoutUiState) -> Unit,
    weightUnit: String,
) {
    val session = state.session!!
    var confirmingFinish by remember { mutableStateOf(false) }
    var finishing by remember { mutableStateOf(false) }
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

    // The one rest countdown live for the whole workout -- see ActiveRest's
    // own doc comment for why this replaced per-row timer state. The
    // ticking loop reads/writes `activeRest` on every iteration (not a
    // separately-captured local counter), so the +15s/-15s/skip controls
    // on the banner below and this loop never fight over which value is
    // current.
    var activeRest by remember(state.workout.id) { mutableStateOf<ActiveRest?>(null) }
    val context = LocalContext.current

    LaunchedEffect(activeRest?.startToken) {
        if (activeRest == null) return@LaunchedEffect
        while ((activeRest?.remainingSeconds ?: 0) > 0) {
            delay(1000)
            activeRest = activeRest?.let { it.copy(remainingSeconds = (it.remainingSeconds - 1).coerceAtLeast(0)) }
            // Fires once, right as the last 3 seconds begin -- the
            // countdown clip itself is a ~1.3s 3-2-1 cue, not a per-
            // second tick, so this plays it exactly once rather than
            // once per remaining second.
            if (activeRest?.remainingSeconds == 3) {
                playRestCountdownTick(context)
            }
        }
        // Only fire the alert if this rest actually ran out on its own --
        // a manual Skip already nulled activeRest out from under this
        // loop, which the while condition above already caught.
        if (activeRest?.remainingSeconds == 0) {
            playRestCompleteAlert(context)
            activeRest = null
        }
    }

    fun startRest(set: SessionSet, exercise: AssignedWorkoutExercise) {
        val restSeconds = set.restSeconds ?: exercise.restSeconds
        if (restSeconds == null || restSeconds <= 0) return
        activeRest = ActiveRest(
            setId = set.id,
            exerciseName = exercise.name,
            totalSeconds = restSeconds,
            remainingSeconds = restSeconds,
            startToken = System.currentTimeMillis(),
        )
    }

    fun cancelRestIfActive(setId: String) {
        if (activeRest?.setId == setId) activeRest = null
    }

    Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text(
                formatElapsed(elapsedDisplaySeconds),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
        // Title on its own row, Pause/Resume + Finish below -- a single
        // row here used to let the title get squeezed and wrap to a
        // second line whenever a button's own label (Pause<->Resume,
        // Finish<->Finishing...) changed width. Each button also gets a
        // fixed minimum width so IT doesn't visibly resize in place
        // between states, independent of the title issue.
        Text(
            state.workout.name,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(
                modifier = Modifier.widthIn(min = 104.dp),
                onClick = {
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
                },
            ) {
                Text(if (session.pausedAt == null) "Pause" else "Resume")
            }
            Spacer(Modifier.width(8.dp))
            Button(
                modifier = Modifier.widthIn(min = 132.dp),
                onClick = { confirmingFinish = true },
                enabled = !finishing,
            ) { Text(if (finishing) "Finishing…" else "Finish") }
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
                    sessionExercise?.id?.let { sessionExerciseId ->
                        val updatedSets = (state.setsByExercise[sessionExerciseId] ?: emptyList())
                            .map { if (it.id == updatedSet.id) updatedSet else it }
                        onStateChange(state.copy(setsByExercise = state.setsByExercise + (sessionExerciseId to updatedSets)))
                    }
                },
                onSetCompletionChanged = { set, completed ->
                    if (completed) startRest(set, exercise) else cancelRestIfActive(set.id)
                },
                activeRestSetId = activeRest?.setId,
                activeRestRemainingSeconds = activeRest?.remainingSeconds,
                repository = repository,
                scope = scope,
                weightUnit = weightUnit,
            )
        }
        // Clearance for the system 3-button nav bar -- same pattern as
        // ProfileScreen's "Data types" section. A bit more while the rest
        // banner is showing, so the last card's content can still scroll
        // clear of it rather than staying permanently hidden underneath.
        Spacer(Modifier.height(if (activeRest != null) 160.dp else 72.dp))
    }

    if (activeRest != null) {
        ActiveRestBanner(
            rest = activeRest!!,
            onAdjust = { deltaSeconds ->
                activeRest = activeRest?.let { it.copy(remainingSeconds = (it.remainingSeconds + deltaSeconds).coerceAtLeast(0)) }
            },
            onSkip = { activeRest = null },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
    }

    if (confirmingFinish) {
        ConfirmDialog(
            title = "Finish workout?",
            body = "You won't be able to log any more sets for this workout after finishing.",
            confirmLabel = "Finish",
            onConfirm = {
                confirmingFinish = false
                finishing = true
                scope.launch {
                    repository.finishSession(session.id)
                    // Setting completedAt locally is what flips the parent
                    // WorkoutScreen's `when` branch over to SummaryWorkout
                    // -- no re-fetch needed, the rest of the state (sets,
                    // exercises) is already loaded.
                    onStateChange(state.copy(session = session.copy(completedAt = Instant.now().toString())))
                }
            },
            onDismiss = { confirmingFinish = false },
        )
    }
}

/**
 * Post-Finish recap -- unlike the web dashboard's summary page (a
 * read-only recap where only session notes are editable, with a separate
 * "Edit sets" link back to the logging page for anything else), every
 * set/PR field here stays directly editable in place, matching what was
 * asked for. `workout_sessions.completed_at` is already set by the time
 * this renders (InProgressWorkout's Finish button sets it before handing
 * off here) -- "Save & Return" only needs to commit the notes field and
 * leave; every set/PR edit before that point already persisted itself on
 * focus-loss/tap, same as during logging.
 */
@Composable
private fun SummaryWorkout(
    repository: WorkoutRepository,
    scope: CoroutineScope,
    state: WorkoutUiState,
    onStateChange: (WorkoutUiState) -> Unit,
    onSaved: () -> Unit,
    weightUnit: String,
) {
    val session = state.session!!
    var notes by remember(session.id) { mutableStateOf(session.notes ?: "") }
    var confirmingSave by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Workout complete!", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(state.workout.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "Duration: ${formatElapsed(elapsedSeconds(session))}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        OutlinedTextField(
            value = notes,
            onValueChange = { notes = it },
            label = { Text("Notes") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))

        state.exercises.forEach { exercise ->
            val sessionExercise = state.sessionExercises[exercise.id]
            val sets = sessionExercise?.let { state.setsByExercise[it.id] }.orEmpty()

            ExerciseLogCard(
                exercise = exercise,
                sets = sets,
                expanded = true,
                onToggleExpanded = {},
                collapsible = false,
                isPr = sessionExercise?.isPr ?: false,
                onTogglePr = {
                    if (sessionExercise != null) {
                        scope.launch {
                            val newIsPr = !sessionExercise.isPr
                            repository.setExercisePr(sessionExercise.id, newIsPr)
                            val updatedExercises = state.sessionExercises + (exercise.id to sessionExercise.copy(isPr = newIsPr))
                            onStateChange(state.copy(sessionExercises = updatedExercises))
                        }
                    }
                },
                onSetChanged = { updatedSet ->
                    sessionExercise?.id?.let { sessionExerciseId ->
                        val updatedSets = (state.setsByExercise[sessionExerciseId] ?: emptyList())
                            .map { if (it.id == updatedSet.id) updatedSet else it }
                        onStateChange(state.copy(setsByExercise = state.setsByExercise + (sessionExerciseId to updatedSets)))
                    }
                },
                repository = repository,
                scope = scope,
                weightUnit = weightUnit,
            )
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { confirmingSave = true },
            enabled = !saving && !saved,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                when {
                    saved -> "Saved ✓"
                    saving -> "Saving…"
                    else -> "Save & Return to Dashboard"
                },
            )
        }
        // Clearance for the system 3-button nav bar -- same pattern as
        // ProfileScreen's "Data types" section.
        Spacer(Modifier.height(72.dp))
    }

    if (confirmingSave) {
        ConfirmDialog(
            title = "Save and return to dashboard?",
            body = "This saves your notes and PR picks and takes you back to the dashboard.",
            confirmLabel = "Save",
            onConfirm = {
                confirmingSave = false
                saving = true
                scope.launch {
                    repository.setSessionNotes(session.id, notes.ifBlank { null })
                    saving = false
                    saved = true
                    delay(600)
                    onSaved()
                }
            },
            onDismiss = { confirmingSave = false },
        )
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
    weightUnit: String,
    collapsible: Boolean = true,
    isPr: Boolean = false,
    onTogglePr: (() -> Unit)? = null,
    // Only set from InProgressWorkout -- null here (SummaryWorkout's post-
    // finish recap) means checking a set's checkbox just toggles
    // completed, with no live rest side effect at all.
    onSetCompletionChanged: ((SessionSet, Boolean) -> Unit)? = null,
    activeRestSetId: String? = null,
    activeRestRemainingSeconds: Int? = null,
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        border = if (expanded) {
            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else {
            BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        },
        elevation = CardDefaults.outlinedCardElevation(defaultElevation = 3.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().let { if (collapsible) it.clickable(onClick = onToggleExpanded) else it },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    exercise.name,
                    fontWeight = FontWeight.Bold,
                    color = if (expanded) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (onTogglePr != null) {
                    TextButton(onClick = onTogglePr) {
                        Text(
                            if (isPr) "★ PR" else "☆ PR",
                            color = if (isPr) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else if (sets.isNotEmpty() && sets.all { it.completed }) {
                    Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                }
            }
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Column {
                    if (exercise.videoPath != null || exercise.videoUrl != null) {
                        Spacer(Modifier.height(12.dp))
                        ExerciseVideoPlayer(exercise = exercise, repository = repository)
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Text("SET", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(40.dp))
                        Text("REPS", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                        Text(
                            "WEIGHT (${weightUnit.uppercase()})",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text("REST", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                        Spacer(Modifier.width(36.dp))
                    }
                    sets.forEach { set ->
                        SetRow(
                            set = set,
                            onChanged = onSetChanged,
                            onCompletionChanged = onSetCompletionChanged,
                            isActiveRest = activeRestSetId == set.id,
                            activeRestRemainingSeconds = if (activeRestSetId == set.id) activeRestRemainingSeconds else null,
                            repository = repository,
                            scope = scope,
                        )
                    }
                }
            }
        }
    }
}

// Plays an exercise's demo video right on its own session card, so the
// client never has to leave mid-set-logging to see how it's done --
// resolved lazily on first expand (an uploaded file needs a signed URL,
// see WorkoutRepository.resolveExerciseVideoUrl) rather than for every
// exercise in the workout up front.
//
// Media3's ExoPlayer, not the platform VideoView/MediaPlayer this started
// on -- a video recorded in-browser (MediaUploadField.tsx's MediaRecorder,
// no explicit mimeType) comes back as WebM/VP8-VP9+Opus, which the plain
// MediaPlayer a VideoView wraps plays unreliably device-to-device (it
// depends entirely on whatever codecs the OEM registered). ExoPlayer
// bundles its own WebM/VP8/VP9/Opus extraction and software decoding.
//
// A playback failure (bad/unsupported file, stale signed URL, whatever)
// shows a plain, same-size "Video unavailable" placeholder instead of the
// real player -- never a raw PlaybackException error code (logged for
// diagnosis instead, not shown to the client: it's not actionable mid-
// workout and just reads as the app being broken). Keeping a same-sized
// placeholder rather than rendering nothing at all matters here too: this
// card reserves space for a video whenever the exercise has one assigned
// at all, win or fail, so the card's footprint doesn't visibly change
// depending on whether that particular file happens to load.
@Composable
private fun ExerciseVideoPlayer(exercise: AssignedWorkoutExercise, repository: WorkoutRepository) {
    var videoUrl by remember(exercise.id) { mutableStateOf<String?>(null) }
    var resolved by remember(exercise.id) { mutableStateOf(false) }
    var playbackFailed by remember(exercise.id) { mutableStateOf(false) }

    LaunchedEffect(exercise.id) {
        videoUrl = repository.resolveExerciseVideoUrl(exercise)
        resolved = true
    }

    val url = videoUrl
    val context = LocalContext.current
    if (resolved && url != null) {
        if (playbackFailed) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .padding(bottom = 8.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Video unavailable",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        } else {
            val player = remember(exercise.id) {
                ExoPlayer.Builder(context).build().apply {
                    addListener(
                        object : Player.Listener {
                            override fun onPlayerError(error: PlaybackException) {
                                Log.w("ExerciseVideoPlayer", "Playback failed for ${exercise.id}: ${error.errorCodeName}")
                                playbackFailed = true
                            }
                        },
                    )
                    setMediaItem(MediaItem.fromUri(url))
                    prepare()
                }
            }
            // ExoPlayer instances own real decoder/media resources --
            // must be released when this card's video leaves composition
            // (collapsed, or the session screen navigated away from),
            // not just garbage collected, or every exercise ever
            // expanded this session leaks one.
            DisposableEffect(player) {
                onDispose { player.release() }
            }

            AndroidView(
                modifier = Modifier.fillMaxWidth().height(180.dp).padding(bottom = 8.dp),
                factory = { ctx -> PlayerView(ctx).apply { this.player = player } },
            )
        }
    }
}

@Composable
private fun SetRow(
    set: SessionSet,
    onChanged: (SessionSet) -> Unit,
    repository: WorkoutRepository,
    scope: CoroutineScope,
    onCompletionChanged: ((SessionSet, Boolean) -> Unit)? = null,
    isActiveRest: Boolean = false,
    activeRestRemainingSeconds: Int? = null,
) {
    var reps by remember(set.id) { mutableStateOf(set.reps ?: set.durationSeconds?.let { "${it}s" } ?: "") }
    var weight by remember(set.id) { mutableStateOf(set.weight ?: "") }
    // Brief border-color pulse on the two fields right where the user was
    // just typing -- the only signal this row has that a commit actually
    // landed, since it saves silently on focus-loss with no button/toast.
    var justSaved by remember(set.id) { mutableStateOf(false) }
    LaunchedEffect(justSaved) {
        if (justSaved) {
            delay(600)
            justSaved = false
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(set.setNumber.toString(), modifier = Modifier.width(40.dp), fontWeight = FontWeight.Bold)
        CompactNumberField(
            value = reps,
            onValueChange = { reps = it },
            saved = justSaved,
            modifier = Modifier.weight(1f).padding(end = 4.dp).onFocusChanged { focus ->
                if (!focus.isFocused) {
                    scope.launch {
                        repository.updateSet(set.id, reps.ifBlank { null }, weight.ifBlank { null })
                        onChanged(set.copy(reps = reps.ifBlank { null }, weight = weight.ifBlank { null }))
                        justSaved = true
                    }
                }
            },
        )
        CompactNumberField(
            value = weight,
            onValueChange = { weight = it },
            saved = justSaved,
            modifier = Modifier.weight(1f).padding(end = 4.dp).onFocusChanged { focus ->
                if (!focus.isFocused) {
                    scope.launch {
                        repository.updateSet(set.id, reps.ifBlank { null }, weight.ifBlank { null })
                        onChanged(set.copy(reps = reps.ifBlank { null }, weight = weight.ifBlank { null }))
                        justSaved = true
                    }
                }
            },
        )
        RestColumnCell(
            restSeconds = set.restSeconds,
            isActiveRest = isActiveRest,
            remainingSeconds = activeRestRemainingSeconds,
            modifier = Modifier.weight(1f),
        )
        IconButton(
            onClick = {
                scope.launch {
                    val newCompleted = !set.completed
                    repository.setCompleted(set.id, newCompleted)
                    val updated = set.copy(completed = newCompleted)
                    onChanged(updated)
                    onCompletionChanged?.invoke(updated, newCompleted)
                }
            },
            modifier = Modifier.size(36.dp),
        ) {
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
 * A short, ~30dp-tall reps/weight input -- Material3's OutlinedTextField
 * has a hard ~56dp minimum height that can't be shrunk to fit a workout
 * card's per-set row without clipping its label/padding, so this is a
 * plain BasicTextField with its own thin border instead. Scoped to
 * [SetRow] only -- not a general-purpose replacement for OutlinedTextField
 * used elsewhere in the app.
 */
@Composable
private fun CompactNumberField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    saved: Boolean = false,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .height(30.dp)
            .border(
                width = if (saved) 2.dp else 1.dp,
                color = if (saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                shape = RoundedCornerShape(6.dp),
            ),
        textStyle = MaterialTheme.typography.bodySmall.copy(
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        ),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                innerTextField()
            }
        },
    )
}

/**
 * This set's rest column -- no longer an independent timer widget (see
 * ActiveRest's doc comment for why that was replaced). Plain static text
 * for the prescribed rest duration normally; while this exact set is the
 * one the shared countdown is running for, it instead mirrors that
 * countdown's remaining time, read straight from the hoisted state passed
 * down as a prop rather than owning any ticking state of its own.
 */
@Composable
private fun RestColumnCell(
    restSeconds: Int?,
    isActiveRest: Boolean,
    remainingSeconds: Int?,
    modifier: Modifier = Modifier,
) {
    Box(modifier, contentAlignment = Alignment.Center) {
        when {
            isActiveRest && remainingSeconds != null -> Text(
                formatElapsed(remainingSeconds.toLong()),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            restSeconds == null || restSeconds <= 0 -> Text(
                "—",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> Text(
                formatElapsed(restSeconds.toLong()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * The persistent, workout-wide rest banner -- lives outside the scrollable
 * exercise list (see InProgressWorkout's Box) so it stays visible and
 * running no matter which card is expanded/collapsed or how far the list
 * is scrolled.
 */
@Composable
private fun ActiveRestBanner(
    rest: ActiveRest,
    onAdjust: (Int) -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "Resting · ${rest.exerciseName}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                formatElapsed(rest.remainingSeconds.toLong()),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        TextButton(onClick = { onAdjust(-15) }) { Text("−15s") }
        TextButton(onClick = { onAdjust(15) }) { Text("+15s") }
        TextButton(onClick = onSkip) { Text("Skip") }
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

// Cutoff instant for the elapsed-time calculation: completedAt once the
// session is finished (so the summary screen's "Duration" is a fixed
// number, not one that silently keeps growing on every recomposition),
// otherwise pausedAt while paused, otherwise "now" while actively running.
private fun elapsedSeconds(session: WorkoutSession): Long {
    val startedAt = session.startedAt ?: return 0
    val start = Instant.parse(startedAt)
    val cutoff = session.completedAt?.let { Instant.parse(it) }
        ?: session.pausedAt?.let { Instant.parse(it) }
        ?: Instant.now()
    val rawElapsed = java.time.Duration.between(start, cutoff).seconds
    return (rawElapsed - session.totalPausedSeconds).coerceAtLeast(0)
}

private fun formatElapsed(totalSeconds: Long): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}

// Very rough "how long will this take" estimate for the not-started
// screen -- sets * (an assumed ~45s to actually perform one set, since
// that isn't tracked anywhere) + each set's own prescribed rest. Not
// meant to be precise, just enough to set expectations before starting.
private const val ASSUMED_SECONDS_PER_SET = 45

private fun estimatedWorkoutSeconds(exercises: List<AssignedWorkoutExercise>): Int =
    exercises.sumOf { exercise ->
        val sets = exercise.sets ?: 1
        sets * (ASSUMED_SECONDS_PER_SET + (exercise.restSeconds ?: 0))
    }

private fun formatEstimatedDuration(totalSeconds: Int): String {
    val minutes = (totalSeconds / 60).coerceAtLeast(1)
    return "~$minutes min"
}

// Plays a short one-shot clip from res/raw and releases its MediaPlayer
// the moment playback finishes -- a real short clip naturally stops on
// its own (no duration cap needed, unlike the system alarm Ringtone this
// replaced -- see this file's git history for why that was broken:
// alarm-category ringtones are long/sustained tracks by OS design, and
// nothing ever called Ringtone.stop() on it).
private fun playRawSound(context: Context, resId: Int) {
    try {
        val player = MediaPlayer.create(context, resId) ?: return
        player.setOnCompletionListener { it.release() }
        player.start()
    } catch (e: Exception) {
        // A missing/corrupt resource shouldn't crash the workout.
    }
}

/**
 * Fires when a rest countdown reaches zero -- the user-supplied
 * rest_timer_end clip plus a vibration, always both rather than one as a
 * conditional fallback for the other, since either channel alone can be
 * missed (phone face-down for vibration, a worn phone for sound).
 */
private fun playRestCompleteAlert(context: Context) {
    playRawSound(context, R.raw.rest_timer_end)

    try {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
    } catch (e: Exception) {
        // No vibrator hardware, or service unavailable -- the chime above
        // already fired, so this is a quiet best-effort extra.
    }
}

/**
 * Fires once, right as the last 3 seconds of rest begin (see the ticking
 * LaunchedEffect above) -- the user-supplied countdown_sound clip, a
 * ~1.3s 3-2-1 cue rather than a per-second tick, so this plays it exactly
 * once instead of once per remaining second.
 */
private fun playRestCountdownTick(context: Context) {
    playRawSound(context, R.raw.countdown_sound)
}
