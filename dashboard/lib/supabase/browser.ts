import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Chat is the first feature that needs a live connection (Supabase
// Realtime) rather than a request/response page load, which means a
// browser-side client -- unlike the rest of the app (see server.ts's
// comment), this one does ship the anon key to the client JS bundle. That's
// the standard, supported way to use Supabase Realtime: the anon key isn't
// a secret, RLS (already enforced on every table this subscribes to) is
// the actual access boundary, exactly as it is for every server-side read
// in this app already.
export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set -- chat realtime has nothing to connect to.",
    );
  }
  return createBrowserClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
}
