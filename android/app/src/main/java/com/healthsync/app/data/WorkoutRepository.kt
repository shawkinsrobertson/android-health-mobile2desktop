package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

data class AssignedWorkout(
    val id: String,
    val coachId: String,
    val name: String,
)

/** [programName] is non-null when this workout came from within an assigned program, null for a standalone assignment. */
data class TrainingItem(
    val workout: AssignedWorkout,
    val programName: String?,
)

data class AssignedWorkoutExercise(
    val id: String,
    val orderIndex: Int,
    val name: String,
    val sets: Int?,
    val reps: String?,
    val prescriptionType: String, // "reps" | "time"
    val durationSeconds: Int?,
    val weightNote: String?,
    val restSeconds: Int?,
)

data class WorkoutSession(
    val id: String,
    val assignedWorkoutId: String,
    val startedAt: String?,
    val pausedAt: String?,
    val totalPausedSeconds: Int,
    val completedAt: String?,
    val notes: String?,
)

data class SessionExercise(
    val id: String,
    val assignedWorkoutExerciseId: String,
    val completed: Boolean,
    val isPr: Boolean,
)

data class SessionSet(
    val id: String,
    val sessionExerciseId: String,
    val setNumber: Int,
    val reps: String?,
    val durationSeconds: Int?,
    val weight: String?,
    val restSeconds: Int?,
    val completed: Boolean,
)

/**
 * Client-side counterpart to the web dashboard's workout-tracking-v2
 * feature (`dashboard/lib/session-log.ts` + `dashboard/app/client/
 * sessions/actions.ts`) -- same tables, same "one session per attempt,
 * one row per logged set" shape, reimplemented against this app's plain
 * PostgREST client instead of the Supabase JS SDK. Two deliberate
 * differences from the web flow, not oversights:
 *  - "Today's workout" here is the same "most recently assigned
 *    standalone workout" placeholder `app/client/page.tsx` already uses
 *    (`assigned_program_id is null`, `order by assigned_at desc limit 1`)
 *    -- there's still no real per-day scheduling anywhere in this app.
 *  - Every set gets its own `completed` checkbox (see migration
 *    0025_workout_session_set_completion.sql), which the web SessionLogger
 *    doesn't expose yet -- the mockup this screen was built from wanted
 *    per-set done state, not just the exercise-level flag 0009 shipped.
 *  - Unlike the web summary page (read-only recap + a notes-only save),
 *    this app's post-Finish summary screen keeps every set/PR field
 *    editable -- see WorkoutScreen's Summary state.
 */
class WorkoutRepository(private val supabase: SupabaseRestClient) {

    suspend fun getTodaysWorkout(clientId: String): AssignedWorkout? {
        val rows = supabase.select(
            "assigned_workouts",
            mapOf(
                "select" to "id,coach_id,name",
                "client_id" to "eq.$clientId",
                "assigned_program_id" to "is.null",
                "order" to "assigned_at.desc",
                "limit" to "1",
            ),
        )
        if (rows.length() == 0) return null
        val row = rows.getJSONObject(0)
        return AssignedWorkout(
            id = row.getString("id"),
            coachId = row.getString("coach_id"),
            name = row.getString("name"),
        )
    }

