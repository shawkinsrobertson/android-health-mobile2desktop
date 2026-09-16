import { redirect } from "next/navigation";

// This used to be a standalone single-user Health Connect overview -- that
// data now only ever lives under a specific client, at
// /dashboard/clients/[clientId] (coach view) or /client (client's own
// view). Opening the app at "/" should always funnel through /login, which
// itself forwards an already-signed-in visitor on to where they belong
// (see postAuthDestination in lib/auth-redirect.ts) -- so this route is
// just the front door, not a page of its own.
export default function RootPage() {
  redirect("/login");
}
