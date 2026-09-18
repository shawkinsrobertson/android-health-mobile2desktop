import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { CoachNotes } from "@/components/CoachNotes";
import type { CoachNoteRow } from "../notes-actions";

export const dynamic = "force-dynamic";

export default async function ClientNotesPage({ params }: { params: { clientId: string } }) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [clientProfile, profileRes, notesRes] = await Promise.all([
    getClientProfile(params.clientId, supabase),
    supabase.from("profiles").select("full_name, email").eq("id", params.clientId).single(),
    supabase
      .from("coach_notes")
      .select("id, body, is_private, created_at")
      .eq("coach_id", coach.id)
      .eq("client_id", params.clientId)
      .order("created_at", { ascending: false }),
  ]);

  if (!clientProfile || clientProfile.coachId !== coach.id || profileRes.error) {
    redirect("/dashboard");
  }

  const client = profileRes.data;
  const notes = (notesRes.data ?? []) as CoachNoteRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← {client?.full_name || client?.email || "Client"}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">Coach notes</h1>
        <p className="text-sm text-ink-secondary">
          Only you see these. Mark a note private to keep it out of the AI assistant&apos;s context too.
        </p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <CoachNotes clientId={params.clientId} initialNotes={notes} />
      </section>
    </div>
  );
}