    /**
     * "Your Training" card logic -- new, not ported from the web (the web
     * dashboard's own /client page still only does the standalone
     * fallback below, its own comment there calls it "a placeholder for
     * real scheduling"). Prefers the client's most-recently-assigned
     * program: the first of its workouts, in order_index order, that has
     * no completed workout_sessions row yet. Falls through to the
     * existing standalone getTodaysWorkout() when there's no program, or
     * every one of its workouts is already completed -- null only when
     * neither yields anything, which HomeScreen renders as the mockup's
     * "You do not have any workouts assigned" empty state.
     */
    suspend fun getNextTrainingItem(clientId: String): TrainingItem? {
        val programRows = supabase.select(
            "assigned_programs",
            mapOf(
                "select" to "id,name",
                "client_id" to "eq.$clientId",
                "order" to "assigned_at.desc",
                "limit" to "1",
            ),
        )
        if (programRows.length() > 0) {
            val program = programRows.getJSONObject(0)
            val programId = program.getString("id")
            val programName = program.getString("name")

            val workoutRows = supabase.select(
                "assigned_workouts",
                mapOf(
                    "select" to "id,coach_id,name",
                    "assigned_program_id" to "eq.$programId",
                    "order" to "order_index.asc",
                ),
            )
            if (workoutRows.length() > 0) {
                val workoutIds = (0 until workoutRows.length()).map { workoutRows.getJSONObject(it).getString("id") }
                val completedRows = supabase.select(
                    "workout_sessions",
                    mapOf(
                        "select" to "assigned_workout_id",
                        "client_id" to "eq.$clientId",
                        "assigned_workout_id" to "in.(${workoutIds.joinToString(",")})",
                        "completed_at" to "not.is.null",
                    ),
                )
                val completedIds = (0 until completedRows.length())
                    .map { completedRows.getJSONObject(it).getString("assigned_workout_id") }
                    .toSet()

                val next = (0 until workoutRows.length())
                    .map { workoutRows.getJSONObject(it) }
                    .firstOrNull { it.getString("id") !in completedIds }
                if (next != null) {
                    return TrainingItem(
                        workout = AssignedWorkout(
                            id = next.getString("id"),
                            coachId = next.getString("coach_id"),
                            name = next.getString("name"),
                        ),
                        programName = programName,
                    )
                }
            }
        }

        val standalone = getTodaysWorkout(clientId) ?: return null
        return TrainingItem(workout = standalone, programName = null)
    }

    suspend fun getWorkoutExercises(assignedWorkoutId: String): List<AssignedWorkoutExercise> {
        val rows = supabase.select(
            "assigned_workout_exercises",
            mapOf(
                "select" to "id,order_index,name,sets,reps,prescription_type,duration_seconds,weight_note,rest_seconds",
                "assigned_workout_id" to "eq.$assignedWorkoutId",
                "order" to "order_index.asc",
            ),
        )
        return (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            AssignedWorkoutExercise(
                id = row.getString("id"),
                orderIndex = row.optInt("order_index", 0),
                name = row.getString("name"),
                sets = row.optIntOrNull("sets"),
                reps = row.optString("reps").ifBlank { null },
                prescriptionType = row.optString("prescription_type", "reps"),
                durationSeconds = row.optIntOrNull("duration_seconds"),
                weightNote = row.optString("weight_note").ifBlank { null },
                restSeconds = row.optIntOrNull("rest_seconds"),
            )
        }
    }

    private val sessionSelect = "id,assigned_workout_id,started_at,paused_at,total_paused_seconds,completed_at,notes"

    /**
     * Today's session for this workout -- active (not yet finished) OR
     * just-finished-but-not-yet-left-the-summary-screen, since the
     * summary state (see WorkoutScreen) keeps showing the same session
     * after Finish is tapped until the client actually saves and leaves.
     * Re-entering this screen after a genuine finish-and-leave (a new
     * calendar day, or performed_on no longer matches) correctly falls
     * through to "not started" for a fresh attempt.
     */
    suspend fun findTodaysSession(clientId: String, assignedWorkoutId: String): WorkoutSession? {
        val today = LocalDate.now(ZoneId.systemDefault()).toString()
        val rows = supabase.select(
            "workout_sessions",
            mapOf(
                "select" to sessionSelect,
                "client_id" to "eq.$clientId",
                "assigned_workout_id" to "eq.$assignedWorkoutId",
                "performed_on" to "eq.$today",
                "order" to "created_at.desc",
                "limit" to "1",
            ),
        )
        if (rows.length() == 0) return null
        return rows.getJSONObject(0).toWorkoutSession()
    }

