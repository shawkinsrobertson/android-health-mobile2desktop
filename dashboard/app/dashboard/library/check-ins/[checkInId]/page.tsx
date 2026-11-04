import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { FormBuilder } from "@/components/library/FormBuilder";
import { AssignCheckInToClientCard } from "@/components/library/AssignCheckInToClientCard";
import type { FormSchema } from "@/lib/forms";
import { updateCheckIn, deleteCheckIn } from "../actions";
import { assignLibraryCheckInToClient } from "../../assign-actions";

export const dynamic = "force-dynamic";

export default async function CheckInDetailPage({
  params,
  searchParams,
}: {
  params: { checkInId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const [{ data: checkIn, error }, { data: clientRows }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, description, form_schema")
      .eq("id", params.checkInId)
      .eq("type", "check_in")
      .eq("coach_id", profile.id)
      .single(),
    supabase
      .from("client_profiles")
      .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
      .eq("coach_id", profile.id),
  ]);

  if (error || !checkIn) redirect("/dashboard/library/check-ins");

  const clients = (
    (clientRows ?? []) as unknown as {
      profile_id: string;
      profiles: { full_name: string | null; email: string } | null;
    }[]
  ).map((c) => ({ id: c.profile_id, name: c.profiles?.full_name || c.profiles?.email || "Unnamed client" }));

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/library/check-ins"
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← Check-ins
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">{checkIn.name}</h1>
        </div>
        <form action={deleteCheckIn.bind(null, checkIn.id)}>
          <button type="submit" className="text-xs text-ink-secondary hover:text-danger">
            Delete
          </button>
        </form>
      </div>

      <form action={updateCheckIn.bind(null, checkIn.id)} className="flex flex-col gap-4">
        {searchParams.error && <p className="text-sm text-danger">{searchParams.error}</p>}

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Name
          <input
            name="name"
            required
            defaultValue={checkIn.name}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Description <span className="text-ink-muted">(optional)</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={checkIn.description ?? ""}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <FormBuilder name="form_schema" initialSchema={(checkIn.form_schema ?? []) as FormSchema} />

        <button
          type="submit"
          className="w-fit rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Save changes
        </button>
      </form>

      <AssignCheckInToClientCard
        itemId={checkIn.id}
        action={assignLibraryCheckInToClient}
        clients={clients}
      />
    </div>
  );
}
