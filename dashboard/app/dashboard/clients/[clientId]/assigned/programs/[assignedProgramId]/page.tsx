import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";

export const dynamic = "force-dynamic";

interface AssignedWorkoutRow {
  id: string;
  name: string;
  order_index: number | null;
}

export default async function AssignedProgramPage({
  params,
}: {
  params: { clientId: string; assignedProgramId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const { data: program, error } = await supabase
    .from("assigned_programs")
    .select("id, name, description, photo_path, photo_url, video_path, video_url, assigned_at, source_library_program_id")
    .eq("id", params.assignedProgramId)
    .eq("client_id", params.clientId)
    .eq("coach_id", coach.id)
    .single();

  if (error || !program) redirect(`/dashboard/clients/${params.clientId}`);

  const [{ data: workoutRows }, { photoUrl, videoUrl }, sourceStillExists] = await Promise.all([
    supabase
      .from("assigned_workouts")
      .select("id, name, order_index")
      .eq("assigned_program_id", program.id)
      .order("order_index"),
    resolveMediaPair(supabase, program),
    program.source_library_program_id
      ? supabase
          .from("library_programs")
          .select("id")
          .eq("id", program.source_library_program_id)
          .eq("coach_id", coach.id)
          .maybeSingle()
          .then((r) => !!r.data)
      : Promise.resolve(false),
  ]);

  const workouts = (workoutRows ?? []) as AssignedWorkoutRow[];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Back
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{program.name}</h1>
        <p className="text-xs text-ink-muted">
          Assigned {new Date(program.assigned_at).toLocaleDateString()}
          {sourceStillExists && (
            <>
              {" · "}
              <Link
                href={`/dashboard/library/programs/${program.source_library_program_id}`}
                className="underline hover:text-ink-primary"
              >
                originally from your library
              </Link>
            </>
          )}
        </p>
      </div>

      {program.description && <p className="text-sm text-ink-secondary">{program.description}</p>}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}
      {videoUrl && (
        <video src={videoUrl} controls className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Workouts</h2>
        {workouts.length === 0 ? (
          <p className="text-sm text-ink-muted">No workouts in this program.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workouts.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/dashboard/clients/${params.clientId}/assigned/workouts/${w.id}`}
                  className="block rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm text-ink-primary hover:bg-[color:var(--border-hairline)]"
                >
                  {w.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
