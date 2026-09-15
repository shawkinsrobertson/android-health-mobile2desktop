import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// For Route Handlers that establish a session and then redirect
// (/auth/confirm, /auth/callback) -- NOT for Server Components/Actions,
// which should keep using ./server.ts's createClient().
//
// createClient()'s setAll writes through next/headers' cookies().set(),
// which Next.js reliably auto-merges into whatever response a Server
// Component/Action produces -- and middleware.ts uses the same approach
// by explicitly rebuilding NextResponse.next({ request }) inside setAll
// and re-setting each cookie on it. But a Route Handler that returns a
// brand-new NextResponse.redirect(...) doesn't get that auto-merge: the
// cookie mutation and the response object are disconnected, so a session
// verifyOtp()/exchangeCodeForSession() just established can silently fail
// to reach the browser, leaving the very next request looking signed-out.
//
// This collects every cookie Supabase wants to set instead of writing
// them anywhere, so the caller can attach them to the exact response it's
// about to return, once it knows what that response is (the destination
// URL isn't known until after the auth call resolves).
export async function createRouteHandlerClient() {
  const cookieStore = await cookies();
  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  function applyCookies<T extends NextResponse>(response: T): T {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  return { supabase, applyCookies };
}
