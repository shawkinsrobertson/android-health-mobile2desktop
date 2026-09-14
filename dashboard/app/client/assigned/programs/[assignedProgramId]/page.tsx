import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";

export const dynamic = "force-dynamic";

interface AssignedWorkoutRow {
  id: string;
  name: string;
  order_index: number | null;
}

export default async function ClientAssignedProgramPage({
  params,
}: {
  params: { assignedProgramId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const { data: program, error } = await supabase
    .from("assigned_programs")
    .select("id, name, description, photo_path, photo_url, video_path, video_url")
    .eq("id", params.assignedProgramId)
    .eq("client_id", profile.id)
    .single();

  if (error || !program) redirect("/client/assigned");

  const [{ data: workoutRows }, { photoUrl, videoUrl }] = await Promise.all([
    supabase
      .from("assigned_workouts")
      .select("id, name, order_index")
      .eq("assigned_program_id", program.id)
      .order("order_index"),
    resolveMediaPair(supabase, program),
  ]);

  const workouts = (workoutRows ?? []) as AssignedWorkoutRow[];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link href="/client/assigned" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Your training
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{program.name}</h1>
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
                  href={`/client/assigned/workouts/${w.id}`}
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
