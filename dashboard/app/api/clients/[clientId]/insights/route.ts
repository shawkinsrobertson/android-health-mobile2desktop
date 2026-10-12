import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { generateInsight, getLatestInsight } from "@/lib/insights";

// Same auth/ownership shape as app/api/clients/[clientId]/assistant/route.ts.
// Tool Runner needs Node, not edge.
export const runtime = "nodejs";

async function requireOwnedClient(clientId: string) {
  const coach = await getCurrentProfile();
  if (!coach || coach.role !== "coach") {
    return { error: new Response(JSON.stringify({ error: "Not signed in as a coach" }), { status: 401 }) } as const;
  }

  const supabase = await createClient();
  const clientProfile = await getClientProfile(clientId, supabase);
  if (!clientProfile || clientProfile.coachId !== coach.id) {
    return { error: new Response(JSON.stringify({ error: "Not your client" }), { status: 403 }) } as const;
  }

  return { coach, supabase } as const;
}

export async function GET(_request: Request, { params }: { params: { clientId: string } }) {
  const result = await requireOwnedClient(params.clientId);
  if ("error" in result) return result.error;

  const insight = await getLatestInsight(result.supabase, result.coach.id, params.clientId);
  return Response.json({ insight });
}

export async function POST(_request: Request, { params }: { params: { clientId: string } }) {
  const result = await requireOwnedClient(params.clientId);
  if ("error" in result) return result.error;

  try {
    const insight = await generateInsight(result.supabase, result.coach.id, params.clientId);
    return Response.json({ insight });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Couldn't generate an insight" }),
      { status: 500 },
    );
  }
}
