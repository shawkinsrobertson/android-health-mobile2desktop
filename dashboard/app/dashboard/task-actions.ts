"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { createTask, toggleTask } from "@/lib/tasks";

export async function addTask(text: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") {
    throw new Error("Only coaches can add tasks.");
  }
  if (!text.trim()) return;

  await createTask(await createClient(), profile.id, text.trim());
  revalidatePath("/dashboard");
}

export async function setTaskDone(taskId: string, done: boolean) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") {
    throw new Error("Only coaches can update tasks.");
  }

  await toggleTask(await createClient(), taskId, done);
  revalidatePath("/dashboard");
}
