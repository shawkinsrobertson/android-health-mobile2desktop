import { redirect } from "next/navigation";

// Retired as a standalone single-user AI chat surface -- Phase 5 in
// PLANNING.md plans a proper per-client replacement ("chat about a
// specific client", tool-calling instead of one shared system prompt).
// Until then this route is just a redirect, same as "/" -- see that
// page's comment.
export default function CoachPage() {
  redirect("/login");
}
