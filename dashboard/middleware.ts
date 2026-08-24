import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Routes reachable without a session. Everything else under the matcher
// below requires one -- role-specific authorization (coach vs client, and
// whether a client has finished onboarding) is each page's own job, since
// that needs a profile lookup middleware shouldn't be doing on every request.
const PUBLIC_PATHS = ["/login", "/join", "/auth/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!supabaseUrl || !supabaseAnonKey) {
    // No Supabase configured yet -- let requests through rather than
    // redirect-looping to a /login page that can't authenticate anyone.
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images, and the existing public
    // overview/coach-chat routes (unchanged, still single-user for now).
    "/((?!_next/static|_next/image|favicon.ico|api/chat|coach$|$).*)",
  ],
};
