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

## Phase 1 -- content libraries (shipped)

Full CRUD for `library_exercises` / `library_workouts` / `library_programs`
/ `library_documents` (coach-scoped). Workouts and programs reference their
children (exercises, workouts) via live join rows -- editing an exercise or
workout updates everywhere it's still referenced by something unassigned.
Every photo/video slot supports both a Supabase Storage upload and an
external URL, independently. Documents are either a plain uploaded/linked
file or a coach-built dynamic form (text / number / dropdown / checkbox /
multiple_choice / file_upload fields). See
`supabase/migrations/0004_libraries.sql`.

Persisted 1:1 coach↔client chat threads (replacing today's ephemeral
`/coach` chat pattern) were originally scoped into this phase but weren't
built here -- shipped later, as Phase 3 below.

Also not built here, flagged for a later discussion rather than scoped in:
how to seed/populate the exercise library at scale (e.g. sourcing exercise
videos from YouTube by search criteria, manual vs. semi-automated).

## Phase 2 -- assignment pipeline (shipped)

`assigned_workouts` / `assigned_programs` / `assigned_documents` /
`assigned_workout_exercises` / `document_responses`.
**Snapshot-copy at assignment, not a live reference** -- assigning a
workout/program/document recursively copies its (and its children's)
current library fields onto client-owned rows via the
`assign_workout_to_client` / `assign_program_to_client` /
`assign_document_to_client` Postgres functions, so editing the library
source later never rewrites what a client was already assigned. Documents
of type "form" collect client responses into `document_responses`, keyed
by the form's field ids. See `supabase/migrations/0005_assigned.sql`.

Client completion/tracking flow -- variance from what was prescribed
(weight/reps/rest actually done vs. assigned, logged per set, with a
workout timer and a per-user weight-unit preference) shipped as "workout
tracking v2." Finishing a session walks through a confirmation modal → an
editable summary card → back to the dashboard; the client dashboard surfaces
a "next assigned workout" preview and a recent/full workout history.

The single-user Overview (`/`, `app/page.tsx`) that predated the coach/client
pivot has also been retired -- everything is gated behind
coach/client sign-in → `/dashboard` or `/client`, and
`/dashboard/clients/[clientId]` is now the only per-client data view.

## Phase 3 -- chat richness (partially shipped)

Shipped: persisted 1:1 coach↔client threads, threaded replies
(`reply_to_id`), message reactions and pinning, media attachments
(photo/video/voice) via Supabase Storage, and custom video/audio calling
(`chat_calls` + Daily.co, a custom React UI on `daily-react` rather than
Daily's prebuilt UI -- originally scoped as a separate decision, ended up
built alongside the rest of this phase).

Still open:
- **Broadcast messages fan out to N separate 1:1 threads** -- no shared
  group thread. Keeps the coach-client privacy boundary intact; a broadcast
  is "the same message sent to multiple threads," not a new thread type.
- **True per-message-per-recipient read receipts.** Today's unread state
  (`coach_last_read_at`/`client_last_read_at` on `chat_threads`) is a
  per-thread last-read pointer, not a per-message-per-recipient one --
  fine for a 1:1 thread, but broadcast fan-out above would want to know
  who's actually seen a given broadcast.

## Phase 4 -- data depth, notes, consent (in progress)

- **`coachNotes` (shipped).** A dated, coach-only note log per client
  (`coach_notes` table), with an `is_private` flag -- see the privacy note
  below -- an edit-in-place modal (save → confirm → back to the dashboard,
  not a full-page nav), and a 3-note preview on the client detail page that
  links out to a full history page once a client has more than three.
- **`coachNotes` privacy**: the AI assistant coach only ever talks *to the
  coach*, never directly to a client, so the private flag isn't guarding
  against an AI→client leak (that channel doesn't exist). It's about which
  notes the coach wants to keep for themselves alone -- sensitive client
  details they don't want surfaced even to the AI's context. In practice:
  whatever builds the AI assistant's context (system prompt today, tool
  calls later) must exclude notes flagged private; there's no client-facing
  angle to worry about.
- **`personalRecords` derivation (in progress).** Heaviest weight ever
  logged per exercise, derived from the existing per-set session logs
  (`workout_session_exercise_sets` et al.) -- no new Android/sync work
  needed, purely a dashboard-side read.
- **Consent schema/UI (in progress).** Per-data-type toggles a client sets
  during onboarding and can revisit later from a client settings page;
  the coach sees the client's current consent state (read-only) on the
  client detail page. **Consent is enforcement, not just visibility** --
  declining a data type should eventually stop it from syncing at all, not
  just hide it from the coach after the fact. That enforcement half has a
  real dependency: the Android app needs to know which client it's syncing
  as and read that client's consent settings *before* deciding what to read
  from Health Connect and push -- so enforcement can't actually land before
  Phase 6's mobile per-client-auth work. This pass ships the schema and the
  visibility-only UI; enforcement ships alongside Phase 6.
- **Additional `healthData` types beyond steps/HR/sleep/exercise/SpO2/BP/
  respiratory rate (e.g. nutrition) -- deferred to Phase 6.** Any new
  Health Connect type touches the same Android sync/auth code Phase 6 is
  about to rework, so it's bundled there rather than changing that code
  twice.

## Phase 5 -- AI assistant coach v2 (not started)

Move off "stuff everything into one system prompt" (today's `/coach`
design, fine for one user) to tool-calling -- Claude queries a specific
client's data/notes on demand -- so it scales across a full roster. Also
adds the coach↔AI "chat about a specific client" surface as its own
persisted thread, separate from coach↔client chat.

## Phase 6 -- mobile rearchitecture + iOS (up next, pulled forward)

Android app needs real per-client login instead of one shared anon key
baked into `local.properties` at build time -- this is also the
prerequisite for Phase 4's consent enforcement and its deferred
additional-health-data-types work, and for a client's `/client` dashboard
to ever show real synced numbers instead of a placeholder. Net-new iOS
HealthKit app is a separate, later effort.

**Decided 2026-09-17: pulled forward ahead of those remaining Phase 4
Android-dependent items**, once it was clear both were blocked on it
anyway -- rather than finish Phase 4 fully first, the non-blocked pieces
(coachNotes, personalRecords, consent schema/UI) ship first and the
Android-dependent remainder (consent enforcement, new health data types)
folds into this phase instead of a second Phase 4 pass.

Known shape of the work (see prior research): the Android-side change
itself is small -- roughly `SupabaseRestClient.kt` (swap the static anon
key for a per-session JWT), `SyncRepository.kt` (tag rows by real user id
instead of the manually-entered `sync_code`), `SyncStateStore.kt`/
`MainScreen.kt` (replace sync-code entry with a login screen), plus a new
session-refresh step in `SyncWorker.kt`/`SyncScheduler.kt`. The bulk of the
real work is elsewhere:
- **RLS rewrite.** `supabase/migrations/0001_init.sql` currently locks the
  health-data tables to a fully permissive `anon`-role policy
  (`using (true)` -- the header comment calls the anon key "equivalent to a
  password"). Real per-client auth needs `authenticated`-role RLS scoped to
  `auth.uid()`, replacing that.
- **Email OTP, not magic-link deep-linking.** There's no deep-link
  infrastructure in the app today (no registered URI scheme, no callback
  activity), and magic-link assumes an interactive foreground moment
  anyway. A typed-in-app 6-digit email OTP sidesteps both problems and
  fits a background-sync app better.
- **Headless session refresh for WorkManager.** Periodic background sync
  (no user present) needs a persisted, silently-refreshable session --
  auth session design has to account for that from the start, not bolt it
  on after.
- **One-time data migration** of existing `sync_code`-tagged rows to real
  per-user ids once auth lands.

## Standing product decisions

- **One coach per client** (a `coach_id` column on `client_profiles`, not a
  join table). Simplest schema for now; revisit only if multi-coach
  support becomes a real requirement -- it's a bigger migration than adding
  a join table cold, since every "coach's clients" query today assumes the
  single-FK model.
- **Magic link (email OTP)** is the only auth method. No passwords.
