import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";
import { VideoPreview } from "@/components/library/VideoPreview";
import {
  WorkoutExerciseListEditor,
  type WorkoutBlock,
  type WorkoutExerciseActions,
  type WorkoutExerciseItem,
} from "@/components/library/WorkoutExerciseListEditor";
import {
  addAssignedExercise,
  updateAssignedExercise,
  removeAssignedExercise,
  reorderAssignedExercises,
  createAssignedBlock,
  updateAssignedBlock,
  ungroupAssignedBlock,
  deleteAssignedBlock,
  moveAssignedUnit,
} from "./actions";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  performed_on: string;
  completed_at: string | null;
  notes: string | null;
}

interface AssignmentComponentRow {
  id: string;
  order_index: number;
  group_id: string | null;
  source_template_id: string | null;
  name: string;
  instructions: string | null;
  sets: number | null;
  reps: string | null;
  prescription_type: "reps" | "time";
  duration_seconds: number | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export default async function AssignedWorkoutPage({
  params,
  searchParams,
}: {
  params: { clientId: string; assignedWorkoutId: string };
  searchParams: { error?: string; addExerciseId?: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const returnTo = `/dashboard/clients/${params.clientId}/assigned/workouts/${params.assignedWorkoutId}`;

  // Mirrors [workoutId]/page.tsx's own handling of this query param --
  // see ExerciseSearchField/createExercise's returnTo flow.
  if (searchParams.addExerciseId) {
    const formData = new FormData();
    formData.set("exercise_id", searchParams.addExerciseId);
    await addAssignedExercise(params.clientId, params.assignedWorkoutId, formData);
    redirect(returnTo);
  }

  const supabase = await createClient();

  const workoutExerciseActions: WorkoutExerciseActions = {
    add: addAssignedExercise.bind(null, params.clientId),
    update: updateAssignedExercise.bind(null, params.clientId),
    remove: removeAssignedExercise.bind(null, params.clientId),
    reorder: reorderAssignedExercises.bind(null, params.clientId),
    createBlock: createAssignedBlock.bind(null, params.clientId),
    updateBlock: updateAssignedBlock.bind(null, params.clientId),
    ungroupBlock: ungroupAssignedBlock.bind(null, params.clientId),
    deleteBlock: deleteAssignedBlock.bind(null, params.clientId),
    moveUnit: moveAssignedUnit.bind(null, params.clientId),
  };

  const { data: workout, error } = await supabase
    .from("assignments")
    .select(
      "id, name, description, photo_path, photo_url, video_path, video_url, assigned_at, source_template_id",
    )
    .eq("id", params.assignedWorkoutId)
    .eq("client_id", params.clientId)
    .eq("coach_id", coach.id)
    .eq("type", "workout")
    .single();

  if (error || !workout) redirect(`/dashboard/clients/${params.clientId}`);

  const [{ data: componentRows }, { data: blockRows }, { data: exerciseRows }] = await Promise.all([
    supabase
      .from("assignment_components")
      .select(
        "id, order_index, group_id, source_template_id, name, instructions, sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes",
      )
      .eq("assignment_id", workout.id)
      .order("order_index"),
    supabase
      .from("assignment_component_groups")
      .select("id, block_type, rounds, notes")
      .eq("assignment_id", workout.id),
    // Same "own + shared" exercise list the template editor uses.
    supabase.from("templates").select("id, name, coach_id").eq("type", "exercise").order("name"),
  ]);

  const items: WorkoutExerciseItem[] = ((componentRows ?? []) as AssignmentComponentRow[]).map((row) => ({
    id: row.id,
    exercise_id: row.source_template_id ?? row.id,
    exercise_name: row.name,
    order_index: row.order_index,
    block_id: row.group_id,
    sets: row.sets,
    reps: row.reps,
    prescription_type: row.prescription_type,
    duration_seconds: row.duration_seconds,
    weight_note: row.weight_note,
    rest_seconds: row.rest_seconds,
    tempo: row.tempo,
    notes: row.notes,
  }));

  const blocks = (blockRows ?? []) as WorkoutBlock[];

  const availableExercises = ((exerciseRows ?? []) as { id: string; name: string; coach_id: string | null }[]).map(
    (e) => ({ id: e.id, name: e.name, shared: e.coach_id === null }),
  );

  const [{ photoUrl, videoUrl }, sourceStillExists] = await Promise.all([
    resolveMediaPair(supabase, workout),
    workout.source_template_id
      ? supabase
          .from("templates")
          .select("id")
          .eq("id", workout.source_template_id)
          .eq("type", "workout")
          .eq("coach_id", coach.id)
          .maybeSingle()
          .then((r) => !!r.data)
      : Promise.resolve(false),
  ]);

  const { data: sessionRows } = await supabase
    .from("workout_sessions")
    .select("id, performed_on, completed_at, notes")
    .eq("assigned_workout_id", workout.id)
    .order("performed_on", { ascending: false });
  const sessions = (sessionRows ?? []) as SessionRow[];

  const prCounts: Record<string, number> = {};
  if (sessions.length > 0) {
    const { data: prRows } = await supabase
      .from("workout_session_exercises")
      .select("session_id")
      .in("session_id", sessions.map((s) => s.id))
      .eq("is_pr", true);
    for (const row of prRows ?? []) {
      prCounts[row.session_id] = (prCounts[row.session_id] ?? 0) + 1;
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Back
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{workout.name}</h1>
        <p className="text-xs text-ink-muted">
          Assigned {new Date(workout.assigned_at).toLocaleDateString()}
          {sourceStillExists && (
            <>
              {" · "}
              <Link
                href={`/dashboard/library/workouts/${workout.source_template_id}`}
                className="underline hover:text-ink-primary"
              >
                originally from your library
              </Link>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Editing this client&apos;s own copy -- changes here apply only to this assignment, not your library workout.
        </p>
      </div>

      {searchParams.error && <p className="text-sm text-danger">{searchParams.error}</p>}

      {workout.description && <p className="text-sm text-ink-secondary">{workout.description}</p>}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}
      <VideoPreview path={workout.video_path} url={workout.video_url} resolvedUrl={videoUrl} />

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Exercises</h2>
        <WorkoutExerciseListEditor
          targetId={workout.id}
          actions={workoutExerciseActions}
          returnTo={returnTo}
          items={items}
          blocks={blocks}
          availableExercises={availableExercises}
        />
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Session history</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/clients/${params.clientId}/assigned/workouts/${workout.id}/sessions/${s.id}`}
                  className="flex items-center justify-between rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm hover:bg-[color:var(--border-hairline)]"
                >
                  <span className="text-ink-primary">{new Date(s.performed_on).toLocaleDateString()}</span>
                  <span className="text-xs text-ink-muted">
                    {s.completed_at ? "completed" : "in progress"}
                    {prCounts[s.id] ? ` · ${prCounts[s.id]} PR${prCounts[s.id] === 1 ? "" : "s"}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