    /**
     * Creates a new session row AND starts its timer in one call, matching
     * the mockup's flow of "Start workout" leading straight into the
     * running-timer screen -- unlike the web flow, which creates the
     * session on one page (workout detail) and starts the timer
     * separately on the next (the session page's own Start button).
     */
    suspend fun startSession(clientId: String, coachId: String, assignedWorkoutId: String): WorkoutSession {
        val rows = supabase.insert(
            "workout_sessions",
            listOf(
                mapOf(
                    "client_id" to clientId,
                    "coach_id" to coachId,
                    "assigned_workout_id" to assignedWorkoutId,
                    "started_at" to ISO_INSTANT.format(Instant.now()),
                ),
            ),
        )
        return rows.getJSONObject(0).toWorkoutSession()
    }

    suspend fun setSessionNotes(sessionId: String, notes: String?) {
        supabase.patch("workout_sessions", mapOf("id" to "eq.$sessionId"), mapOf("notes" to notes))
    }

    suspend fun setExercisePr(sessionExerciseId: String, isPr: Boolean) {
        supabase.patch("workout_session_exercises", mapOf("id" to "eq.$sessionExerciseId"), mapOf("is_pr" to isPr))
    }

    suspend fun pauseTimer(sessionId: String) {
        supabase.patch(
            "workout_sessions",
            mapOf("id" to "eq.$sessionId"),
            mapOf("paused_at" to ISO_INSTANT.format(Instant.now())),
        )
    }

    /** Mirrors the web's resumeWorkoutTimer: folds this pause's duration into the running total, then clears paused_at. */
    suspend fun resumeTimer(sessionId: String, pausedAt: String, totalPausedSeconds: Int) {
        val pausedSeconds = Duration.between(Instant.parse(pausedAt), Instant.now()).seconds.coerceAtLeast(0)
        supabase.patch(
            "workout_sessions",
            mapOf("id" to "eq.$sessionId"),
            mapOf(
                "paused_at" to null,
                "total_paused_seconds" to (totalPausedSeconds + pausedSeconds.toInt()),
            ),
        )
    }

    suspend fun finishSession(sessionId: String) {
        supabase.patch(
            "workout_sessions",
            mapOf("id" to "eq.$sessionId"),
            mapOf("completed_at" to ISO_INSTANT.format(Instant.now())),
        )
    }

