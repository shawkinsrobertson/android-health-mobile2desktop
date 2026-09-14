import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";

export const dynamic = "force-dynamic";

interface AssignedExerciseRow {
  id: string;
  order_index: number;
  name: string;
  instructions: string | null;
  photo_path: string | null;
  photo_url: string | null;
  video_path: string | null;
  video_url: string | null;
  sets: number | null;
  reps: string | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export default async function ClientAssignedWorkoutPage({
  params,
}: {
  params: { assignedWorkoutId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const { data: workout, error } = await supabase
    .from("assigned_workouts")
    .select("id, name, description, photo_path, photo_url, video_path, video_url")
    .eq("id", params.assignedWorkoutId)
    .eq("client_id", profile.id)
    .single();

  if (error || !workout) redirect("/client/assigned");

  const { data: exerciseRows } = await supabase
    .from("assigned_workout_exercises")
    .select(
      "id, order_index, name, instructions, photo_path, photo_url, video_path, video_url, sets, reps, weight_note, rest_seconds, tempo, notes",
    )
    .eq("assigned_workout_id", workout.id)
    .order("order_index");

  const exercises = (exerciseRows ?? []) as AssignedExerciseRow[];

  const [{ photoUrl, videoUrl }, exerciseMedia] = await Promise.all([
    resolveMediaPair(supabase, workout),
    Promise.all(exercises.map((e) => resolveMediaPair(supabase, e))),
  ]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link href="/client/assigned" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Your training
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{workout.name}</h1>
      </div>

      {workout.description && <p className="text-sm text-ink-secondary">{workout.description}</p>}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}
      {videoUrl && (
        <video src={videoUrl} controls className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Exercises</h2>
        {exercises.length === 0 ? (
          <p className="text-sm text-ink-muted">No exercises in this workout.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {exercises.map((ex, i) => (
              <li key={ex.id} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
                <div className="flex items-start gap-3">
                  {exerciseMedia[i].photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={exerciseMedia[i].photoUrl!}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-primary">{ex.name}</div>
                    <div className="text-xs text-ink-muted">
                      {[
                        ex.sets ? `${ex.sets} sets` : null,
                        ex.reps ? `${ex.reps} reps` : null,
                        ex.weight_note,
                        ex.rest_seconds ? `${ex.rest_seconds}s rest` : null,
                        ex.tempo,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No prescription details"}
                    </div>
                    {ex.instructions && (
                      <p className="mt-1 text-xs text-ink-secondary">{ex.instructions}</p>
                    )}
                    {ex.notes && <p className="mt-1 text-xs text-ink-secondary">{ex.notes}</p>}
                    {exerciseMedia[i].videoUrl && (
                      <video
                        src={exerciseMedia[i].videoUrl!}
                        controls
                        className="mt-2 max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)]"
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
