import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "SUPABASE_URL / SUPABASE_ANON_KEY are not set. Copy .env.local.example to " +
      ".env.local and fill them in -- auth and data reads have nothing to talk to until then.",
  );
}

// Cookie-aware Supabase client for Server Components, Server Actions, and
// Route Handlers. This is how the app does auth (magic link session
// cookies) -- there is deliberately no browser-side Supabase client, so the
// anon key never ships in client JS, same security posture the rest of the
// dashboard already relies on.
//
// Server Components can read cookies but not write them (Next.js
// restriction), so `setAll` there is a no-op wrapped in try/catch; the
// middleware is what actually refreshes the session cookie on each request.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component -- ignore; middleware refreshes
          // the session cookie on the next request instead.
        }
      },
    },
  });
}
