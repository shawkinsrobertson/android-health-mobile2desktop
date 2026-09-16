import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

interface AssignedRow {
  id: string;
  name: string;
  assigned_at: string;
}

export default async function ClientAssignedPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const [{ data: workoutRows }, { data: programRows }, { data: documentRows }] = await Promise.all([
    supabase
      .from("assigned_workouts")
      .select("id, name, assigned_at")
      .eq("client_id", profile.id)
      .is("assigned_program_id", null)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("assigned_programs")
      .select("id, name, assigned_at")
      .eq("client_id", profile.id)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("assigned_documents")
      .select("id, name, assigned_at")
      .eq("client_id", profile.id)
      .order("assigned_at", { ascending: false }),
  ]);

  const workouts = (workoutRows ?? []) as AssignedRow[];
  const programs = (programRows ?? []) as AssignedRow[];
  const documents = (documentRows ?? []) as AssignedRow[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Your training</h1>
        <p className="text-sm text-ink-secondary">What your coach has assigned you.</p>
      </div>

      <Section title="Programs" items={programs} hrefFor={(id) => `/client/assigned/programs/${id}`} />
      <Section title="Workouts" items={workouts} hrefFor={(id) => `/client/assigned/workouts/${id}`} />
      <Section title="Documents" items={documents} hrefFor={(id) => `/client/documents/${id}`} />
    </div>
  );
}

function Section({
  title,
  items,
  hrefFor,
}: {
  title: string;
  items: AssignedRow[];
  hrefFor: (id: string) => string;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={hrefFor(item.id)}
                className="flex items-center justify-between rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm text-ink-primary hover:bg-[color:var(--border-hairline)]"
              >
                <span>{item.name}</span>
                <span className="text-xs text-ink-muted">
                  {new Date(item.assigned_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