    /**
     * Idempotent lazy-seed, same shape as the web's ensureSessionExercises:
     * one workout_session_exercises row per prescribed exercise, then
     * workout_session_sets pre-populated from each exercise's prescribed
     * sets/reps-or-duration/weight_note/rest_seconds -- only when that
     * exercise has no sets logged yet, so re-entering an in-progress
     * session never duplicates rows.
     */
    suspend fun ensureSessionExercises(
        sessionId: String,
        clientId: String,
        coachId: String,
        exercises: List<AssignedWorkoutExercise>,
    ): Pair<Map<String, SessionExercise>, Map<String, List<SessionSet>>> {
        val existingExerciseRows = supabase.select(
            "workout_session_exercises",
            mapOf(
                "select" to "id,assigned_workout_exercise_id,completed,is_pr",
                "session_id" to "eq.$sessionId",
            ),
        )
        val exerciseRows = LinkedHashMap<String, SessionExercise>()
        for (i in 0 until existingExerciseRows.length()) {
            val row = existingExerciseRows.getJSONObject(i)
            exerciseRows[row.getString("assigned_workout_exercise_id")] = row.toSessionExercise()
        }

        val missing = exercises.filter { !exerciseRows.containsKey(it.id) }
        if (missing.isNotEmpty()) {
            val inserted = supabase.insert(
                "workout_session_exercises",
                missing.map { exercise ->
                    mapOf(
                        "session_id" to sessionId,
                        "client_id" to clientId,
                        "coach_id" to coachId,
                        "assigned_workout_exercise_id" to exercise.id,
                    )
                },
            )
            for (i in 0 until inserted.length()) {
                val row = inserted.getJSONObject(i)
                exerciseRows[row.getString("assigned_workout_exercise_id")] = row.toSessionExercise()
            }
        }

        val sessionExerciseIds = exercises.mapNotNull { exerciseRows[it.id]?.id }
        val setsByExercise = LinkedHashMap<String, MutableList<SessionSet>>()
        if (sessionExerciseIds.isNotEmpty()) {
            val existingSets = supabase.select(
                "workout_session_sets",
                mapOf(
                    "select" to "id,session_exercise_id,set_number,reps,duration_seconds,weight,rest_seconds,completed",
                    "session_exercise_id" to "in.(${sessionExerciseIds.joinToString(",")})",
                    "order" to "set_number.asc",
                ),
            )
            for (i in 0 until existingSets.length()) {
                val row = existingSets.getJSONObject(i)
                setsByExercise.getOrPut(row.getString("session_exercise_id")) { mutableListOf() }.add(row.toSessionSet())
            }
        }

        val toInsert = mutableListOf<Map<String, Any?>>()
        for (exercise in exercises) {
            val sessionExerciseId = exerciseRows[exercise.id]?.id ?: continue
            if (!setsByExercise[sessionExerciseId].isNullOrEmpty()) continue // already seeded
            val count = (exercise.sets ?: 1).coerceAtLeast(1)
            for (setNumber in 1..count) {
                toInsert.add(
                    mapOf(
                        "session_exercise_id" to sessionExerciseId,
                        "client_id" to clientId,
                        "coach_id" to coachId,
                        "set_number" to setNumber,
                        "reps" to if (exercise.prescriptionType == "reps") exercise.reps else null,
                        "duration_seconds" to if (exercise.prescriptionType == "time") exercise.durationSeconds else null,
                        "weight" to exercise.weightNote,
                        "rest_seconds" to exercise.restSeconds,
                    ),
                )
            }
        }
        if (toInsert.isNotEmpty()) {
            val inserted = supabase.insert("workout_session_sets", toInsert)
            for (i in 0 until inserted.length()) {
                val row = inserted.getJSONObject(i)
                setsByExercise.getOrPut(row.getString("session_exercise_id")) { mutableListOf() }.add(row.toSessionSet())
            }
        }

        return exerciseRows to setsByExercise
    }

    suspend fun updateSet(setId: String, reps: String?, weight: String?) {
        supabase.patch("workout_session_sets", mapOf("id" to "eq.$setId"), mapOf("reps" to reps, "weight" to weight))
    }

    suspend fun setCompleted(setId: String, completed: Boolean) {
        supabase.patch("workout_session_sets", mapOf("id" to "eq.$setId"), mapOf("completed" to completed))
    }
}

private fun JSONObject.optIntOrNull(key: String): Int? = if (isNull(key)) null else optInt(key)

private fun JSONObject.toWorkoutSession() = WorkoutSession(
    id = getString("id"),
    assignedWorkoutId = getString("assigned_workout_id"),
    startedAt = if (isNull("started_at")) null else getString("started_at"),
    pausedAt = if (isNull("paused_at")) null else getString("paused_at"),
    totalPausedSeconds = optInt("total_paused_seconds", 0),
    completedAt = if (isNull("completed_at")) null else getString("completed_at"),
    notes = if (isNull("notes")) null else optString("notes"),
)

private fun JSONObject.toSessionExercise() = SessionExercise(
    id = getString("id"),
    assignedWorkoutExerciseId = getString("assigned_workout_exercise_id"),
    completed = optBoolean("completed", false),
    isPr = optBoolean("is_pr", false),
)

private fun JSONObject.toSessionSet() = SessionSet(
    id = getString("id"),
    sessionExerciseId = getString("session_exercise_id"),
    setNumber = optInt("set_number", 1),
    reps = if (isNull("reps")) null else optString("reps"),
    durationSeconds = optIntOrNull("duration_seconds"),
    weight = if (isNull("weight")) null else optString("weight"),
    restSeconds = optIntOrNull("rest_seconds"),
    completed = optBoolean("completed", false),
)
