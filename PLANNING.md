# Coaching platform: phase plan and decisions

This tracks the pivot from a single-user Health Connect → Supabase → dashboard
pipeline into a multi-tenant coach/client tool, so decisions made in planning
conversations don't just live in chat history. Update this file as scope
changes rather than re-litigating settled questions.

## Phase 0 -- accounts (shipped)

Supabase Auth (magic link), `profiles`/`client_profiles`/`invite_links`,
`auth.uid()`-scoped RLS. Coach signs in → generates an invite link → client
joins → short intake form → client dashboard shell with a top-3 data-points
picker. See `supabase/migrations/0002_accounts.sql`'s header comment for the
full design and its explicit scope boundary: existing single-user
health-data tables and the Android app are untouched by this phase.

## Phase 0.5 -- sync-code bridge (shipped)

Not a real phase, just a stopgap: a short code per client
(`client_profiles.sync_code`, shown on `/client`), entered once in the
Android app's Settings and stored on-device, tags that device's pushed
rows with the code as `user_id` instead of the health-data tables'
plain default. Makes multi-person testing possible (and finally puts
real numbers on `/client`, previously always a placeholder) without
waiting on the full Phase 6 mobile rearchitecture below. Explicitly not
real per-user isolation -- see `supabase/migrations/0003_sync_code.sql`'s
header comment. Phase 6 replaces this outright rather than building on
top of it.

## Phase 1 -- basic library + chat structure (not started)

Empty-but-real CRUD for `libraryExercise` / `libraryWorkout` /
`libraryProgram` / `libraryDocument` (coach-scoped, no assignment logic
yet), and persisted 1:1 coach↔client chat threads/messages (replacing
today's ephemeral `/coach` chat pattern for this new surface).

## Phase 2 -- assignment pipeline (not started)

`assignedExercise` / `assignedWorkout` / `assignedProgram` /
`assignedDocument`. **Snapshot-copy at assignment, not a live reference** --
assigning copies the library item's fields onto the client's assigned row,
so editing the template later never rewrites a client's already-logged
history. Client completion/tracking flow, including variance from what was
prescribed (weight/reps/rest actually done vs. assigned).

## Phase 3 -- chat richness (not started)

- **Broadcast messages fan out to N separate 1:1 threads** -- no shared
  group thread. Keeps the coach-client privacy boundary intact; a broadcast
  is "the same message sent to multiple threads," not a new thread type.
- **Replies are nested/threaded** (Slack-style, reply-to-a-specific-message
  via `parent_message_id`), not just a flat chronological log.
- **Read receipts are in scope** -- needs a per-message-per-recipient read
  state, not just a per-thread "last read" pointer, once broadcast fan-out
  is in play.
- Media (photos/video/voice notes) via Supabase Storage, reactions
  (including custom).

## Phase 4 -- data depth, notes, consent (not started)

- Additional `healthData` types beyond steps/HR/sleep/exercise/SpO2/BP/
  respiratory rate (e.g. nutrition), `personalRecords` derivation.
- **`coachNotes` privacy**: the AI assistant coach only ever talks *to the
  coach*, never directly to a client, so the private flag isn't guarding
  against an AI→client leak (that channel doesn't exist). It's about which
  notes the coach wants to keep for themselves alone -- sensitive client
  details they don't want surfaced even to the AI's context. In practice:
  whatever builds the AI assistant's context (system prompt today, tool
  calls later) must exclude notes flagged private; there's no client-facing
  angle to worry about.
- **Consent is enforcement, not just visibility.** Declining a data type
  stops it from syncing at all -- it's not synced-but-hidden-from-coach.
  This has a real dependency: the Android app needs to know which client
  it's syncing as and read that client's consent settings *before* deciding
  what to read from Health Connect and push -- so consent enforcement can't
  actually land before the Phase 6 mobile per-client-auth work below. Track
  the consent schema/UI here, but expect the enforcement half to ship
  alongside Phase 6, not before it.

## Phase 5 -- AI assistant coach v2 (not started)

Move off "stuff everything into one system prompt" (today's `/coach`
design, fine for one user) to tool-calling -- Claude queries a specific
client's data/notes on demand -- so it scales across a full roster. Also
adds the coach↔AI "chat about a specific client" surface as its own
persisted thread, separate from coach↔client chat.

## Phase 6 -- mobile rearchitecture + iOS (not started)

Android app needs real per-client login instead of one shared anon key
baked into `local.properties` at build time -- this is also the
prerequisite for Phase 4's consent enforcement and for a client's `/client`
dashboard to ever show real synced numbers instead of a placeholder. Net-new
iOS HealthKit app is a separate, later effort.

## Standing product decisions

- **One coach per client** (a `coach_id` column on `client_profiles`, not a
  join table). Simplest schema for now; revisit only if multi-coach
  support becomes a real requirement -- it's a bigger migration than adding
  a join table cold, since every "coach's clients" query today assumes the
  single-FK model.
- **Magic link (email OTP)** is the only auth method. No passwords.
