import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "SUPABASE_URL / SUPABASE_ANON_KEY are not set. Copy .env.local.example to " +
      ".env.local and fill them in — the dashboard has no data source until then.",
  );
}

// Server-only client: import this from server components / route handlers
// only (never a "use client" file), so the anon key never reaches the
// browser even though RLS on this project already permits it there too.
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: { persistSession: false },
});
