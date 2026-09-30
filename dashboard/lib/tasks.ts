import type { SupabaseClient } from "@supabase/supabase-js";

export interface TaskRow {
  id: string;
  coach_id: string;
  text: string;
  done: boolean;
  source_kind: string | null;
  source_id: string | null;
  created_at: string;
}

export async function listTasks(supabase: SupabaseClient, coachId: string): Promise<TaskRow[]> {
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("coach_id", coachId)
    .order("done", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as TaskRow[];
}

export async function createTask(
  supabase: SupabaseClient,
  coachId: string,
  text: string,
  source?: { kind: string; id: string },
): Promise<void> {
  await supabase.from("tasks").insert({
    coach_id: coachId,
    text,
    source_kind: source?.kind ?? null,
    source_id: source?.id ?? null,
  });
}

export async function toggleTask(supabase: SupabaseClient, taskId: string, done: boolean): Promise<void> {
  await supabase.from("tasks").update({ done }).eq("id", taskId);
}
