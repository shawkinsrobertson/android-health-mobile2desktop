-- Invite links card: a coach generating a link for a specific prospective
-- client had no way to label it with their name -- every pending link in
-- the list just showed a bare token URL, indistinguishable from any
-- other. Nullable so the plain "Generate invite link" quick-action
-- (dashboard/app/dashboard/page.tsx's own card, unchanged) keeps working
-- exactly as before -- only the Clients page's new named-link modal sets
-- this.

alter table public.invite_links
  add column if not exists client_name text;
