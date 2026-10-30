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
  respiratory rate -- deferred to Phase 6, scope decided.** Any new Health
  Connect type touches the same Android sync/auth code Phase 6 is about to
  rework, so it's bundled there rather than changing that code twice. See
  Phase 6 below for the concrete list and the two decisions it needed
  (cycle-tracking's consent default, nutrition's field scope).

## Phase 5 -- AI assistant coach v2 (shipped)

Moved off "stuff everything into one system prompt" (the old `/coach`
chat, deleted in the Phase 6 auth rearchitecture) to tool-calling scoped
to one client at a time, via the Claude API's beta Tool Runner
(`betaZodTool` + `client.beta.messages.toolRunner`, streaming). Lives as
its own surface -- a new "AI assistant" section on the coach's per-client
detail page, backed by `ai_assistant_messages`
(`0021_ai_assistant_messages.sql`, same single-owner RLS shape as
`coach_notes`) -- deliberately separate from coach↔client chat.

**The core design constraint**: the model never receives any
client-identifying information, not even an anonymized id. Every tool
the model can call (`lib/assistant-tools.ts`) is a server-side closure
already scoped to one client's uuid, established after the route handler
(`app/api/clients/[clientId]/assistant/route.ts`) verifies the coach
owns that client -- no tool's input schema has an identifier-shaped
field, so there's no code path for the model to even attempt addressing
a different client. Seven tools: overview stats, daily steps, sleep
nights, personal records, coach notes, busy calendar blocks, and a
catch-all data-point summary (heart rate/exercise/SpO2/BP/respiratory
rate) -- `lib/assistant.ts` is the one place responsible for shaping
every byte the model can see.

This is the first real enforcement of two privacy flags that existed
before this phase but had nothing checking them: `coach_notes.is_private`
(promised "excluded from AI assistant context" since it shipped) and
`client_data_consent` (a data type the client declined now makes its
tool return `{ shared: false }` instead of silently omitting or
zeroing the data). `lib/calendar.ts`'s `getBusyBlocks` -- built in Phase
7 specifically anticipating this -- gets its first real caller here too.

**Residual, documented risk, not engineered away**: a non-private coach
note's free-text body, or the coach's own typed question, could still
contain the client's name -- the system prompt asks the model not to
repeat such details back, but that's a best-effort mitigation, not a
guarantee. Needs a real `ANTHROPIC_API_KEY` (console.anthropic.com) to
run -- same pattern as `DAILY_API_KEY`/Google OAuth/`RESEND_API_KEY`
earlier in this project.

**vNext, not built**: a response-quality refining pass. First live test
(2026-09-22) confirmed the tool-calling loop actually pulls real client
data end-to-end, but tone/length/formatting of the model's answers
hasn't been tuned at all yet -- flagged for a dedicated session later
this week rather than iterating blind.

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
  anyway. A typed-in-app 8-digit email OTP sidesteps both problems and
  fits a background-sync app better.
- **Headless session refresh for WorkManager.** Periodic background sync
  (no user present) needs a persisted, silently-refreshable session --
  auth session design has to account for that from the start, not bolt it
  on after.
- **One-time data migration** of existing `sync_code`-tagged rows to real
  per-user ids once auth lands.

**Auth + basic dashboards (shipped 2026-09-22).** The auth rearchitecture
above (email OTP, `SupabaseRestClient` on a per-session JWT, `SyncWorker`
gated on `AuthRepository.getValidAccessToken()`) had already landed in an
earlier pass, but nobody was actually syncing -- diagnosed to a real gap:
the dashboard's own onboarding UI (`/client`'s "Connect your phone"
section, and the coach's client-detail page's "Sync code" field) still
told people to "enter this code in Settings," a screen the Android app
no longer has. Fixed by replacing that copy with the real flow (open the
app, sign in with your account email, enter the 8-digit code you're
sent) and dropping the now-dead sync-code display -- `sync_code` stays
in the schema (nothing currently depends on removing the column) but
nothing surfaces it anymore.

Also added, since sync alone gives no feedback that it's actually
working: a basic role-aware dashboard screen.
`SupabaseRestClient` gained a `select()` method (it was write-only
before -- upsert/delete only); `SessionStore`/`AuthRepository` now also
persist and expose the signed-in user's id, not just their tokens/email.
`data/ProfileRepository.kt` reads the signed-in user's `profiles.role`
and, for a coach, their client roster (`client_profiles` + `profiles`,
relying on the coach-select RLS policies `0002_accounts.sql` already
grants for the web dashboard). `data/HealthDataRepository.kt` is a
deliberately simplified Kotlin counterpart to `dashboard/lib/queries.ts`
-- steps/sleep/heart-rate/workout summaries scoped to one `clientId`,
documented as skipping that file's overlap-dedup and cross-day prorating
(good enough to see sync is working and spot rough trends, not a second
source of truth). `ui/DashboardScreen.kt` renders it (stat rows + a
plain Compose-native bar chart, no charting dependency added) and is
shared by both a client viewing their own data (a new "View my data"
button on the existing `HomeScreen`) and a coach viewing one client's
(`ui/CoachHomeScreen.kt`, the coach's whole landing screen -- no Health
Connect/sync UI at all there, since coaches don't sync their own device
data through this app). `AuthNavHost` gained one new parameterized route
(`dashboard/{clientId}`) to carry either case.

Explicitly a basic pass, not a rebuild of the web dashboard's data
views: no pagination, no date-range picker, no per-data-point drill-down
beyond steps/sleep/HR/workouts, no offline caching. Flagged rather than
claimed tested: this environment had no Android SDK or committed Gradle
wrapper to actually compile against, so this shipped on careful manual
review against the existing code's exact conventions rather than a
build -- needs a real compile + on-device pass before trusting it
further.

**Found in that on-device pass (2026-09-23): the email template gap.**
The app built and the login screen worked, but the email that arrived
was the web dashboard's magic-link email, with no code to type in --
`VerifyCodeScreen` had nothing to show for. Root cause: README.md
section 4's "Confirm signup"/"Magic Link" template instructions
(written for the web-only PKCE-avoidance problem, before the Android
app's OTP flow existed) only ever put `{{ .TokenHash }}` in a link, never
`{{ .Token }}` -- and Android's `SupabaseAuthClient.requestOtp()` hits
the exact same `/auth/v1/otp` endpoint and the exact same one
template-per-email-type as the web flow, so there was no code path that
could have produced a code. Fixed by updating README.md's template
instructions to include both the link (still required for the web) and
`{{ .Token }}` (for Android) in the same email -- a Supabase Dashboard
template edit, not a code change, and one every environment running
both the web dashboard and the Android app needs to apply once.

**Also found in that pass: sync itself 403'd with an RLS violation once
signed in.** `SyncRepository`'s own doc comment claimed row ownership
"comes from the access token" via RLS resolving `client_id` -- that's
not how RLS works. `0015_health_data_auth.sql` adds `client_id` with no
column default and a policy checking `client_id = auth.uid()`; nothing
was actually putting `client_id` in the row payload `SyncSpec.kt`
builds, so every insert sent `client_id = null`, which never equals
`auth.uid()`. Fixed by having `SyncRepository` take a `clientId`
constructor param (from `AuthRepository.getUserId()`, already added
alongside the dashboards above) and stamp it onto every row in
`pushRecords` -- same idea as the old sync-code stamping this replaced,
just the real id instead of a substitute for it. A real backend-auth gap
that had nothing to do with being untested Kotlin -- the earlier "no
Android SDK to compile against" caveat wouldn't have caught this either
way, since it's a runtime/RLS mismatch, not a type error.

**One more found in the same pass, after the `client_id` fix above:**
syncing the same physical test device (a Garmin, reconnected to Health
Connect mid-testing) still 403'd, this time with the error explicitly
naming "USING expression" rather than the generic message above --
that's Postgres's tell for an `ON CONFLICT DO UPDATE` hitting a row it
isn't allowed to *touch*, not one it isn't allowed to *insert*.
`health_connect_id` was `unique` per table since `0001_init.sql`, back
when this was a single-user app -- once multiple accounts can share one
device's Health Connect history (this exact device had pre-multi-tenant
test data still sitting in these tables, `client_id` left `null` by
0015's backfill), re-syncing it under a *different* account hits the
same `health_connect_id` values, and `on_conflict=health_connect_id`
tried to `UPDATE` a row that null-`client_id` (nobody's, under current
RLS) row -- which RLS correctly refused. Fixed properly rather than
just deleting the colliding rows: `0022_per_client_health_data_conflict_key.sql`
drops the orphaned rows *and* swaps every health-data table's unique
constraint from `(health_connect_id)` to `(client_id, health_connect_id)`
-- `health_connect_id` only ever needs to be unique within one client's
own data, and the old global constraint would have made this exact
collision inevitable again the next time a device gets reused across
accounts (a real risk on a project still mid-testing, not just a
one-off). `SyncRepository`'s `on_conflict` target was updated to match
(`client_id,health_connect_id`). Needs this migration run before the
Android app can sync again.

**Also found (2026-09-23): a genuinely unreachable Sign Out button.**
After a session went stale (refresh failed for some reason -- an
overnight token expiry with background sync not running, or a device
system update, weren't pinned down and don't matter for the fix), the
only way back to Login is tapping Sign Out on `HomeScreen` -- but that
screen's `Column` had no scroll modifier, and its "Data types" list
(one row per synced record type, seven of them once Health Connect was
actually configured right) was a `LazyColumn`, which greedily fills all
remaining space in a bounded parent. With enough data types listed, that
pushed "Account"/"Sign out" completely off the bottom of the screen with
no way to reach them. Fixed by making the whole screen scroll
(`verticalScroll`) and swapping the data-types `LazyColumn` for a plain
`Column` + `forEach` (a `LazyColumn` inside a now-scrollable `Column`
would crash outright, not just misbehave -- same pattern already used in
`DashboardScreen.kt`/`CoachHomeScreen.kt`, which were written with a
scroll modifier from the start for exactly this reason).
**Deliberately not fixed alongside this**: automatically detecting a
dead session and routing back to Login on its own, without anyone
needing to find Sign Out at all. `getValidAccessToken()` returns null
for both "the session is genuinely dead" and "the network was briefly
unreachable right when the screen opened," and treating both the same
would silently sign someone out over a momentary connectivity blip --
worse than the bug it would fix. Left as an explicit follow-up decision
rather than shipped half-differentiated.

**Built as a follow-up, same day**: the differentiation above, so the
app can now tell those two cases apart and auto-recover from the real
one. `SupabaseAuthClient`'s `execute()` used to throw a plain
`IOException` for both a real (non-2xx) GoTrue response and a
network-level failure -- indistinguishable to any caller. It now throws
a new `SupabaseAuthHttpException(statusCode, message)` specifically for
the former; a genuine network failure still throws OkHttp's own
`IOException` naturally, before a `Response` is ever received, so the
two are structurally different exception types rather than needing
message-string parsing. `AuthRepository.getValidAccessToken()` only
clears the stored session when refresh fails with a 4xx (GoTrue
explicitly rejected the token -- expired, revoked, already used); a 5xx
or a plain `IOException` leaves the session in place and just fails
that one attempt, same as before. `MainActivity`'s role-fetch effect
(the thing that runs every time Home is reached, for either role) now
checks `getUserId()` after a failed `getValidAccessToken()` -- still
non-null means the session survived (transient failure, leave the
screen alone), null means `getValidAccessToken()` itself already
cleared it, so the effect calls the same `onSignOut()` a manual tap
would, routing back to Login without anyone needing to find a button.

**Steps still stuck past a fixed date even after everything else works
(2026-09-23, unresolved).** With RLS/composite-key/timezone-bucketing
all fixed and confirmed working for sleep, steps still capped at an old
date -- and this time confirmed *not* a data-availability problem: the
device's own Health Connect app shows current step data. The one thing
that can't be inspected from here is Health Connect's per-type changes-
API cursor (`SyncStateStore`'s stored token for `"steps"`) -- if that's
stuck (established before Garmin caught up, or a platform quirk on this
LineageOS install with a freshly-reinstalled Health Connect), every
`drainChanges()` call keeps asking "what changed since X" against a
baseline that may not be behaving as documented, and there's no way to
tell from outside Health Connect whether it's answering correctly.
Rather than guess further, added a **"Force full re-sync"** action on
`HomeScreen` (`SyncStateStore.clearAllChangesTokens()` + a manual sync)
-- already-existing plumbing, just not previously exposed in the UI --
so every type falls back to `SyncRepository.backfill()`'s plain time-
range read instead of trusting the changes cursor. This is a genuine
diagnostic step (confirms whether the cursor specifically was the
problem) as much as a workaround; if it doesn't fix steps either, the
bug is somewhere else entirely and this rules out the cursor as a
suspect.

**Force full re-sync didn't fix it either -- cursor ruled out.** A
backfill doesn't touch the changes-API cursor at all (it's a plain
time-range read), and steps still stopped at the same date, so whatever
this is, it isn't the changes token. That narrows it to two
possibilities this app genuinely can't tell apart without more
visibility: Health Connect isn't handing this app steps records past
that date at all (a permission or platform-implementation issue on this
LineageOS install, outside anything fixable in this codebase), or
records are coming back from Health Connect but getting dropped
somewhere in `SyncRepository`'s own pipeline before they reach Supabase.
Added instrumentation rather than guessing further:
`SyncResult.readSummary` (`"steps=0, heart_rate=12, ..."`) reports how
many raw records Health Connect actually returned per type *before* any
of this app's own filtering/dedup/push logic runs, surfaced directly on
`HomeScreen` under "Last sync." A `0` for steps there points squarely at
Health Connect/permissions, outside this codebase; a nonzero read with
nothing written points back at `pushRecords` or the Postgres side.

**The read count came back `steps=1761`, `+8853 row(s) written`, no
errors -- neither of the two guesses above.** Health Connect *is*
handing over steps records, and they *are* reaching Supabase; the sync
pipeline was never the problem. What was never actually checked: the
*dates* those rows carry, or whether the dashboard's own query could see
all of them. It couldn't -- `HealthDataRepository`'s steps query is
`order=start_time.asc` with no limit, and `SupabaseRestClient.select()`
sent it as a single unbounded request. PostgREST caps an unbounded
response at 1000 rows by default; an ascending sort past that cap
returns the *oldest* 1000 and silently drops everything newer -- which
looks exactly like "data stops at a fixed date," consistently, on every
rebuild. This is the identical bug `dashboard/lib/queries.ts`'s
`fetchAllRows()` already exists to work around on the web side, for this
same steps data, documented in that function's own comment -- Android's
`select()` never got the equivalent protection. Fixed by making
`select()` page through the full result in 1000-row batches instead of
trusting one request (skipped when a caller's own `params` already
specifies `limit`, e.g. the "5 most recent workouts" query, which is a
deliberate bounded top-N, not something to page past).

**Confirmed fixed (2026-09-23).** Steps now render through the current
day, gaps and spikes intact, matching real activity -- closing out what
turned out to be three unrelated bugs surfacing as the same symptom in
sequence: missing `client_id` on every pushed row, a globally-unique
`health_connect_id` colliding across accounts on a reused device, and
finally this pagination gap on the read side. Known follow-up, not
blocking: `bucketSleepByNight` doesn't merge multiple sleep sessions
landing on the same local day (unlike `bucketStepsByDay`'s per-day sum),
so a day with two recorded sessions shows two separate bars instead of
one combined entry.

**Designed 2026-09-23, not built yet: per-client preferred data source,
plus porting proper overlap dedup/proration to Android.** Chasing the
steps bug above surfaced the real reason `dashboard/lib/queries.ts`'s
`resolveOverlappingSources` exists at all -- confirmed directly (both in
Supabase and in Health Connect's own per-entry view on-device) that a
single real client can have two apps (in this case Garmin Connect and
the phone's own on-device step sensor) both writing overlapping
`StepsRecord`s for the same walk. `resolveOverlappingSources` already
handles this on the web today, but by a **per-day computed heuristic**
(whichever source's daily total is highest becomes "primary" for that
day, every other source only gap-fills the time primary didn't cover) --
not a fixed, trusted source. That heuristic can pick the wrong source on
a day it guesses wrong, and the Android dashboard (`HealthDataRepository`)
was built with neither the heuristic nor real dedup at all -- its own
doc comment says so plainly, a deliberate "rough trends, not exact
totals" simplification for the basic pass.

Two related pieces of work, scoped together since they touch the same
data:

1. **Per-client, per-data-type preferred source**, overriding the
   heuristic when set. Extends `client_data_consent` (already the
   per-`client_id`/per-`data_type` settings table matching the
   `DATA_POINTS` taxonomy) with a nullable `preferred_source` column --
   same shape of concept as consent, not a new table. When set for a
   (client, data type), the resolution logic treats that source as
   primary outright and skips the highest-total computation; every other
   source still gap-fills exactly like today, so non-preferred data
   isn't discarded, just deprioritized. No preference set -> today's
   heuristic, unchanged. Client-owned, coach read-only, same as the rest
   of `client_data_consent` -- a coach sees which source is trusted on
   the client detail page's existing Data sharing display, but only the
   client sets it, matching that table's existing ownership split.

   **Detecting when to even offer a choice** (the "easy lift" part) --
   nobody should have to think about this unless it's actually
   ambiguous for them: a query per (client, data type) for distinct
   `source_package` values contributing rows in that type's recent
   window. Zero or one distinct source (the common case) -> nothing
   shown, ever. Two or more -> that's the trigger, in two places:
   - **On the client's own `/client` page's existing Data sharing
     section**: for a data type with 2+ sources and no preference set
     yet, that row gets an inline "we noticed steps are tracked by both
     Garmin Connect and your phone -- which should we trust?" picker in
     place of its normal display. Once set, the same slot becomes a
     plain editable dropdown ("currently using Garmin Connect, change?")
     instead of a first-time prompt -- one UI slot, two framings,
     depending on whether `preferred_source` is already set. This is
     also the ongoing safety net: a client detail page load re-runs the
     cheap distinct-source check every time, so a data type that only
     becomes ambiguous later (a client stops wearing their watch for a
     stretch and the phone sensor starts contributing) still eventually
     gets caught, no separate mechanism needed.
   - **Right after the Android app's first successful sync for a data
     type** -- specifically, a type that just ran through
     `SyncRepository.backfill()` for the first time this run (the
     `existingToken == null` branch in `syncOne`, already exactly the
     "is this the first time we've ever synced this type" signal the
     code needs, just not exposed outside `SyncRepository` yet -- would
     need a small `SyncResult` addition, e.g. `firstSyncedTypes: Set<String>`,
     mirroring how `readSummary` got added for the steps-truncation
     diagnostic). After such a sync, for each type in that set, run the
     same ambiguity check; if ambiguous, show a lightweight one-time
     in-app prompt with the same "which should we trust?" framing right
     on the device, while the client's already looking at it. Skipping
     or dismissing it saves nothing (`preferred_source` stays null) --
     no snooze state to build, the web-side check above just catches it
     later regardless.
   - Friendly source names for the picker (e.g. `com.garmin.android.apps
     .connectmobile` -> "Garmin Connect") need a small lookup, duplicated
     as a plain constant on both the web (TypeScript) and Android
     (Kotlin) sides rather than a shared package for a handful of
     entries -- falls back to the raw package name for anything not in
     the list, so an unrecognized app never breaks the picker, just
     looks less polished.

2. **Port `resolveOverlappingSources`/`accumulateStepsByDay`-equivalent
   dedup and cross-midnight proration to Android's
   `HealthDataRepository`**, so its numbers stop being "rough trends
   only" and actually match the web dashboard -- the same per-day
   primary/gap-fill logic, reading the new `preferred_source` column
   first and falling back to the per-day heuristic exactly like the web
   side will. Held until the UI/interactivity pass on the dashboards, per
   explicit direction -- not started.

**New health data types, scoped 2026-09-17** (bundled into this phase --
see Phase 4 above). Prompted by realizing Health Connect isn't just "the
wearable's data" -- any app that writes to Health Connect contributes
(e.g. a CGM app writing blood glucose), so the real source list is
whatever a given client's phone has installed, not just their watch.
Record type names below are Health Connect's own (see
[the data types guide](https://developer.android.com/health-and-fitness/health-connect/data-types)),
grouped by its permission categories since that's what drives the Android
permission requests -- each becomes one new `SyncSpec` entry + Supabase
table, same pattern as the existing 7:

- **Activity** (extends steps/exercise): `ActiveCaloriesBurnedRecord`,
  `TotalCaloriesBurnedRecord`, `DistanceRecord`, `FloorsClimbedRecord`.
- **Body measurement**: `BasalMetabolicRateRecord`, `WeightRecord`.
- **Vitals** (extends HR/SpO2/BP/resp-rate): `BodyTemperatureRecord`.
  (`BloodGlucoseRecord`, also originally scoped here, shipped separately
  -- see Phase 8's blood glucose note.)
- **Nutrition**: `HydrationRecord`, and `NutritionRecord` scoped to a
  curated macro subset -- calories, protein, carbs, fat, sugar, fiber,
  sodium -- not the 40+ individual-nutrient fields Health Connect exposes
  (biotin, every vitamin/mineral, ...). What a fitness coach actually
  programs around; the full set would be a much wider table and a UI no
  one uses soon.
- **Cycle tracking** (all 7 types -- reproductive health):
  `BasalBodyTemperatureRecord`, `CervicalMucusRecord`,
  `IntermenstrualBleedingRecord`, `MenstruationFlowRecord`,
  `MenstruationPeriodRecord`, `OvulationTestRecord`,
  `SexualActivityRecord`. **Defaults to off/opt-in in
  `client_data_consent`**, unlike every other type (which defaults to
  shared) -- more sensitive than steps or heart rate, so the client has to
  actively turn it on rather than actively turn it off.
- **Wellness**: `MindfulnessSessionRecord` -- gated behind Health
  Connect's `FEATURE_MINDFULNESS_SESSION` availability check, not
  guaranteed present on every device/HC version like the others.

Not in scope (skipped as niche/telemetry-level for a coaching app, revisit
only if asked): `ElevationGainedRecord`, `Vo2MaxRecord`,
`WheelchairPushesRecord`, the cadence/power/speed series records,
`BodyFatRecord`/`BodyWaterMassRecord`/`BoneMassRecord`/`HeightRecord`/
`LeanBodyMassRecord`, `HeartRateVariabilityRmssdRecord`,
`RestingHeartRateRecord`, `SkinTemperatureRecord`.

That's 18 new record types against today's 7 -- roughly triples the
data-type surface in one phase. Worth tiering the implementation itself
(e.g. simple single-value types first, `NutritionRecord`/cycle
tracking/mindfulness last) rather than one single PR, but that's an
implementation-sequencing call for whenever this phase actually starts.

## Phase 7 -- shared coach-client calendar (shipped)

A shared calendar per coach-client pair: clients flag personal events
that could affect training (visible to the coach in full, to any AI
assistant only as an opaque busy block -- no per-event privacy flag,
that split is enforced by which query a caller uses), a booking link the
coach can send to *anyone* (not just an existing client) to grab open
time, and both a client's and the coach's own connected Google Calendar
feeding into the same view. Full design/decisions in the planning
session that scoped this -- summarized here for anyone picking it up
later:

- **Booking is native, not Cal.com** -- no second external system to
  reconcile against `calendar_events`, and Cal.com's real value (staff
  round-robin, multi-organizer conflict resolution) doesn't fit a
  1-coach-to-many-clients shape.
- **Google Calendar sync is lazy-pull**, refreshed on the token owner's
  own visit, plus a coach-triggered refresh via one narrow `security
  definer` function -- not push webhooks, not a standing background job,
  not a blanket service-role key. The one deliberate exception to this
  app's "RLS is the real boundary, no service-role bypass" rule, scoped
  to a single function/purpose.
- **CalDAV is deferred to vNext** (Apple/iCloud, Fastmail, self-hosted
  Nextcloud, etc., via `tsdav` when it lands -- the same library Cal.com
  itself uses internally). The sync-engine shape (one connection row per
  provider per user, a sync-cursor equivalent, one shared
  `calendar_events` target) is designed so this is a bolt-on later, not
  a rewrite.
- **Coach availability is a weekly template** (`coach_availability`:
  one row per day-of-week, a list of time blocks, a per-day
  available/unavailable toggle that preserves configured hours when
  toggled back on). A one-off exception (a single vacation day) is just
  an ordinary `calendar_events` block on that date.
- **The booking link isn't scoped to an existing client** -- the coach
  sends it to anyone, so a booked appointment can have no client
  relationship at all (`calendar_events.client_id`/`created_by` are
  nullable; `booker_name`/`booker_email`/`booker_phone` carry contact
  info instead). The public booking page has no session at all, so its
  read (open slots) and write (create the booking) go through two
  `security definer` RPCs (`get_open_slots`/`create_booking`) rather
  than table RLS -- same idea as `invite_status`'s narrow public view
  and `handle_new_user()`'s trigger, just as RPCs.

**Pass 1 (shipped)**: `calendar_events` + dual-ownership RLS, CRUD
actions, the collapsible `CalendarCard` (agenda/day/week/month views,
hand-rolled date-grid math, no new dependency) on the coach's dashboard,
the client's dashboard, and the coach's per-client detail page, and
lazy Daily.co video-call room creation (anchored to the event's own
`end_time`, not to whenever the event was created -- see `lib/daily.ts`'s
`createDailyRoom`/`createMeetingToken`, now taking an optional
`expEpochSeconds`). The AI-context privacy boundary
(`lib/calendar.ts`'s `getBusyBlocks`) existed from day one anticipating
Phase 5's per-client AI assistant, which now consumes it (shipped, see
Phase 5 below).

**Pass 2 (shipped)**: Google Calendar OAuth + sync --
`calendar_connections` (tokens encrypted at rest via Node's own
`crypto`, AES-256-GCM, in `lib/calendar-crypto.ts` -- a deliberate
simplification over the originally-planned `pgcrypto` approach, so the
encryption key only ever needs configuring in one place, the app's own
`CALENDAR_TOKEN_ENC_KEY` env var, not kept in sync between the app and a
Postgres setting too), the connect flow (`/api/calendar/google/{start,
callback}`), `get_calendar_sync_token`/`update_calendar_sync_state`,
incremental sync via `syncToken` (falls back to a full resync on a 410,
same shape as the Android app's Health Connect changes-token fallback),
and the "also add to Google Calendar" modal checkbox (shown only when
the signed-in user has their own connection, since it writes through
their own token). Also folded in three UX fixes from testing pass 1's
`EventModal`/video-call flow:

- **End-time auto-fill** (done): changing the start time (or date) on a
  *new* (not editing an existing) event bumps the end time to 30 minutes
  after it, instead of the end field sitting still until manually
  touched.
- **Video call link populated at save, not first "Join"** (done). Pass 1
  deliberately deferred Daily.co room creation to whoever clicked
  "Join" first, specifically to anchor the room's `exp` to the event's
  real `end_time` instead of "2 hours from whenever this was created"
  (see pass 1 above). Testing surfaced that the room/link should already
  be visible and clickable right after saving, not after a first join --
  fixed by creating the room *at save time* in `createEvent`/`updateEvent`
  when `has_video_call` is set (still using the same `end_time + 30min`
  expiry `createDailyRoom` already supports), and simplifying
  `joinCalendarEvent` down to "mint a fresh per-participant token against
  the already-existing room" -- `startCall`/`joinCall`'s split, just
  collapsed since there's no "first join creates it" case left. Known
  follow-up, not blocking: rescheduling an event with an already-created
  room doesn't currently regenerate the room's expiry to match the new
  end_time.
- **Time inputs: scrollable *and* typeable, typing filters to matching
  times** (done). The plain `<input type="datetime-local">` in pass 1
  supported typing digits but not a filtered dropdown of times --
  replaced with a plain date input plus a small custom
  `TimeCombobox` (30-minute increments, text input + a scrollable list
  that narrows by substring match as you type; picking an option or an
  exact label match commits it, otherwise the field reverts).

**Pass 3 (shipped)**: native booking. `coach_availability` (weekly
template: one row per coach/day-of-week, a `time_blocks` jsonb list so a
split day doesn't need a second row, a per-day `is_available` toggle that
preserves configured hours when re-enabled, one stored IANA timezone),
edited via a plain weekly editor (`AvailabilityEditor`, reusing pass 2's
`TimeCombobox` for each block's start/end), embedded in the expanded
calendar page below rather than a standalone route.
`profiles.booking_token` -- lazily generated (same `randomBytes(24)
base64url` shape as `invite_links.token`) the first time a coach clicks
"Generate booking link" on their dashboard, not eagerly at signup, since
not every coach uses public booking. The public `/book/[token]` page has
no session at all (added to `middleware.ts`'s `PUBLIC_PATHS`), so it
goes through the same two precedents `0002_accounts.sql` established for
exactly this situation: `booking_profile`, a narrow public view mirroring
`invite_status` (token -> coach_id/full_name, nothing else), and
`get_open_slots`/`create_booking`, a `security definer` RPC pair
(callable by `anon`) that does the actual slot math and insert entirely
in PL/pgSQL -- expanding the weekly template into concrete UTC slots in
the coach's own stored timezone, subtracting conflicting
`calendar_events` (covers real bookings *and* an ad-hoc vacation block
placed directly on the calendar), and re-validating a slot is still open
immediately before inserting (race protection against two visitors
booking the same slot). A booked appointment writes into `calendar_events`
with `client_id`/`created_by` left null and `booker_name`/`booker_email`/
`booker_phone` populated instead -- the shape `0016_calendar_events.sql`
reserved for exactly this back in pass 1. Linking a booking to an
existing client after the fact (if the booker's email matches one) is a
nice-to-have follow-up, not built.

**Post-pass-3 UI rework (shipped)**: testing surfaced that booking
link/availability didn't belong on their own dashboard sections, and
that the public booking page's week-list-of-times didn't scale well.
Changes:

- **Compact vs. expanded calendar surfaces.** The dashboard's
  `CalendarCard` (quick glance, also used on the client's own dashboard
  and a coach's per-client page) now just shows a booking-link row
  (generate/copy) and a "Manage availability →" link, instead of owning
  full sections of its own. The actual editing UI lives on a new
  `/dashboard/calendar` page (`CalendarWorkspace`) -- a permanently
  expanded, two-pane layout: a month grid in the right 2/3 (clicking a
  day opens "new event" pre-set to that day; clicking an event opens it
  for editing), and the booking link, a collapsible availability editor,
  and an agenda list of the visible month's events in the left 1/3. The
  NavBar's coach-only "Availability" link was renamed "Calendar" and now
  points here. `MonthGrid`/`WeekGrid`/`DayList`/`AgendaList`/`EventRow`
  were pulled out of `CalendarCard.tsx` into `components/calendar/
  CalendarViews.tsx` so both surfaces render from the same code, and
  `BookingLinkControl` (generate/copy) is its own small component shared
  by both the compact card and the expanded page.
- **Public booking page: month calendar + slot cards**, replacing the
  original 7-day list view. `BookingScheduler` now shows a month grid on
  the left (days with any open slot are clickable, days without are
  disabled) and that date's open times as selectable cards on the right
  -- picking one leads into the same booker-info form as before.

**Booking confirmation emails (shipped)**: `create_booking`
(`0020_booking_confirmation.sql`, replacing the function `0019` defined
-- the return type changes shape, which needs a `drop function` first,
not just `create or replace`) now returns the coach's name/email/stored
timezone alongside the booking details, so `submitBooking`
(`lib/booking-public-actions.ts`) can send email straight after the
insert with no second round-trip. `lib/email.ts` wraps Resend
(`RESEND_API_KEY`, `BOOKING_EMAIL_FROM` -- defaults to Resend's own
sandbox sender, which only delivers to the account's own verified email
until a real domain is verified) and sends two emails: the coach gets
notified a booking came in, and the booker gets a confirmation if they
gave an email. Both best-effort, same posture as `createEvent`'s "also
add to Google Calendar" write-out -- an email-provider hiccup never
fails the booking itself. Times are formatted in the coach's own stored
timezone (pulled from any one of their `coach_availability` rows), not
the server's default, so the email shows the time the booker actually
picked.

**vNext, not built**:

- **Event type -> automatic video link.** Right now "add a video call
  link" is a plain checkbox on every event, regardless of what kind of
  event it is. A nicer flow: a type selector on the new-event modal
  (e.g. Call / Session / Other), where picking "Call" or "Session"
  automatically turns on the video link instead of asking separately.
  Scoped out of this pass since it's a modal UX change, not a
  data-model one -- `has_video_call` already covers the underlying
  need.
- **Time-based reminders.** `calendar_events.reminder_minutes_before`
  is still just stored data -- nothing reads it and sends anything yet.
  Unlike booking confirmation (below), a reminder fired X minutes
  *before* an event needs an actual scheduled job, which this app has
  none of today (everything is lazy/pull-based, no cron/worker anywhere
  in this codebase). Options: Supabase's `pg_cron` extension, or a
  Vercel Cron hitting a route handler on a schedule.

## Phase 8 -- design system + UI pass (shipped)

Triggered by a set of mockups + a full color/typography reference the
user provided for a redesigned client dashboard (pull-down notification
shade, heatmap weekly streak, slide-out bottom-left nav) plus the
instruction to apply the same dark/light theme throughout both the web
dashboard and the Android app. Scoped up front via `AskUserQuestion`
into four decisions: (1) this pass covers foundation + a new client home
screen, not every screen; (2) the streak heatmap measures assigned
workout *completion*; (3) the coach dashboard gets reskinned in place,
no structural redesign (no coach mockup was provided); (4) the mockup's
"Tasks" panel ("Tell me how it was! Fill out your weekly check-in")
should be backed by a real, newly-built weekly check-in feature rather
than left as a mock.

**Design tokens.** Primary/secondary/accent + text-primary/secondary/
tertiary, light and dark (`#FFFDFB`/`#F7F1E8`/`#C1573B` light,
`#281E18`/`#675E59`/`#C1573B` dark). One documented assumption: the
mockups only gave `text-tertiary` (text/icons drawn on an accent-colored
surface) for dark mode; light mode reuses the same dark-brown
(`#281E18`) rather than guessing a new value, since Accent itself is
theme-invariant and dark text reads correctly on it either way. Web:
`dashboard/app/globals.css`'s CSS variables were repointed to these
values (kept the same variable *names* -- `--page-plane`, `--surface-1`,
`--text-primary` etc. -- so every one of the ~600 existing call sites
already using `bg-plane`/`bg-surface`/`text-ink-*` picked up the new
palette automatically, no per-file edits needed) plus two new tokens,
`--accent`/`--text-tertiary`, exposed via `tailwind.config.ts` as
`accent`/`ink.tertiary`. Chart series colors (`--series-*`) were left
alone -- they're a separate, already-validated dataviz palette, not
part of this reskin. Typography: Archivo (Title/Header/Button) + Open
Sans (Body/Links/Secondary) via `next/font/google` in `app/layout.tsx`,
plus a `fontSize` scale in `tailwind.config.ts` (`text-title`, `text-h1`
through `text-h3`, `text-button`, `text-body`, `text-link`,
`text-body-sm`) matching the mockup's exact px/weight table. Android:
new `ui/theme/Color.kt` (the same hex tokens) and a rewritten
`Theme.kt` mapping them onto Material3's color-scheme roles (`primary`/
`onPrimary` -> Accent/text-tertiary, since Material's "primary" role is
the prominent-button color the mockup uses Accent for; `background`/
`surface` -> the design system's own Primary/Secondary -- a real naming
collision between the two systems' vocab, not a bug). Archivo
(Medium/SemiBold/ExtraBold) and Open Sans (Regular/SemiBold) `.ttf`
files were fetched from Google Fonts' CSS API directly (`fonts.gstatic.com`,
the same static files `next/font/google` resolves to) into `res/font/`
and wired into a new `Type.kt`'s `HealthSyncTypography`, since Android
has no equivalent of `next/font` to fetch these at build time.

**Weekly check-ins (new feature, not a mock).** Reuses the document
library's dynamic form builder wholesale (`lib/forms.ts`'s
`FormField`/`FormSchema`/`FormAnswers`, `FormBuilder.tsx`,
`DynamicFormRenderer.tsx`) rather than inventing a second
question-authoring format -- a check-in is exactly "a form, but assigned
recurringly instead of once." `0023_check_ins.sql` adds
`check_in_templates` (one per coach-client pair, `unique(coach_id,
client_id)`, holds a `form_schema` + which day of the week it opens) and
`check_in_responses` (one row per `(template_id, week_start)`, mirroring
`assigned_documents`/`document_responses`'s "coach owns the shape,
client owns the answers" RLS split). `lib/check-ins.ts`'s
`currentWeekStart(dayOfWeek)` does the UTC, Sunday-anchored week
bucketing both the web queries and Android's `HomeSummaryRepository`
replicate identically, so a client's "is this due" state agrees between
platforms. Coach side: a new "Weekly check-in" section on the client
detail page (`components/CheckInEditor.tsx`) using `FormBuilder`
directly. Client side: `/client/check-in` (new page + NavBar link) using
`DynamicFormRenderer`, plus a "Tasks" card on the client home page that
appears only when a check-in is due. `parseFormSchema` (previously
private to the documents action) was promoted to a `lib/forms.ts` export
since it now has two real callers.

**Android client home screen redesign.** `ui/home/NotificationShade.kt`
(closed state: three glyphs -- messages/calendar/tasks -- each with an
unread dot; tap expands a panel with per-category detail, reading unread
chat state, upcoming `calendar_events`, and check-in-due status via a
new `data/HomeSummaryRepository.kt`), `ui/home/StreakHeatmap.kt` (seven
day-cells, DONE/PARTIAL/NONE shading), and `ui/nav/SlideOutNav.kt`
(bottom-left round button that expands into a pill row of destination
glyphs) replace `HomeScreen`'s old flat list layout. Two things
deliberately simplified from the mockup, stated plainly rather than
discovered later:
  - The mockup's pull-down *gesture* became a tap-to-expand chevron.
    Same end state (an expanded panel with the same three categories)
    without a hand-rolled drag gesture that has no way to be verified in
    this environment (still no Android SDK/emulator here -- see Phase 6).
  - The streak heatmap measures "did the client log *any* workout
    activity that day" (a `workout_sessions` row with `completed_at` set
    = DONE, one still in progress = PARTIAL), not "did they complete
    what was assigned that day" -- this app has no concept of a workout
    being scheduled for a specific day at all yet (the web dashboard's
    own "Next up" card has the identical gap, already noted in its own
    comment). A truer "assigned completion" streak needs real
    scheduling built first, which is out of scope here.
  Icons throughout (shade categories, streak markers, slide-out nav)
  are plain emoji `Text`, matching how the rest of this Android app
  already renders iconography (`MainActivity`'s chat "💬") -- there's no
  `material-icons-extended` dependency in this project to draw a real
  icon set from, and adding one to draw five icons wasn't worth it.
  `SlideOutNav`'s Workouts/Calendar/Inbox destinations, and the shade's
  tap-throughs to them, all land on a new `ComingSoonScreen` -- none of
  those three exist as native Android screens yet (only "View my data",
  Health Connect sync, and now Profile do). Building them for real is
  future work, not silently faked. The sync/data-type/sign-out controls
  that used to live on `HomeScreen` moved to a new `ProfileScreen`
  (reachable from the slide-out nav), matching the mockup's "profile ->
  settings" grouping -- weight units, data-sharing consent, and profile
  photo (also mentioned in the mockup) are *not* editable from Android
  yet, a real gap rather than an oversight.

**Coach dashboard reskin.** No structural changes, per the user's
explicit choice (no coach mockup existed to redesign from). Almost
entirely automatic via the token repointing above; the one manual pass
was swapping every UI-chrome usage of `var(--series-steps)` (the
dataviz blue, which had been doing double duty as this app's de facto
"primary button/link" color everywhere, coach and client side alike)
over to the new `var(--accent)` token, across 46 files -- buttons,
links, active-tab states, timer overlays, calendar event chips. Done as
a scoped `sed` pass over exactly those two literal class-name patterns,
*not* touching `StepsChart.tsx`'s actual data-bar fill color (caught and
reverted after the first pass swept it up too -- that one genuinely
needs to stay the dataviz blue, not become the brand accent).

**Known gap, surfaced then resolved as a same-day follow-up**: the
mockup's "Your Top 3" stat cards reference an "Avg. BG" (blood glucose)
stat, and this app didn't sync blood glucose anywhere when this pass
first shipped. Closed immediately after: `0024_blood_glucose.sql` adds a
`blood_glucose` table in the current (post-0022) per-client shape
directly -- `client_id not null` and `unique(client_id,
health_connect_id)` from the start, no legacy anon-RLS rows to migrate
through, plus adds `'blood_glucose'` to `client_data_consent`'s type
check constraint. Android gets a new `SyncSpec` (`BloodGlucoseRecord`,
90-day initial backfill matching `blood_pressure`'s window rather than
the 14-day one used for the higher-frequency SpO2/respiratory-rate
samples, since blood glucose readings for a non-CGM user tend to be
sparse) plus the matching `READ_BLOOD_GLUCOSE` manifest permission
(permissions requested at runtime are already derived automatically
from `allSyncSpecs` -- see `HealthConnectManager.requiredPermissions` --
but the manifest declaration is separate and has to be added by hand).
Web: `blood_glucose` added to `DATA_POINTS` and a new
`getDataPointSummary` case (average mg/dL over the last 7 days, same
shape as the existing `blood_oxygen`/`respiratory_rate` cases, so it can
actually back an "Avg. BG" stat once one gets built) -- picked up
automatically by the AI assistant's `get_data_point_summary` tool and
the client's data-point picker, both already generic over `DATA_POINTS`.
The "Your Top 3" stat cards themselves are still not built -- this only
means blood glucose is now real, synced data available whenever they
are.

**Verification**: `npx tsc --noEmit`, `npx next lint`, `npx next build`
(dummy env) all clean on the web side. Android: manual review only, same
posture as every other Android change in this project -- no SDK/Gradle
wrapper in this environment to actually compile against (see Phase 6's
opening note). Not opened in a browser or on a device -- flagged
plainly rather than claimed as tested.

**Two real bugs found on first live device test, both fixed**:

1. **The redesigned client Home screen's greeting text overlapped the
   status bar, and the slide-out nav sat half-hidden behind the system
   navigation bar.** Root cause: the old `HomeScreen` had a `Scaffold`
   wrapping everything, which applies window-inset padding
   automatically; the redesign replaced it with a plain `Box`/`Column`
   to make room for the custom notification shade at the very top, and
   never added that padding back. With `targetSdk 36` enforcing
   edge-to-edge regardless of any explicit opt-in, content drew straight
   under the system bars. Fixed with a single `.safeDrawingPadding()` on
   the outer `Box`.
2. **The notification shade + streak heatmap could get stuck showing a
   permanent loading spinner.** `HomeSummaryRepository.loadSummary()`
   ran its four sub-fetches (unread messages, upcoming calendar events,
   check-in due, week completion) with one shared, outer try/catch in
   `MainActivity` -- any single one throwing (e.g. querying
   `check_in_templates` against a Supabase project that hadn't had
   `0023_check_ins.sql` applied yet) failed the *entire* summary,
   leaving `homeSummary` permanently `null` and `HomeScreen` stuck on
   its "still loading" spinner forever -- indistinguishable from
   actually still being in flight, since there was no separate "failed"
   state. Fixed by catching each of the four sub-fetches independently
   (`runCatching` per fetch, falling back to false/empty/an all-`NONE`
   week) so one missing table can't blank out the other three, and a
   `HomeSummary` now always resolves to *something* non-null once the
   fetch completes -- which is also what actually lets the UI
   distinguish "loaded, nothing to show" from "still loading" in the
   first place.

**Confirmed fixed on device, then a third bug + a reorg request from the
same test pass**: the status-bar overlap and stuck spinner above were
both confirmed resolved on a rebuild (screenshot showed the shade/streak/
nav all rendering correctly below the status bar). That same screenshot
surfaced a third, distinct bug: the page background was plain white with
black text regardless of the device's actual (dark) theme, while the
hand-styled sub-components (shade, streak cells) correctly showed dark-
theme colors -- a visible mismatch. Root cause was adjacent to bug #1 but
different: `Scaffold` doesn't just apply inset padding, it also wraps
content in a `Surface`, which paints `colorScheme.background` behind
everything and sets `LocalContentColor` so every plain `Text()` picks up
the right on-background color automatically. Dropping `Scaffold` lost
that too -- a bare `Box`/`Column` shows the raw Android window background
(white) and `Text()` falls back to its hardcoded-black default, while
components that set colors explicitly off `MaterialTheme.colorScheme`
(the shade, the heatmap cells) rendered correctly since they never
depended on either default. Fixed by wrapping `HomeScreen`'s root in a
`Surface(color = MaterialTheme.colorScheme.background)` alongside the
existing inset-padding `Box`.

Same round, a reorg request: data-sync controls ("Sync now", force
re-sync, per-type last-synced status) don't belong on the client
dashboard/home screen -- they're settings, not something to look at
daily. Moved "Sync now" and the last-sync result text (previously still
on `HomeScreen`) into `ProfileScreen` alongside the force-resync/data-
type controls that had already landed there; `HomeScreen` no longer
takes `isSyncing`/`lastResult`/`onSyncNow` at all. The existing "Data"
screen (`DashboardScreen.kt`, steps/sleep/heart-rate charts) is
relabeled "Stats" and moved from a button on Home into a fifth
`SlideOutNav` destination (alongside Workouts/Calendar/Inbox/Profile),
reusing the same `onOpenDashboard` callback that button used to call --
no new navigation plumbing needed, since it was always just "go to
DashboardScreen with my own id."

**Real icon set, replacing the emoji placeholders.** The user supplied
13 SVGs (`icons-and-nav-svgs.zip`) -- exactly the nav/shade categories
this pass had been standing in for with plain emoji, plus four workout-
equipment icons and a generic edit/delete pair. Converted with
`svg2vectordrawable` (npm) into Android vector drawables under
`android/app/src/main/res/drawable/`, and into React components (`fill`/
`stroke` swapped to `currentColor`, matching the one existing inline-SVG
convention already in this codebase -- `app/client/page.tsx`'s original
`DumbbellIcon`) under `dashboard/components/icons/`. Two files
(`dumbbell-icon.svg`, `bodyweight-icon.svg`) use an internal `<mask>`/
`<clipPath>` with an `id` referenced via `url(#id)` -- a first
mechanical pass blindly normalized every `fill="white"` to `fill="none"`
to strip an unrelated clip-rect's fill, which also corrupted the mask's
own `fill="white"` (mask opacity, not a visible color) and broke it;
caught before shipping and fixed by only touching the two literal brand
colors, never `fill="white"`. Separately, those same two id-bearing SVGs
would collide in the DOM if their React component ever rendered twice on
one page (`id`/`url(#id)` are global per document) -- fixed by generating
each one's id via React's `useId()` instead of hardcoding the source
SVG's id.

Wired in: `NotificationShade`'s three category icons + expand chevron,
`SlideOutNav`'s toggle arrow + Stats/Workouts/Calendar/Inbox icons, the
web `NavBar`'s Calendar/Check-in/Inbox links, `app/client/page.tsx`'s
"Next up" card (replacing its old hand-drawn dumbbell), and `CoachNotes`'
Edit/Delete buttons. The barbell/bodyweight/kettlebell icons, and a
wider edit/delete sweep across the rest of the app, are placed as
assets but not wired anywhere yet -- left for whenever the real
Workouts screen or a broader icon pass happens.

**Profile placeholder icon, added same-day.** A "P" monogram avatar
badge (filled circle + border + accent-colored letter), not a tintable
line icon like the rest -- converted the same way but *without* the
`currentColor` swap, since it's meant to look identical regardless of
surrounding theme (`ProfilePlaceholderIcon.tsx` on web keeps its literal
hex colors; the Android drawable does too). `NavDestination` gained a
`tinted: Boolean = true` flag so `SlideOutNav` can render a destination's
icon with its own baked-in colors (`tint = Color.Unspecified`) instead of
recoloring it to match the nav pill -- Profile is the first and only
caller of `tinted = false`. Closes the one real gap the icon set left
open.

**Confirmed on device (colors + icons both correct in dark theme), then
a layout request from that same test round**: move the streak heatmap
into the notification shade itself, collapsed-state showing a compact
generic preview on the right (matching the mockup) rather than living in
`HomeScreen`'s own body. `ShadeContent` gained a `weekDays` field;
`StreakHeatmap.kt` gained a second composable, `StreakPreview` -- a
small 7-dot row, same DONE/PARTIAL/NONE coloring as the full heatmap,
sized to sit inline with the shade's category icons. The closed shade
row now reads icons-left, `StreakPreview` + the expand chevron grouped
right; expanding reveals a new "This week" section (the full
`StreakHeatmap`) ahead of Messages/Calendar/Tasks. Caught and fixed a
contrast bug while doing this: the heatmap's own "NONE" cell color was
`colorScheme.surfaceVariant`, which in this theme is the *same* color as
the shade's own background (`colorScheme.surface`) -- fine sitting on
the page background, invisible sitting inside the shade. Both
`StreakHeatmap` and `StreakPreview` now use a theme-independent
`onSurface.copy(alpha = 0.12f)` for empty days instead, visible against
either background. `HomeScreen`'s own body is now just the greeting --
deliberately empty otherwise, until something like the mockup's "Your
Top 3" stat cards gets built.

**Second icon batch: chat icons + a size-corrected dumbbell.** Six more
SVGs (`icon-set-2-with-updates.zip`): attach (paperclip), microphone,
phone, a two-person "clients" glyph, an open-book "libraries" glyph, and
a revised dumbbell. Same `svg2vectordrawable`/`currentColor`-swap
pipeline as the first batch. The dumbbell was the one with an actual
geometry change, not just a new asset: the old path stayed inset within
the 24x24 box (spanning roughly x 1.25-22.75, y 6.25-17.75), so it
rendered visibly smaller than every other nav icon at the same
`Modifier.size()`/`className`; the new one spans the full 0-24 edge to
edge, which is what "more size consistency in the nav" meant concretely.
It kept the same internal `<mask>`-based hollow-stroke trick (still id
`path-1-inside-1_815_62` in the source, still handled via `useId()` on
the web side) -- a drop-in replacement of the same filenames
(`ic_dumbbell.xml`, `DumbbellIcon.tsx`), so neither `SlideOutNav` (the
Workouts destination) nor `app/client/page.tsx`'s "Next up" card needed
any code changes.

Wired the rest into their obvious targets: the chat `Composer`'s emoji
attach/microphone buttons (📎/🎙️) became `AttachIcon`/`MicrophoneIcon`,
`CallButton`'s 📞 became `PhoneIcon`, and the web `NavBar`'s coach-only
"Clients"/"Library" text links picked up `ClientsIcon`/`LibrariesIcon`
alongside their label text, matching the icon+text pattern already used
for Calendar/Check-in. The composer's recording-stop state (⏹) was left
as a plain filled square rather than sourcing a seventh icon -- no stop
icon was supplied and it's a two-state toggle on one button, not worth a
separate asset for. `npx tsc --noEmit` / `npx next lint` / dummy-env
`npx next build` all clean; Android changes are drawable-only (no Kotlin
touched beyond what the dumbbell replacement already covered), so same
manual-review-only posture as the rest of this phase's Android work.

**Native workout-logging flow, from a two-screen mockup ("today's
workout" browse state + an active/logging state with a running timer and
per-set fields).** The Workouts `SlideOutNav` destination had been a
`ComingSoonScreen` stub since Phase 8's redesign; this replaces it with a
real screen, reusing the web dashboard's existing "workout tracking v2"
data model (`workout_sessions`/`workout_session_exercises`/
`workout_session_sets`, `dashboard/lib/session-log.ts`'s lazy-seed
pattern) rather than inventing a parallel one -- same tables, same RLS
(client owns full CRUD on their own rows, coach select-only), reimplemented
in Kotlin against this app's plain PostgREST client instead of the
Supabase JS SDK. One real schema gap found and closed:
`0025_workout_session_set_completion.sql` adds a `completed` boolean to
`workout_session_sets` -- the mockup wants a checkmark per SET, but the
web schema only ever tracked completion at the whole-exercise level
(`workout_session_exercises.completed`, from `0009`). Additive, defaults
false, and the web SessionLogger doesn't read or write it yet, so this
doesn't touch anything already shipped.

Explicitly scoped via `AskUserQuestion` before building: the mockup's
"Warm-Up" card renders as a compact checklist with no weight/rest fields,
visually distinct from the full per-set logging the other exercises get
-- offered building that special case vs. uniform logging for every
exercise. **Chose uniform** (every exercise, including warm-up items,
gets the same reps/weight/rest/checkmark `SetRow` treatment) for a
simpler, more consistent implementation; a coach-authored "Warm-Up" entry
just looks like any other exercise card now, a real (accepted) departure
from the mockup's specific rendering, not an oversight.

`SupabaseRestClient` gained `insert()` (plain POST, `return=representation`,
needed for a new session's server-assigned id and the freshly-inserted
session-exercise/set rows) and `patch()` (PATCH-by-filter, `return=minimal`,
for timer state and set edits) -- both were missing entirely before this
(the client only ever upserted Health Connect data). New
`data/WorkoutRepository.kt` mirrors `session-log.ts`'s
`ensureSessionExercises` exactly (idempotent: only inserts what's
missing, so re-entering an in-progress session never duplicates rows) and
adds the timer start/pause/resume/finish calls the web's session actions
already had. New `ui/WorkoutScreen.kt` is one screen with two states
(not started / in progress) rather than a separate detail + session
route -- both mockups share the same header, and re-opening this screen
mid-workout should land straight back in the logging view. Tapping
"Start workout" creates the session row **and** starts its timer in one
call (`WorkoutRepository.startSession`), unlike the web flow where those
are two separate steps on two separate pages -- the mockup goes straight
from Start to the running-timer screen with no page in between.

"Today's workout" reuses the same placeholder `app/client/page.tsx`
already established (`assigned_program_id is null`, most recently
assigned, ordered by `assigned_at desc`) -- there's still no real per-day
scheduling anywhere in this app. Two more deliberate simplifications,
stated rather than discovered later:
- **The per-set rest countdown (the mockup's "▶ 1:30" cells) is local
  UI state only, never persisted.** It only means something live, in the
  moment; re-entering the screen mid-rest with no record of when it
  started would just show a wrong countdown, so resetting to
  "not started" on re-entry is the honest behavior.
- **"Finish" just pops back to Home**, not a full summary screen like
  the web's post-session summary page. Building an equivalent summary
  view was judged out of scope for this pass given how much else this
  feature already touches; a real gap, flagged rather than silently
  skipped.

Same manual-review-only posture as every other Android change in this
project (no SDK/Gradle wrapper in this environment to compile against --
see Phase 6's opening note): reviewed carefully against this file's own
conventions and the exact web data model it mirrors, but not built or
run on a device. One bug caught and fixed during that review, worth
naming since it's the kind that's invisible without a device: the
elapsed-timer display was driven by an unread `tick` counter incremented
inside a `LaunchedEffect` -- Compose only recomposes a `Text` when it
actually *reads* a changed `State`, and nothing read `tick`, so the
timer would have silently frozen at its starting value forever. Fixed by
having the effect recompute and store the actual elapsed-seconds value
into a `State` the `Text` reads directly, instead of a side counter
nothing depended on.

**Workout completion, dashboard population, calendar + chat first
passes.** Four features in one round, all Android-only.

*Workout summary.* `WorkoutScreen` gained a third state past
not-started/in-progress: tapping Finish sets `completed_at` and shows a
summary (workout name, duration, a notes field, every exercise's sets
still directly editable, plus a per-exercise PR toggle) with a
"Save & Return to Dashboard" button. This is a deliberate departure from
the web dashboard's own summary page, which is read-only except for
notes (a separate "Edit sets" link goes back to the logging page for
anything else) -- the ask here was specifically for editing abilities on
the summary itself, so Android doesn't mirror that read-only split.
`findActiveSession` was renamed `findTodaysSession` and its `completed_at
is.null` filter dropped, since the session needs to stay reachable
through the summary state even after it's marked complete -- re-entering
the screen a different day still correctly falls through to "not
started." Two real bugs caught in review before anything shipped: (1)
`return@ExerciseLogCard` inside lambdas passed to a plain (non-`inline`)
`@Composable` function isn't legal Kotlin -- non-local returns only work
through inlined calls -- and this exact pattern was already sitting in
last session's shipped `InProgressWorkout` code undetected, since nothing
in this environment compiles Kotlin; fixed everywhere it appeared, by
null-checking with `?.let {}`/`if` instead of an early return. (2)
`elapsedSeconds()` fell back to `Instant.now()` when a session wasn't
paused -- fine while a workout is actively running, but on the summary
screen (session finished, `pausedAt` null) it meant "Duration" would
silently keep climbing on every recomposition instead of showing a fixed
number. Fixed by using `completedAt` as the cutoff once it's set.

*Dashboard population ("Your Top 3" + "Your Training").* New
`data/DataPointRepository.kt` ports `dashboard/lib/queries.ts`'s
`getDataPointSummary` line for line (same 8 keys, same 7-day-window
wording) so a client sees the same numbers in the app as on the web --
one accepted gap, matching `HealthDataRepository.kt`'s own existing
precedent: no cross-source dedup for the steps case. `ProfileRepository`
gained `loadTopDataPoints` (reads `client_profiles.top_data_points`,
written by the web's `DataPointPicker` -- Android has no picker UI of its
own yet, display-only). "Your Training" is genuinely new logic, not
ported from anywhere -- the web dashboard's own `/client` page still only
does "most recently assigned standalone workout," its own comment
calling that "a placeholder for real scheduling." `WorkoutRepository
.getNextTrainingItem` prefers the client's most-recently-assigned
program's first not-yet-completed workout (by `order_index`, cross-
referenced against `workout_sessions.completed_at`), falling through to
the existing standalone pick, `null` only when neither yields anything --
rendered as the mockup's "You do not have any workouts assigned" empty
state. `WorkoutScreen` itself now calls this same method (not the old
standalone-only `getTodaysWorkout`) so tapping the Your Training card and
opening Workouts from the nav land on the same workout. Both new
`HomeSummary` fields (`topDataPoints`, `trainingItem`) follow the
existing per-sub-fetch `runCatching` pattern, so a failure in either
can't blank the rest of the home screen.

*Calendar, first pass, read-only.* New `data/CalendarRepository.kt` +
`ui/CalendarScreen.kt`: upcoming `calendar_events`, and Google Calendar
connection status from `calendar_connections`. Deliberately does NOT
implement native OAuth -- the web's connect flow
(`app/api/calendar/google/{start,callback}`) is built entirely around a
Next.js session *cookie*, which a Custom Tab has no way to carry from
this app's bearer-JWT auth. Making that native would need a new,
JWT-aware server route plus a registered deep link back into the app --
real scope, not a drop-in for a "first pass." Until that exists,
"Connect Google Calendar" opens the web dashboard in the device's browser
(a new `DASHBOARD_URL` `BuildConfig` field, same `local.properties`
pattern as `SUPABASE_URL`) and lets the client complete the connect
there; this screen just re-reads `calendar_connections` afterward like
everything else it shows.

*Chat/Inbox, first pass, text-only.* New `data/ChatRepository.kt` +
`ui/InboxScreen.kt`: find the client's one coach thread
(`chat_threads` has a unique `(coach_id, client_id)`), list/send
messages, mark read. Polls every 5 seconds while the screen is open
rather than using the web's Supabase Realtime subscription
(`ThreadView.tsx`'s `.channel(...).on("postgres_changes", ...)`) -- this
app has no Realtime/websocket client set up anywhere
(`SupabaseRestClient` is plain PostgREST-over-OkHttp), and pulling one in
for a single screen wasn't judged worth it for a first pass. Attachments,
reactions, replies, and pinning are all out of scope here too, same
reasoning.

Five new files (`WorkoutRepository`'s summary/training additions,
`DataPointRepository`, `CalendarRepository`, `ChatRepository`,
`CalendarScreen`, `InboxScreen`), all wired through new
`workout/{clientId}`-shaped routes already established by the earlier
Workouts pass. Same manual-review-only posture as every other Android
change in this project.

## Standing product decisions

- **One coach per client** (a `coach_id` column on `client_profiles`, not a
  join table). Simplest schema for now; revisit only if multi-coach
  support becomes a real requirement -- it's a bigger migration than adding
  a join table cold, since every "coach's clients" query today assumes the
  single-FK model.
- **Magic link (email OTP)** is the only auth method. No passwords.

## Phase 9 -- Android home shade + nav redesign, from a second mockup pass

A follow-up mockup (two screens: shade closed, shade open) revised the
Phase 8 client home screen further. Changes, and the interpretations
made where the mockup left something ambiguous:

**Greeting moved into the shade itself.** "Hey, {name}" + today's date
now render as the shade's own header row, not `HomeScreen`'s body text
below it -- `NotificationShade`'s `ShadeContent` gained a `displayName`
field. Needed a real first name to match the mockup's "Hey, Alex" (this
screen previously only had the client's `email`) -- `ProfileRepository`
gained `loadDisplayName`, reading `profiles.full_name` and taking the
first word; falls back to plain "Hey" if unset.

**Shade background extends to the true top of the screen.** Previously
`HomeScreen` wrapped everything in one blanket `.safeDrawingPadding()`,
which pushed the shade's background down below the status bar along
with its content. Split apart: `NotificationShade` now applies
`.statusBarsPadding()` to its own *content* only, after its background
modifier -- the color still paints behind the status bar, only the
greeting/icons themselves sit below it. `HomeScreen`'s outer container
dropped the blanket inset entirely; the scrollable content column and
`SlideOutNav` each apply their own `.navigationBarsPadding()` instead,
since only they need bottom-inset protection now.

**Centered pull-tab replaces "tap anywhere in the row."** A small,
distinct rounded chip with the chevron, horizontally centered at the
bottom of whatever the shade is currently showing (closed row or
expanded panel) -- `ShadeTab`, its own composable rather than folding
the tap target into the existing row layout as before.

**Collapsed row's streak indicator: 7 dots -> 3 squares.** The mockup's
closed state shows 3 small colored squares, not the existing
`StreakPreview`'s full 7-dot week. Interpreted as "the last 3 days up to
and including today" (new `MiniStreak`, replacing `StreakPreview`) --
one from-the-mockup detail that's genuinely ambiguous (it could just as
easily mean "3 most recent non-empty days" or something else); this is
the most literal reading of "a short recent glance" and is easy to
revise if wrong.

**Expanded panel redesigned.** "You're on a roll" headline (static
copy, not computed) above the full `StreakHeatmap`, which itself flipped
day-letters from above each cell to below (matching the mockup) and
went slightly squarer (8dp -> 6dp corner radius). Messages/Calendar/
Tasks went from single-line `ShadeRow` text to title+subtitle preview
cards: Messages needed an actual message body to show, so
`HomeSummaryRepository` gained `loadLatestMessagePreview` (the thread's
most recent message, only surfaced when it's an *incoming* one --
`sender_role = 'coach'` -- matching the mockup's "Your Coach: ..."
framing, not a log of the client's own last reply). Calendar's card
additionally gets a small "OCT 13"-style date chip, derived client-side
from the event's existing `start_time` (no new data needed). Tasks kept
its existing copy, split into title/subtitle with a trailing arrow
glyph.

**Nav enlarged ~18% and reordered.** Button 44dp -> 52dp, icon 22dp ->
26dp, pill corner radius 28dp -> 32dp -- roughly the requested 15-20%.
Destination order now matches the mockup (Workouts, Calendar, Inbox,
Stats, Profile) instead of the previous Stats-first order. The toggle
arrow moved from the *start* of the row to the *end* -- the mockup's
collapsed state is a single circular arrow button that visually *is*
the expanded pill's trailing icon, not a separate leading control.

**Nav's open/closed state now survives leaving and returning to Home.**
Previously `remember`ed inside `SlideOutNav` itself, which gets torn
down and recreated every time `AuthNavHost`'s `ROUTE_HOME` composable is
re-entered (e.g. after visiting Workouts and tapping back) -- so the nav
always silently re-collapsed on return, regardless of what the client
left it as. Hoisted `expanded`/`onToggleExpanded` up to `MainActivity`
(`rememberSaveable`, so it also survives rotation/process death) and
threaded through `HomeScreen`. Deliberately scoped narrower than "stays
expanded across every screen": `SlideOutNav` only renders on `HomeScreen`
today (Calendar/Inbox/Workout/Profile/Stats don't show a bottom nav at
all) -- putting it on every screen is a bigger structural change than
this pass covers, so what shipped is "the state persists, ready for
wherever the nav is shown," not "the nav is now on every screen."

One real bug caught during this pass, worth naming since it's invisible
without a device: an early draft put the destinations-to-toggle-button
gap on the *outer* `Row`'s own `Arrangement.spacedBy`, which still
inserts a gap between `AnimatedVisibility` and the next child even when
that `AnimatedVisibility` has shrunk to zero width while collapsed --
would have left the collapsed circle looking slightly off-center with a
spurious gap baked in. Fixed by moving the gap onto the *inner* Row
(inside `AnimatedVisibility`'s own content, as trailing end-padding), so
it collapses to nothing together with everything else in there.

Same manual-review-only posture as every other Android change in this
project.

## Phase 10 -- Android MVP design-minimums pass + two reported bugs

A checklist of 7 cross-cutting design minimums plus 2 reported bugs,
worked through with real `./gradlew compileDebugKotlin`/`lintDebug`
verification after every change (the session-start hook from the
previous phase makes that possible for the first time this project has
had it). No Paparazzi screenshot tests, despite an earlier attempt --
see the dead end noted below.

**Kotlin bumped 1.9.24 -> 2.0.21** (+ the `org.jetbrains.kotlin.plugin.compose`
Gradle plugin, replacing `app/build.gradle.kts`'s old
`composeOptions.kotlinCompilerExtensionVersion`). Originally done solely
to unlock Paparazzi (JVM-only Compose screenshot testing, no
emulator/device needed -- this environment has neither `/dev/kvm` nor a
display) targeting this project's `compileSdk 36`. Kept even after
dropping Paparazzi: it's a clean, independently-verified upgrade, and
reverting it for no reason would have been pure churn. Paparazzi itself
hit a wall too deep to be worth it here: every Kotlin-1.9-compatible
release lacks `compileSdk 36` platform data (added only in its
`2.0.0-alpha` line); every alpha tried after that hit a *different*
incompatibility (AGP/aapt2 version mismatch, then a Kotlin-Gradle-plugin
binary incompatibility); and the one clean workaround AGP actually
offers (`android.testOptions.targetSdk`, to render screenshots against a
lower, better-supported platform than the module's real `compileSdk`) is
restricted to library modules -- `:app` is an application module. Given
four independent dead ends, Android verification for this pass is
`./gradlew compileDebugKotlin`/`lintDebug` plus precise before/after code
in review, not rendered pixels.

**Screen titles + back nav.** `ProfileScreen`/`ComingSoonScreen` had
their "Back" as a `TextButton` buried in the scrollable body -- moved
into the `TopAppBar`'s `navigationIcon` slot, matching every other
screen. The other four screens (`WorkoutScreen`/`CalendarScreen`/
`InboxScreen`/`DashboardScreen`) already had a `navigationIcon`, just a
literal `Text("←")` instead of a real `Icon` -- swapped for
`Icons.AutoMirrored.Filled.ArrowBack` (RTL-aware, real accessibility
semantics). `HomeScreen`/`CoachHomeScreen`/`LoginScreen` left without a
back icon on purpose -- they're root/landing destinations with nothing
to return to.

**14px font floor.** `labelSmall`/`labelMedium` were never defined in
`HealthSyncTypography`, silently falling back to Material3's stock
11sp/12sp -- below the floor for real functional text (workout set-row
column headers, home data-point labels, inbox timestamps, the calendar
event date chip), not decorative badges. Fixed centrally in `Type.kt`
(both now 14sp) rather than touching each of those call sites.

**Card drop shadows.** All 5 `OutlinedCard` sites in the app (home
data-point/training cards, workout browse row + `ExerciseLogCard`,
calendar event card) used Material3's zero-elevation outlined-card
default. Added `CardDefaults.outlinedCardElevation(defaultElevation = 3.dp)`
to each.

**Dark-theme diagonal gradient.** `background`/`surface` were flat
`Color` tokens with no single choke point to inject a `Brush` through --
neither `Scaffold`'s `containerColor` nor `Surface`'s `color` accept
anything but `Color`. Solved by painting the gradient exactly once, in
`MainActivity`, behind the whole `NavHost` (new `dashboardBackgroundBrush()`
in `Theme.kt`, dark-theme only, top-left to bottom-right), then setting
every screen's own `Scaffold(containerColor = Color.Transparent)` (and
`HomeScreen`'s `Surface(color = Color.Transparent)`) so the shared
gradient shows through instead of each screen re-painting a flat color
over it. `HomeScreen`'s `Surface` also needed an explicit
`contentColor = MaterialTheme.colorScheme.onBackground` passed alongside
-- Surface normally derives `contentColor` from `color` via
`contentColorFor()`, which doesn't know how to map `Transparent` to an
"on-X" text color the way it mapped `colorScheme.background` before.

**Workout card input height (~25-30dp).** Material3's `OutlinedTextField`
has a hard ~56dp floor that can't be shrunk to fit. Built a narrow
`CompactNumberField` (`BasicTextField` + a manual thin border,
28dp-tall) scoped to `WorkoutScreen`'s per-set reps/weight inputs only --
not a general OutlinedTextField replacement elsewhere.

**Confirmation dialogs.** First `AlertDialog` anywhere in this app --
new shared `ui/components/ConfirmDialog.kt`, reused at every site.
Scoped to the app's actual consequential actions (there's no delete
action anywhere in the Android app, and no literal "stop" beyond
pause/resume, which is non-destructive): finishing a workout, saving +
returning to the dashboard from the summary screen, signing out
(`ProfileScreen` + `CoachHomeScreen`), and forcing a full re-sync.
Deliberately *not* applied to per-set field edits or the per-set
completion toggle -- confirming every single rep/weight keystroke would
make logging a workout unusable, which the "save/edit/delete/finish/
stop" requirement plainly isn't asking for.

**Visual affordances at the point of interaction.** Finish (previously
no saving state at all) now disables + reads "Finishing…" while in
flight. Summary screen's Save button, which already had "Saving…", now
also flashes "Saved ✓" for ~600ms before navigating away instead of
jumping straight from saving to gone. Inbox's Send button and Profile's
Force re-sync button previously only toggled `enabled` with a static
label -- both now swap to "Sending…"/"Syncing…" like every other
async-action button in the app already did. Per-set reps/weight field
commits (which save silently on focus-loss, with no button of their
own) get a brief primary-color border pulse on the two fields that just
committed -- the only place in the row a user would actually be
looking.

**Bug: dashboard slow load (both cold launch and returning to the
screen).** Two separate causes, both fixed. (1) `HealthDataRepository
.loadDashboard`'s 4 queries and `HomeSummaryRepository.loadSummary`'s 7
sub-fetches (plus its inner per-data-point loop, up to 3 more) were all
sequential `suspend` calls -- none of them depend on each other, so all
are now `coroutineScope { async { ... } }` + `.await()`. A client with 3
top data points picked was paying roughly 10 sequential round trips just
to populate the Home shade before this. Also added `"limit" to "2000"`
to the previously-unbounded steps/sleep_sessions selects, since
`SupabaseRestClient.select()` falls back to full auto-pagination without
an explicit limit even though both queries are already date-windowed.
(2) Neither `DashboardScreen` nor `HomeScreen` survive Compose
Navigation's teardown-and-recreate when leaving and returning (the same
lifecycle gap Phase 9 hoisted `navExpanded` out of), so every return
visit re-ran every query from scratch regardless of (1). New
`TtlCache<T>` (`data/TtlCache.kt`), a plain 60s in-memory
singleton-per-repository cache keyed by `clientId` -- not a ViewModel or
any new architecture layer, since this app deliberately has neither
anywhere else yet.

**Bug: nav icon jumps left->right on expand/collapse.** Root cause:
`SlideOutNav`'s outer `Row` had no width of its own, only whatever its
(changing) content added up to -- as `AnimatedVisibility` animated the
destinations row between 0 and full width, the trailing toggle button's
on-screen position moved right along with it. Fixed by reserving the
pill's fully-expanded width in an outer `Box` at all times and
end-aligning the actual Row within it, so the toggle sits at a fixed
right edge regardless of state -- the visible pill (clip + background)
still only covers its actual current width, just positioned flush
against that fixed edge instead of wherever the Row happened to end.

Same manual-review-plus-build posture as every other Android change in
this project, now with a real compiler backing the review for the first
time.

## Phase 11 -- Desktop MVP design-minimums pass

Companion to Phase 10 -- a checklist of desktop-side restructuring:
split the coach's landing page into a proper Dashboard + a Clients
roster, a new task list feature, and (staged separately, in further
sections below as each lands) a Libraries sidebar, an Inbox split view,
and a full client-detail-page reorg.

No Supabase project is available in this environment (no `.env.local`),
so none of this could be rendered or screenshotted against real data --
verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean) instead, same posture as Android's
compile+lint-only verification this pass. Real visual verification is
on whoever pulls this branch with their own `.env.local`.

**Nav split: Dashboard + Clients.** `/dashboard` used to be both "the
coach's landing page" and "the client roster" at once. Split: `/dashboard`
is now a proper dashboard (bulletin + calendar + tasks + quick actions,
below), and the roster moved to a new `/dashboard/clients` route.
`NavBar.tsx` gained a new "Dashboard" tab (reusing the existing, not
previously in use on desktop `StatsIcon`) pointing at `/dashboard`;
"Clients" now points at `/dashboard/clients`. Every `redirect("/dashboard")`
guard inside `app/dashboard/clients/[clientId]/**` that actually meant
"client not found, back to the roster" (the main client page, notes,
personal-records, chat) was repointed to `/dashboard/clients` -- the
generic "/login"/"/client" role-redirects elsewhere were left alone,
since `/dashboard` is still a perfectly good generic coach landing page
for those.

**New Dashboard page.** Reused rather than rebuilt: `CalendarCard`
already supported a week view (`CalendarViews.tsx`'s `WeekGrid`) but no
prop let a caller default to it or start expanded -- added `initialView`/
`initialExpanded` props (both optional, defaulting to the old
`month`/collapsed behavior so every other call site is unaffected).
New `DailyBulletin` (recent workout completions across all this coach's
clients, unread `chat_threads`, today's `calendar_events` -- all three
already-fetched-elsewhere data, no new query surface) and `TaskList`
(see below). Quick actions: create workout/program (plain links into the
library's existing `new` routes) and generate-client-link, which now
fires from two places (see below).

**New Clients page (`/dashboard/clients`).** Took over the old
`/dashboard` page's roster section + invite-links section verbatim,
plus a new client-side `ClientSearchList` (filters the already-fetched
roster by name/email as you type -- no new query, this app's client
count doesn't call for server-side search). `createInviteLink` now
`revalidatePath`s both `/dashboard` and `/dashboard/clients`, since
generating a link is reachable from both (Dashboard's quick actions,
Clients' own invite section) and both need to see a fresh list/state
afterward.

**New feature: coach task list.** Brand new, migration `0026_tasks.sql`
-- same coach-owned-outright RLS shape as `coach_notes` (single `for all`
policy, `coach_id = auth.uid()`, no client visibility at all). Kept
deliberately simple per an explicit scope decision: `text` + `done`
boolean + `created_at`, plus a nullable, non-foreign-keyed
`source_kind`/`source_id` pair for tracing a task back to whatever
bulletin item it came from -- no due dates, priority, or assignment.
`lib/tasks.ts` (`listTasks`/`createTask`/`toggleTask`) +
`app/dashboard/task-actions.ts` (`addTask`/`setTaskDone` server actions)
+ `components/TaskList.tsx` (client component, optimistic toggle via
`useTransition`). Not yet actually pre-populated from bulletin items
programmatically (the `source_kind`/`source_id` columns exist for it,
but wiring "unread thread -> task stub" etc. automatically is follow-up
work, not done in this pass) -- flagging that gap plainly rather than
overclaiming it.

**Libraries: persistent left sidebar.** `app/dashboard/library/` had no
shared layout before this -- each category (`exercises`/`workouts`/
`programs`/`documents`) was an independent top-level route, and the hub
page at `/dashboard/library` was just a grid of four link-cards into
them. New `app/dashboard/library/layout.tsx` wraps every
`/dashboard/library/**` route in a two-column shell: a new
`components/library/LibrarySidebar.tsx` (client component, first
sidebar pattern in this app -- nothing existing to follow) on the left,
`{children}` as the main content area on the right. The sidebar is
persistent across category navigation (it lives in the layout, not a
per-page component) and independently collapsible via local `useState`
(not persisted across reloads -- a same-session convenience, not data
worth persisting), with active-category highlighting via `usePathname()`.
The old hub page's four-card grid is now redundant with the sidebar, so
`/dashboard/library` itself was simplified to a plain "pick a category
from the sidebar" placeholder rather than duplicating the same four
links two ways.

**Assign-from-library-item.** Previously the only way to assign a
workout/program/document to a client was from the client's own detail
page (picking the item from a dropdown there). Added the reverse
direction: each item's own detail page
(`library/{workouts,programs,documents}/[id]/page.tsx`) now also fetches
this coach's client roster (same `client_profiles` join used on the
Clients page) and renders a new `components/library/AssignToClientCard.tsx`
-- a plain server-action form (pick a client, submit) -- at the bottom.
New `app/dashboard/library/assign-actions.ts` holds the three
`assignLibrary{Workout,Program,Document}ToClient` actions: a mirror
image of the client page's existing `assign*ToClient` actions (same
underlying `assign_*_to_client` RPCs), just with which side is bound
(the item) vs. read from `FormData` (the client) flipped. Exercises are
deliberately left out -- they aren't independently assignable in this
app's data model (only workouts/programs/documents have an
`assign_*_to_client` RPC), so no assign card was added to the exercise
detail page.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

**Inbox: persistent split view.** `/dashboard/inbox` used to be a plain
list of client threads, each a link to a fully separate route
(`clients/[clientId]/chat`) with its own back-navigation. New
`app/dashboard/inbox/layout.tsx` fetches `listCoachThreads` once and
renders a new `components/chat/InboxSidebar.tsx` (same collapsible-
left-sidebar shape as `LibrarySidebar`, with per-client unread dots)
alongside `{children}`; `/dashboard/inbox` itself is now a "pick a
client" placeholder, and a new `app/dashboard/inbox/[clientId]/page.tsx`
renders the thread (`ThreadView` + `CallProvider`, same data-fetching as
the existing per-client chat page) inside that shared layout -- clicking
a different client in the sidebar swaps only the thread content, the
sidebar itself never re-fetches or re-renders. The older
`clients/[clientId]/chat` route (and every link into it, e.g. from the
client detail page and the dashboard's Daily Bulletin) was left as-is
rather than redirected -- it's still a perfectly valid direct deep link
into a single conversation, just without the sidebar, and repointing it
wasn't asked for.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean; `/dashboard/inbox/[clientId]` shows up in
the route table alongside the existing `clients/[clientId]/chat`).

**Client detail page reorg.** The largest single page in the app
(478 lines) got restructured top to bottom per an explicit target order:
data dashboard (tiles + graph) -> stats/PRs -> check-ins + notes ->
assigned content -> about, with the AI assistant moved into a
collapsible right sidebar (default minimized). Concretely:

- *Data dashboard.* The old top-of-page 4-tile `StatCard` overview grid
  (Steps today/Avg HR/Last sleep/Workouts 7d) is gone outright -- no
  replacement tile grid at that spot. In its place, the client's own
  chosen-3 "Featured data points" section (previously much further down
  the page) is promoted to the top, and directly below it is one new
  chart, `components/DataOverlayChart.tsx`, replacing the separate
  always-on `StepsChart`/`SleepChart` sections entirely (both component
  files deleted -- confirmed unused anywhere else first). Every one of
  the app's 8 `DATA_POINTS` types this client has consented to share
  gets a toggle chip; multiple can be active at once, each drawn as its
  own line **normalized to its own 0-100% range** on one shared Y axis
  (the locked-in overlay decision -- lets very different units like
  steps and mg/dL sit on the same chart for pattern comparison), while
  the tooltip looks the real value + unit back up per point so nothing
  is actually lost to the normalization. New `lib/queries.ts` entry
  point `getDailySeries(supabase, dataPointKey, days, clientId)` backs
  every series from one function -- steps/sleep reuse the existing
  `getDailySteps`/`getSleepNights` (unchanged, still used by the AI
  assistant's tools too), and a new `SAMPLE_SERIES_CONFIG` table-driven
  path handles the five single-numeric-reading tables (heart rate,
  blood oxygen, blood pressure [systolic only -- it's two-valued, the
  diastolic side is dropped from this overlay for a single comparable
  line], respiratory rate, blood glucose) with one shared
  bucket-by-day-and-average implementation, plus a small
  count-per-day path for `exercise_sessions`. The dynamic column-name
  select required casting the query builder through `unknown` --
  Supabase's typed `select()` only parses string *literals* against the
  schema at compile time, and a per-data-type column name is only known
  at runtime.
- *Check-ins + Notes*, side by side at `w-[45%]`/`w-[45%]` in a
  `flex flex-wrap gap-[10%]` wrapper (stacks to full width below `sm`).
- *Assigned content*: the old two separate sections ("Assign content"'s
  three picker forms, "Assigned content"'s three list cards) are merged
  into one card, one column per category -- each column shows its
  assigned list first (primary, per the requirement) with a compact
  "+ Assign &lt;type&gt;" inline form directly underneath, rather than a
  whole separate section far below.
- *About*: the former standalone "Data sharing" consent-list section is
  folded into About as an added block under the existing phone/goals/
  limitations fields, one card instead of two.
- *AI assistant*: moved out of the main column into a new
  `components/ClientAssistantSidebar.tsx` -- a right-edge collapsible
  panel (same collapse shape as `LibrarySidebar`/`InboxSidebar`, mirrored
  to the right), **default minimized** per the requirement, wrapping the
  existing `AssistantChat` unchanged. The page's outer container became
  a two-column flex (main content + this sidebar) -- the first
  two-column layout on this particular page.
- The shared calendar card and the chat-unread header icon were left in
  their existing spots (calendar trailing at the end, chat icon in the
  header) -- the requirement's explicit order only covered the five
  sections above, and neither of these was called out for relocation.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

## Phase 12 -- AI assistant coach v3: pattern observations, drafting, and action proposals

Six desired outcomes, scoped with the coach up front rather than built
blind: (1) self-efficacy-research-informed pattern observations/coaching
suggestions, (2) coach-approved training-plan change execution, (3) draft
chat messages, (4) draft workouts from a text prompt, (5) draft documents
from a text prompt, (6) scheduling coaching calls. One governing rule
across all of them: **the coach always sees and verifies before anything
executes** -- workouts/forms are created as drafts, program changes are
reviewed and applied (never auto-applied), and the assistant never
assigns anything to a client (that stays a fully manual, separate coach
action everywhere in this app already).

**Architecture decision made up front, before any outcome-specific work:**
"coach reviews before execution" can't be satisfied by prompting the
model to ask permission -- if a tool's `run()` function touches the
database, the model can call it mid-turn and it's already done. Every
write-capable tool (outcomes #2-#6) will instead write a row to a new
`ai_assistant_proposals` table and return its id; a coach-facing review
card applies it via an ordinary server action. This guarantees the human
gate by construction rather than by the model's good behavior, and is
shared across every write outcome rather than reinvented per-feature
(built in a later stage of this phase, once an outcome actually needs
it).

Build order (agreed with the coach): Stage 1 (this entry, read-only, no
proposal infra needed) first since it reuses 100% of existing
infrastructure and ships immediately; then the generic proposal/approval
infra; then #3 draft messages (smallest write feature, proves the
approval UI end-to-end); then #4 draft workouts; #5 draft documents; #2
program-change proposals; #6 scheduling, last since it has the least
novelty (mostly reuses existing calendar code).

### Stage 1 -- pattern observations (reactive + proactive), read-only

**Research grounding -- stated honestly.** The coach supplied a reading
list (Ashford/Edmunds/French 2010; Williams & French 2011; Egele/Klopp/
Stark 2025; Warner et al. 2014; two 2015/2016 Computers in Human Behavior
studies; a 2025 medRxiv preprint; Hill/Smith/Myers/Feltz 2022 on
"other-efficacy"; a PMC personal-trainer focus-group study; McAuley et
al.; the Williams & Rhodes construct debate; the BCT Taxonomy v1).
This environment has **no outbound web access** -- confirmed directly
(`curl` to pmc.ncbi.nlm.nih.gov and bct-taxonomy.com both got rejected
by the egress proxy with "organization policy," not a transient error),
so none of those specific papers, especially the 2025 ones, could be
fetched and verified against. `lib/coaching-guidelines.ts` is instead
synthesized from the well-established, high-confidence parts of this
literature already in-model: Bandura's four sources of self-efficacy and
their relative strength (mastery > vicarious > verbal persuasion >
physiological/affective state), the general BCT-review finding that
feedback-on-performance/demonstration/reinforcing-effort work while
heavy relapse-prevention and rigid graded-task framing don't, McAuley's
adherence and single-bout findings, and the Hill et al. "other-efficacy"
finding (a client's belief about what their coach thinks of their
ability shapes their own self-belief -- directly actionable: anything
drafted on the coach's behalf should state confidence in specific,
evidence-tied terms, not generically). This file is a single editable
source both surfaces below share -- flagged plainly as the place to
correct or tighten if the coach verifies the newer sources independently.

**Reactive.** `COACHING_GUIDELINES` folded into the existing
`ASSISTANT_SYSTEM_PROMPT` (`lib/assistant-tools.ts`) -- the existing chat
in `AssistantChat`/`ClientAssistantSidebar` now reasons with this framing
automatically, no UI change needed.

**New read tools** (same zero-identifier-argument pattern as every
existing assistant tool): `get_check_in_adherence` (submitted-vs-due per
week, not just submitted responses -- `lib/assistant.ts`'s
`fetchCheckInAdherenceForAssistant` deliberately diffs against the
*expected* week list, which `getCheckInHistory` doesn't do) and
`get_workout_adherence` (sessions started vs. actually finished in a
window, so the assistant can tell "trained less" apart from "started but
didn't finish").

**Proactive.** New `ai_client_insights` table (migration `0027`, same
single-owner RLS shape as `ai_assistant_messages`/`coach_notes`). New
`lib/insights.ts`: `generateInsight` runs one non-streamed Tool Runner
turn (same tools, same guidelines, a task-specific system prompt asking
for exactly one 2-4 sentence observation) and persists the result;
`getLatestInsight` just reads the most recent row. New route
`app/api/clients/[clientId]/insights` (GET latest, POST generate) and
`components/ClientInsights.tsx`, wired into the client detail page
directly above the data-dashboard section. The proactive behavior: the
card auto-generates on mount if the last insight is missing or more than
3 days old, so a coach opening a client they haven't checked on gets a
fresh read without clicking anything; a manual Refresh is always
available too.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 2 -- generic proposal/approval infrastructure

The reusable "coach reviews before execution" gate every write outcome
from here on needs. New `ai_assistant_proposals` table (migration
`0028`), scoped to the three outcomes that have no existing list to
stage inside of -- `draft_message`, `program_change`, `schedule_call`.
Draft workouts and documents (Stage 4/5) deliberately do **not** use this
table: per the coach's own decision earlier in this phase, those stage
directly on `library_workouts`/`library_documents` via a status column so
a draft shows up right in the existing Workouts/Documents list, not a
separate queue. This table is for the three outcomes that have nowhere
else to live.

`lib/proposals.ts`: `createProposal` (called from a tool's `run()`,
never from the review UI), `listPendingProposals`/`getProposal`,
`rejectProposal` (generic -- discarding is identical for every type,
since nothing was ever applied), and `markProposalApplied` (a helper
each outcome's own apply action calls *after* it performs the real side
effect -- this file has no idea how to send a message, change a program,
or book a call, by design). New `app/dashboard/clients/[clientId]/
proposal-actions.ts` wraps `rejectProposal` as a coach-gated server
action (`discardProposal`) -- the only action that belongs here, since
approving is type-specific and lands with each outcome.

New `components/ProposalCard.tsx`: a generic, reusable review-card shell
(type badge, summary, created time, a children slot for type-specific
detail rendering, Approve/Discard buttons) with no knowledge of what any
proposal type actually contains. It has no caller yet -- Stage 3 is its
first consumer, wiring in both the first proposal type (`draft_message`)
and the client-page list section that renders pending ones, since
building that list now would mean guessing at a renderer for a payload
shape that doesn't exist yet.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 3 -- draft chat messages (outcome #3)

The first real write outcome, and the one that proves Stage 2's
approval pattern end to end.

New `lib/assistant-write-tools.ts`, deliberately **not** merged into
`buildAssistantTools()`: that function is shared by the interactive chat
route and the proactive insight generator (`lib/insights.ts`), and the
insight generator must never gain the ability to take actions on its
own just because it reuses the same read-only tool set. Write tools are
a separate `buildWriteTools()`, added to the tools array only in
`app/api/clients/[clientId]/assistant/route.ts`. Its one tool so far,
`draft_message_to_client`, does nothing but call `createProposal` --
the model cannot send a message itself even if it tried, by
construction, not by prompting. A new system-prompt paragraph tells the
model to call this tool instead of putting a drafted message in its own
reply, whenever the coach asks for one.

Approving: `approveDraftMessageProposal` (`proposal-actions.ts`) sends
the message through the *existing* `sendChatMessage` action (same path
a coach typing in the Inbox uses) and then calls `markProposalApplied`
with a payload patch recording what was actually sent. The original AI
draft (`payload.body`) and the coach's final, possibly-edited version
(`payload.sentBody`) both end up on the same row -- this is the "LLM
output vs. coach's edited draft" record the coach asked to be able to
see, with no separate table needed.

UI: `PendingProposals` (first real consumer of `ProposalCard`) now
renders in the client detail page below the Coaching insight card, with
an editable textarea pre-filled from the draft for `draft_message` rows
and an "Send" / "Discard" pair. `program_change`/`schedule_call` rows
fall through to a plain summary-only card for now -- no tool creates
those yet, so that path isn't reachable, but a future stage's proposal
won't silently vanish from the list the moment it's created ahead of
its own apply action landing. `AssistantChat` calls `router.refresh()`
after any turn that used a proposal-creating tool, since this
server-rendered list has no other way to learn a new draft exists.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 4 -- draft workouts from a text prompt (outcome #4)

The first outcome that isn't client-scoped: workouts are coach-level
library content, not tied to any one client, so this doesn't go through
the per-client `AssistantChat`/`buildAssistantTools` machinery at all.
New `lib/workout-drafting.ts` runs its own small, self-contained
tool-calling turn (two tools: `get_library_exercises` to read, and
`propose_workout` to write) from a coach-level prompt box
(`DraftWorkoutPrompt`) on the Workouts list page, via a new
`/api/library/workouts/draft` route.

Per the coach's own earlier decision, this does **not** go through
`ai_assistant_proposals` -- `propose_workout`'s `run()` writes directly
into `library_workouts`/`library_workout_exercises` with
`status = 'draft'` (migration `0029`), and the Workouts list page now
renders a Drafts section above Published, so a draft is exactly as
discoverable and editable as anything a coach built by hand. A "Publish"
button (`publishWorkout` action) flips the flag.

**Enforcing "no client assignment" here is a filter, not a flag check.**
A `draft` row is otherwise a completely ordinary `library_workouts` row --
nothing stops a coach from opening it, editing it, or even deleting it
while it's a draft, same as any workout. What actually keeps it away
from a client is that every assignment picker now filters to
`status = 'published'`: the client page's "Assign content" dropdown, the
program editor's "add a workout to this program" list, and the workout
detail page's own `AssignToClientCard`, which is replaced by a plain
"Publish this workout before assigning it" message while a workout is
still a draft. Three separate filters, each independently necessary --
missing any one of them would have left a path for an unreviewed
AI-drafted workout to reach a client.

**Exercise matching.** `propose_workout` matches each drafted exercise
name against the coach's existing `library_exercises` (case-insensitive)
before falling back to creating a new one -- new exercises are created
as ordinary (non-draft) rows, since an individual exercise is a much
lower-stakes building block than a whole workout a client might see, and
a coach manually building a workout already has to create exercises
on the fly the same way. The system prompt asks the model to check
`get_library_exercises` first specifically to avoid duplicate near-same
exercise entries accumulating over repeated drafts.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 5 -- draft documents from a text prompt (outcome #5)

Mechanically identical to Stage 4, applied to `library_documents`: new
`lib/document-drafting.ts` (one tool, `propose_document_form`), a
`DraftDocumentPrompt` box on the Documents list page, a new
`/api/library/documents/draft` route, a `status` column (migration
`0030`) with the same Drafts-section-above-Published list treatment, a
`publishDocument` action, and the same "publish before assigning" guard
replacing `AssignToClientCard` on a draft. The client page's document
assign picker gets the same `status='published'` filter as the workout
one from Stage 4.

**Scoped to form-type documents only.** `library_documents` also covers
plain uploaded files (`document_type = 'file'`), but drafting one from a
text prompt would mean generating an actual file, which this has no way
to do -- `propose_document_form` always creates `document_type = 'form'`.
Each drafted field gets a server-generated id (`field-${Date.now()}-${i}`)
rather than trusting the model to produce valid, unique ones -- the
existing form schema/renderer (`lib/forms.ts`) only requires ids to be
unique within the document, not any particular format.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 6 -- program/training-plan change proposals (outcome #2)

Uses the Stage 2 `ai_assistant_proposals` infrastructure directly (the
`program_change` type was already defined in migration `0028`, unused
until now) rather than a new staging table -- there's no natural "draft"
home for a single prescription edit the way there is for a whole workout
or document.

**Read side** (`lib/assistant.ts`, `lib/assistant-tools.ts`): two new
read-only tools, `get_assigned_workouts` (list a client's currently
assigned workouts) and `get_assigned_workout_exercises` (list one
assigned workout's exercises with their current sets/reps/rest/tempo/
notes and ids). The system prompt now tells the model to look both up
before proposing anything, so the proposal it creates always references
real, current ids rather than guessing.

**Write side** (`lib/assistant-write-tools.ts`): `propose_program_change`
takes an `assignedWorkoutId` plus a list of `update`/`add`/`remove`
changes, scoped intentionally to single-exercise prescription edits only
-- no block/superset restructuring, which stays a manual edit for now.
Rather than let the review UI look up "current" state live (fragile if
the coach edits the program in between proposing and reviewing), `run()`
fetches and embeds a self-contained snapshot into the payload at creation
time: `before`/`after` for `update`, just `prescription` for `add`/
`remove`. The tool never touches `assigned_workout_exercises` itself --
it only ever calls `createProposal`.

**Apply side** (`proposal-actions.ts`'s new `approveProgramChangeProposal`):
the one place that actually mutates `assigned_workout_exercises`,
triggered only by an explicit coach approval click. Applies each change
sequentially (`update` partial-updates by exercise id, `remove` deletes
by id, `add` inserts with a locally-incremented `order_index` so multiple
adds in one proposal don't collide), then calls `markProposalApplied`
with no patch -- unlike draft messages, the before/after snapshot was
already captured at proposal-creation time, so there's nothing new to
merge in at apply time.

**UI** (`PendingProposals.tsx`): replaced the generic placeholder for
`program_change` with a real diff view -- `update` shows only the fields
that actually changed (before → after), `add`/`remove` show the full
prescription/name since there's no prior or resulting state to narrow
against. Approving calls `approveProgramChangeProposal` directly; there's
no draft text to edit here the way there is for messages, since the
"editable" part of a program change is accept-or-reject per proposal, not
per field.

This completes outcome #2 under the same standing rule as every other
outcome: the assistant can suggest a program change, but nothing about a
client's actual assigned workout changes until the coach reviews the
diff and clicks Apply.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 7 -- schedule coaching calls (outcome #6)

The last outcome, and -- as expected going in -- the lowest-novelty
stage: it reuses the Stage 2 `ai_assistant_proposals` infrastructure
(the `schedule_call` type, also defined in migration `0028` and unused
until now) plus the calendar/video-call infrastructure that already
existed from earlier phases, rather than introducing anything new of its
own.

**Read side**: no new tool needed -- `get_busy_calendar_blocks`
(`lib/assistant.ts`'s `fetchBusyBlocksForAssistant`, added back in the
original Phase 11 assistant build) already returns a client's busy
windows for a date range without leaking event titles/details, exactly
the shape needed to sanity-check a proposed time. The system prompt
(`lib/assistant-tools.ts`) now tells the model to call it before
proposing a time.

**Write side** (`lib/assistant-write-tools.ts`): `propose_schedule_call`
takes a `startTime`/`endTime` pair plus an optional `title` (defaults to
the client-anonymous "Coaching call") and `notes`. `run()` rejects an
inverted range before staging anything, then calls `createProposal` with
the time/title/notes as payload -- same as every other write tool, it
never touches `calendar_events` itself.

**Apply side** (`proposal-actions.ts`'s new `approveScheduleCallProposal`):
calls the *existing* `createEvent` server action from
`lib/calendar-actions.ts` unchanged -- the same one the coach's manual
"new event" modal already uses -- with `hasVideoCall: true`, since a
"coaching call" implies the Daily.co room every other video-enabled
event on this calendar already gets for free. `createEvent` resolves the
current coach from the session itself and handles the room creation, so
there was nothing calendar-specific left to write here beyond validating
the proposal and handing off the staged fields.

**UI** (`PendingProposals.tsx`): added a `schedule_call` branch (the
generic placeholder from Stages 3-5 is now fully retired -- every
proposal type has a real renderer) showing the proposed title and a
formatted date/time window, with any notes shown as body text. Approving
books the call directly; there's nothing to edit inline the way a draft
message is, so, like program changes, the coach's only choices are
approve or discard.

**`AssistantChat.tsx` fix folded in**: `PROPOSAL_CREATING_TOOLS` -- the
set of tool names that should trigger a `router.refresh()` so the
server-rendered "Pending review" section picks up a newly created row --
had only ever had `draft_message_to_client` in it; Stage 6 should have
added `propose_program_change` but didn't. Both that and the new
`propose_schedule_call` are added now.

This completes all six desired outcomes from the original spec under
the one standing rule that governed every stage: the assistant can
observe, draft, and suggest, but a coach's explicit review and approval
is the only thing that ever turns a proposal into a real side effect --
a sent message, a changed program, a created workout/document, or a
booked call -- and no proposal or draft is ever auto-assigned to a
client.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

### Stage 8 -- draft workouts/programs from the per-client chat, plus draft programs (follow-up)

Testing surfaced a real gap: Stage 4's workout drafting only ever lived
on the Workouts list page, so asking the per-client assistant to draft a
new workout (e.g. "write this client a running program") correctly, but
unhelpfully, failed -- it had no tool for it at all. Separately, that
specific ask was for a multi-workout *program*, which Stage 4 never
built drafting for in the first place (only single workouts). This
stage closes both gaps, by the coach's explicit choice to keep the
existing library-only entry points *and* add chat access alongside them,
plus add program drafting as its own capability.

**Program drafting is new** (outcome #4, extended): same draft/review/
publish pattern as workouts/documents -- a `status` column on
`library_programs` (migration `0031`), excluded from the client page's
program picker until published, same as the existing workout/document
filters. `lib/program-drafting.ts`'s `buildProgramDraftTools` reuses
`buildWorkoutDraftTools` (now exported from `lib/workout-drafting.ts`,
with its `onCreated` callback made optional) rather than re-implementing
exercise matching, and adds two more tools: `get_library_workouts` (so
the model can reuse an existing published workout instead of drafting a
duplicate) and `propose_program` (creates the draft `library_programs`
row plus its `library_program_workouts` join rows, in order). The system
prompt tells the model that a plain weekly-repeating pattern ("3 days a
week") only needs `dayOfWeek` set per workout, with `weekNumber` reserved
for programs that actually differ week to week. `draftProgramFromPrompt`
mirrors `draftWorkoutFromPrompt`'s standalone tool-calling turn, behind a
new `/api/library/programs/draft` route and `DraftProgramPrompt` on the
Programs list page (Drafts/Published split, `publishProgram` action,
guarded `AssignToClientCard` -- all identical in shape to Stage 4/5's
workout/document versions).

**Chat access is the other half**: `buildWriteTools()`
(`lib/assistant-write-tools.ts`) now also spreads in
`buildProgramDraftTools(ctx.supabase, ctx.coachId)` -- a superset that
includes workout-only drafting (`get_library_exercises`/
`propose_workout`) alongside the new program tools, so the per-client
assistant can handle "draft a workout" and "draft a program" asks with
the same tool set, picking the right depth itself. Deliberately not
parameterized by `ctx.clientId` at all: a workout or program drafted
through a client's chat is exactly as client-agnostic as one drafted
from the Workouts/Programs page directly -- it lands in the coach's
library as an ordinary draft, and the "no client assignment" rule is
enforced the same way it always has been, by the assignment pickers'
`status='published'` filters, not by anything in this chat path. The
system prompt now explicitly distinguishes this from the Stage 6
program-*change* tool: changing an already-assigned workout's
prescription is a different thing from drafting a brand-new workout or
program from scratch, and the model is told which tool-set answers
which.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` (all clean).

## Phase 13 -- Design strip-down + 8-point behavior audit (web + Android)

The color system on both platforms had grown a multi-tier custom
palette (primary/secondary/accent + up to 4 text tiers + a chart-series
palette) across several earlier phases. This phase stripped it down to
a basic light/dark neutral scale, one warm accent, and four standard
semantic colors (success/warning/danger/info) that didn't exist before
-- plus a full pass against eight concrete behavior/sizing rules the
owner specified (touch targets, icon sizes, container overflow,
spacing consistency, font-size floors, confirm/undo on consequential
actions, in-place action feedback, and eased collapse/expand
transitions), checked against every design element and component on
both platforms, not just the color system.

**Methodology.** Research used two parallel Explore audits (web,
Android) against all eight rules, then a third supervisor Explore agent
independently re-verified both reports against the real code rather than
trusting their text -- it caught a missed real violation (the three
library item detail pages' Publish/Delete buttons had zero confirmation
or pending state) and a scope mis-categorization (the Android audit had
flagged chat `sendMessage` as needing a confirm dialog, which the user's
own confirmed scope explicitly excludes). That same audit -> supervisor
-> fix loop was then carried through every implementation stage, not
just the initial research: a supervisor-role check re-verified each
stage's actual diff against its rules and the verification commands
below before the next stage started. Across the 8 stages this caught,
and this phase then fixed, several real bugs that would have otherwise
shipped -- among them: a stale `error` state leaking between
`EventModal`'s save and delete flows; three sidebars whose collapsed
content stayed keyboard-focusable and screen-reader-reachable despite
being invisible (fixed via the `inert` DOM attribute, set imperatively
since this project's React/TS versions don't expose it as a JSX prop
yet); a `CalendarCard` expand/collapse fade that flashed fully opaque
for one frame before dipping to 0 (a plain `useEffect` resets state
*after* paint; moved to `useLayoutEffect`, which runs before it); and
several touch targets the first sweep missed entirely (unpadded
calendar nav arrows, an icon-only button whose icon got sized up to the
24px floor without the surrounding button gaining any padding to match).

**Scope decisions, confirmed with the owner before implementation:**
(1) keep the existing accent hex (`#C1573B`) unchanged -- already warm,
only the neutrals and new semantic colors change; (2) confirm/undo
applies only to meaningful or destructive actions (deletes, AI-proposal
approvals, discards, assignments, publishes) -- chat send, per-field
autosave, toggles, timers, and workout start/pause/resume stay
confirmation-free on both platforms; (3) the 16px-desktop font floor is
fixed by redefining `text-xs`/`text-sm` in `tailwind.config.ts` itself
(both now resolve to 16px/1.5 line-height) rather than hand-editing the
~100+ call sites that use them as the de facto label/button/body size
app-wide.

**Final color values** (light / dark), identical token names kept on
both platforms so ~100+ consuming files needed no changes, just new
values:

| Token | Light | Dark |
|---|---|---|
| accent (unchanged) | `#C1573B` | `#C1573B` |
| primary / page background | `#FFFFFF` | `#171717` |
| secondary / card surface | `#FAFAFA` | `#262626` |
| text-primary | `#171717` | `#FAFAFA` |
| text-secondary | `#525252` | `#A3A3A3` |
| success (new) | `#16A34A` | `#4ADE80` |
| warning (new) | `#D97706` | `#FBBF24` |
| danger (new) | `#DC2626` | `#F87171` |
| info (new) | `#0284C7` | `#38BDF8` |

**Web color system (`dashboard/app/globals.css`, `tailwind.config.ts`).**
Only the CSS vars' *values* changed, not their names -- `--text-tertiary`
was the one tier dropped outright (confirmed zero usages anywhere in
the web app). The informal, non-token `text-red-600 dark:text-red-400`/
`bg-red-600` error-color pattern turned out to be systemic rather than
the four files the initial audit sampled -- swept to the new `danger`
token across ~40 files once discovered, the same way a later sub-sweep
(arbitrary sub-16px `text-[10px]`/`text-[11px]` badge/pill labels, ~20
files) and the heading-margin normalization below both grew past their
initially-cited examples once the real pattern search ran.

**Touch targets, icons, overflow, spacing (web).** Every icon call site
below 24px raised to `h-6 w-6`; every touch target below 30px given real
padding or an explicit fixed hit-box (`h-[30px] w-[30px]`, the same
pattern `TaskList`'s checkbox already used, preferred over padding-around-
a-bare-glyph once that math turned out not to reliably clear 30px for a
narrow character like `✕`/`‹`/`›`). `flex-wrap` + `min-w-0` guards added
to rows that could overflow their card at narrow widths (`EventModal`,
`FormBuilder`, `AvailabilityEditor`, `BookingScheduler`). Spacing
outliers normalized to the dominant app convention in each case (`p-4`
card padding, `mb-2` heading-to-content margin -- found and fixed
app-wide once the search went past the two files the audit had sampled,
same pattern as the color sweep above).

**Font-size floor (web).** `tailwind.config.ts`'s `fontSize.xs`/`sm`
redefined to `16px`/`1.5` line-height, no `fontWeight` set (every real
call site already pairs them with its own `font-medium`/`font-semibold`
utility, so baking a weight into the theme entry would have risked a
CSS-specificity collision). The custom `title`/`h1`/`h2`/`h3`/`button`/
`body`/`link`/`body-sm` typography scale turned out to have exactly one
real call site (`text-h3`) anywhere in the app; `body-sm` (zero call
sites) was retired outright rather than raised.

**Confirm/undo + action feedback (web).** New shared
`components/ConfirmDialog.tsx` (mirrors the Android app's own
`ConfirmDialog.kt` shape), with a fade+scale mount transition and proper
dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby` via
`useId` so multiple instances never collide). Wired into every
previously-unconfirmed meaningful action: note/set/exercise/program-
workout deletes, block ungroup/delete (worded differently on purpose --
deleting a block cascades to delete its member exercises too, per the
`library_workout_exercises.block_id` FK's `on delete cascade`, while
ungrouping first nulls `block_id` on members so they survive as
standalone exercises), AI-proposal approve/discard, and -- caught by the
supervisor pass, not the original audit -- the three library item detail
pages' Publish/Delete buttons and `AssignToClientCard`'s assign action
(the latter not literally named in the plan's own wiring list, but
squarely inside the confirmed "assignments" scope once actually
checked). Every bespoke hand-rolled confirm modal in the app
(`EventModal`, `SaveEditsButton`, `SaveSummaryForm`, `WorkoutClock`,
`FinishWorkoutForm`) replaced with the shared component. Save/remove/
publish/assign buttons across the touched components get real
"Verb -> Verb-ing... -> Verb-ed check" label states instead of a static
label the whole time, including a new small `WeightUnitForm.tsx`
extracted specifically because a Server Component page can't hold that
transient state itself.

**Eased transitions (web).** The three collapsible sidebars
(`LibrarySidebar`/`InboxSidebar`/`ClientAssistantSidebar`) went from
"render a completely different element when collapsed" to one
persistently-mounted `<aside>` that transitions width, with its content
cross-fading via opacity -- closing the resulting tab-order leak (see
the bug list above) by toggling the `inert` attribute on the content
wrapper via a ref, imperatively, since it isn't in this project's React/
TS types yet. `CalendarCard`'s teaser/full-calendar toggle swaps two
structurally different subtrees (no shared width/height to animate), so
each side fades in on mount instead; `EventModal` got the same fade+scale
entrance `ConfirmDialog` already had. A clean *exit* animation on full
unmount was explicitly left out of scope -- a plain CSS transition can't
give one without more plumbing than this pass called for.

**Android color system.** Same table, same `on`-role mapping that
already existed in `Theme.kt` (`onPrimary`/`onPrimaryContainer` feed
from `TextTertiary`/`TextPrimary` respectively -- easy to transpose by
accident, double-checked against the real mapping both while writing it
and in the supervisor pass). `error`/`onError` now override Material3's
own default error red with the new `danger` value, so both platforms
show the identical red. `success`/`warning`/`info` have no Material3
`ColorScheme` slot, so they're exposed through a new small
`ui/theme/ExtendedColors.kt` `CompositionLocal` -- tokens only, since no
screen currently has a success/warning/info state to wire one into.

**Android touch targets, icons, spacing.** `NotificationShade`'s pull-tab
pill grew from 20dp to 24dp tall specifically so its chevron icon could
go to the 24px floor without the icon clipping against the pill's own
rounded-corner clip (a 24px icon in a 20dp container would have
overflowed); `ShadeGlyph`'s category icons also raised to 24dp.
`WorkoutScreen`'s `CompactNumberField` (every reps/weight entry) raised
from 28dp to 30dp; its `SetRow` completion-toggle `IconButton` given an
explicit 36dp size to match the header row's existing 36dp spacer
exactly, instead of the two merely approximating each other. Spacing
outliers (three 24dp error-state paddings, one 24dp pre-section gap, a
handful of 2dp title-to-caption gaps sitting alongside the dominant 4dp
convention) normalized the same way as the web sweep -- against the
app's own real, grep-confirmed convention, not an invented one.

**Android action feedback + transitions.** Inbox's Send button now
flashes "Sent ✓" before reverting, same `LaunchedEffect`+`delay(600)`
pattern `WorkoutScreen` already used for "Saved ✓". Profile's Sync now /
Force full re-sync buttons share one `isSyncing` boolean from their
caller with no prop saying which one just finished -- fixed with local
state (`lastAction`, set before each action fires) that disambiguates
which button gets its own "Synced ✓", rather than only the shared result
text below both of them. `NotificationShade`'s expanded/collapsed swap
and its chevron rotation, plus `WorkoutScreen`'s `ExerciseLogCard`
set-row expand/collapse, all moved from instant `if`/`Modifier.rotate`
swaps to `AnimatedVisibility` (`expandVertically()+fadeIn()`/
`shrinkVertically()+fadeOut()`) and `animateFloatAsState`.

Verified via `npx tsc --noEmit`, `npx next lint`, and a dummy-env
`npx next build` for web (plus `npx vitest --project storybook run`
after every stage that touched a storied component's markup/sizing),
and `./gradlew :app:compileDebugKotlin`/`:app:lintDebug` for Android --
same manual-review-plus-compile posture as every prior Android pass in
this project.

## Phase 14 -- Primitives restructure: Visibility Scope

Starting point for a longer-running effort: restructure the codebase
around a small set of shared product primitives (Template, Assignment,
Timeline, Metric, Scheduled Event, Proposal) instead of continuing to
add one bespoke table per feature. Proposal (`ai_assistant_proposals`,
Phase 5) was already the one primitive genuinely built this way.
Visibility Scope is cross-cutting rather than a sibling primitive, and
is being settled first because Template/Assignment/Metric/Scheduled
Event unification all need to adopt one visibility convention from the
start rather than inventing a fourth mechanism on top of the three that
already exist. Timeline (chat vs. coach_notes) is deferred pending a
separate design discussion -- unlike the others, unifying it is a real
design task (chat has realtime/threading/attachments coach_notes never
needed), not a mechanical collapse.

**The three existing mechanisms, audited.** (1) `coach_notes.is_private`
-- a boolean, checked explicitly by `lib/assistant.ts`'s
`fetchCoachNotesForAssistant` (`.eq("is_private", false)`). (2)
`calendar_events` -- no column at all; the AI assistant's only calendar
fetcher (`fetchBusyBlocksForAssistant`) calls `getBusyBlocks`, never
`listEvents`, so event titles/descriptions structurally never reach the
model regardless of any flag. (3) `client_data_consent` -- a *different*
axis entirely (client-granted permission to share a data type with their
coach at all, not AI-context exclusion), keyed by `data_type`, read via
`getConsentMap`/`isConsented` in `lib/assistant.ts`.

**Decision: two sanctioned mechanisms for AI-context exclusion, not
one.** A boolean column (`is_private`, or `ai_excluded` for any future
table that isn't already using a more specific name) for row-level
opt-out, checked explicitly inside whichever `lib/assistant.ts` fetcher
reads that table -- this is the pattern Template/Assignment and a future
unified Timeline should follow. *Or* query-shape enforcement, where the
AI-facing fetcher is structurally incapable of returning the sensitive
fields (calendar's busy-blocks-only accessor) -- acceptable when a
summary/aggregate view already exists for other reasons, but not a
substitute for a column on a table that has no such narrower accessor.
Every future AI-facing fetcher must live in `lib/assistant.ts` and be
traceable to one of these two mechanisms -- that invariant (not a new
column type) is the actual primitive here.

**Fix: client_data_consent's data_type is no longer a closed set.**
Its own migration comment said adding a data type later should be "a new
row shape, not a schema change," but the `CHECK` constraint it shipped
with contradicted that, proven when `0024_blood_glucose.sql` had to drop
and recreate the constraint just to add one value. `0032_visibility_scope.sql`
drops it for good -- `data_type` is now plain `not null text`, matching
`isConsented`'s own already-open-ended treatment of the key. Unlike the
AI-exclusion axis, this remains deliberately its own mechanism (client
consent to share, not coach/AI privacy) rather than being folded into it.

Verification: schema-only change (a dropped `CHECK` constraint), no
application code depended on its presence -- confirmed via
`grep -rn "client_data_consent_data_type_check"` returning only this
migration and `0024`'s now-historical add/drop of the same constraint.

## Phase 15 -- Primitives restructure: Template, Assignment, Metric, Timeline

The remaining four primitives from Phase 14's framing, built out and cut
over end to end: schema, RPCs, every dashboard consumer, and (for
Assignment/Metric) the Android code that reads or writes the same tables
directly. Proposal (`ai_assistant_proposals`, Phase 5) and Scheduled
Event (settled by Phase 14's visibility decision -- no further change
needed) required no work here.

**Methodology.** Each primitive's schema and RPC rewrite was designed
directly, grounded in the exact current migrations (re-read in full, not
assumed from memory) and a blast-radius check of which Android files
query the old tables directly -- that check changed the plan materially:
Template has zero Android coupling (safe to restructure alone), but
Assignment (`WorkoutRepository.kt`) and Metric (the full Health Connect
sync pipeline + two data repositories) are read or written by Android
directly, so each needed its Postgres migration and its Android/dashboard
cutover done together, not staged separately -- a half-migrated primitive
whose write path and read path disagree about where the data lives is
worse than not migrating at all. The dashboard-and-Android cutover for
each primitive (the large, mechanical file-by-file rewrite once the
schema design was settled) was delegated to a forked agent per primitive,
run against the already-written migration as its spec; each was required
to re-grep for stragglers and run the full verification suite
(`tsc --noEmit`, `next lint`, dummy-env `next build`, the Storybook vitest
project, and for Android, `gradlew compileDebugKotlin`/`lintDebug` plus
manual review in place of an emulator) before reporting back.

**Template** (`0033_templates.sql`). `library_exercises`/`workouts`/
`programs`/`documents` collapse into one `templates` table (`type`
discriminator), with `library_workout_exercises`/`library_program_workouts`
collapsing into one generic `template_components` join (parent/child
instead of workout_id/exercise_id or program_id/workout_id) and
`library_workout_blocks` becoming `template_component_groups`. Exercises
never had a draft/published `status` column before (0029-31 added it to
the other three only, since nothing ever needed an AI-drafted exercise)
-- that gap closes for free since every row now shares one column.
Shared (coach_id null) base exercises keep working via the same relaxed
RLS 0006 introduced, now expressed once instead of per-table. The three
`assign_*_to_client` RPCs were rewritten in this same migration to read
their source content from the new tables -- deferring that to the
Assignment pass would have let a coach's post-cutover edit go straight
into `templates` while the RPCs kept reading stale `library_*` rows.
22 dashboard files cut over (library pages/actions, the three AI-drafting
libs, assistant tool definitions); AI tool names (`get_library_exercises`
etc.) kept unchanged on purpose -- only the queries behind them moved.

**Assignment** (`0034_assignments.sql`). `assigned_programs`/`workouts`/
`documents` collapse into one `assignments` table; `assigned_workout_
exercises` (flattened, no standalone "assigned exercise" concept, so it
stays a flattened child row rather than a join) becomes `assignment_
components`; `assigned_workout_blocks` becomes `assignment_component_
groups`; `document_responses` becomes `assignment_responses`. Program→
workout nesting stays a direct nullable `parent_assignment_id` +
`order_index` on the child row (not a join table) -- 0005's own reasoning
still holds, since every assigned row is a private one-off copy, unlike
templates' genuinely-reusable many-to-many composition.
`workout_sessions`/`workout_session_exercises`'s FK *targets* were
repointed to the new tables with their column names (`assigned_workout_id`
etc.) left untouched, so every session-tracking query on both platforms
-- `SessionLogger.tsx`, `WorkoutClock.tsx`, Android's timer/set-logging
code -- needed zero changes. 18 dashboard files and `WorkoutRepository.kt`
(its three content-display reads; its session/timer/set reads and writes
were already untouched by the FK repoint) cut over, including PostgREST
relation aliasing (`block_id:group_id`, `assignments(name)`) where a
TypeScript interface or a shared helper (`lib/workout-blocks.ts`) depended
on the old field name, to keep the diff at the query layer only.

**Metric** (`0035_metrics.sql`). The 9 per-Health-Connect-type tables
collapse into one `metrics` table: `metric_type` (free text, no `CHECK`
-- unlike `templates.type`/`assignments.type`, this one actually delivers
the "new type is a new row, not a migration" goal 0014's consent table
promised and didn't keep) plus a `value` jsonb column holding whatever
fields are specific to that type. The Android sync engine
(`SyncRepository.kt`) turned out to already be fully data-driven --
it upserts by table name and row map from `SyncSpec.kt`'s per-type
closures with zero per-type special-casing in the engine itself -- so the
real change is almost entirely in `SyncSpec.kt` (9 specs now emit
`metric_type`-tagged rows into one table name) plus one string in
`SyncRepository.kt` (`onConflict` gained `metric_type`). One relaxation,
accepted deliberately rather than worked around: `sleep_stages`' real
composite FK to its parent session (added in 0022) has no equivalent,
since Postgres can't FK into a jsonb field -- harmless, because Android's
own deletion already removes a session's stages by `health_connect_id`
*prefix* match, independent of that FK, which only ever mattered for a
direct SQL delete this product has never done. `client_data_consent`'s
key namespace (`"heart_rate_samples"`, etc.) is deliberately left
unrenamed -- it's a different, client-facing taxonomy from the new
storage-layer `metric_type` values, and conflating the two was explicitly
avoided in both the migration and the Android/dashboard cutover.

**Timeline** (`0036_timeline_entries.sql`, notes only). Per the design
discussion: chat (`chat_threads`/`chat_messages`/`chat_message_reactions`)
keeps its own schema -- it earned its complexity (Realtime, bidirectional
authorship, reply-threading, reactions, pinning, an anti-spoofing insert
check), none of which `coach_notes` or any future session-log/activity
entry type needs, and unifying it would touch Android's live
`postgres_changes` subscription to buy a unification nothing is asking
for. `coach_notes` becomes the first `entry_type='note'` row in a generic
`timeline_entries` table with an open-ended `entry_type` (same posture as
`metrics.metric_type`); `is_private` keeps its exact name and meaning
(AI-context exclusion, the boolean-column mechanism Phase 14 sanctioned).
A future "everything that happened with this client" view, if ever built,
reads `timeline_entries UNION ALL chat_messages` at query time -- a
read-time composition, not something this migration needs to build.

**What's deliberately not done.** Every old table (`library_*`,
`assigned_*`, the 9 health tables, `coach_notes`) stays in place as a
safety net, unreferenced by application code but not dropped. Dropping
them is a separate, explicitly deferred step -- destructive, and only
done on direct request once the new tables have had time to prove out.

Verified per-primitive as described above; the full combined diff was
re-verified with a final `tsc --noEmit` and a repo-wide grep for every old
table name after all four cutovers landed, turning up only the
intentionally-kept AI tool names, the consent-key namespace, and
historical migration-number comments.

## Phase 16 -- Android Stats screen: steps truncating to the oldest few days

Post-Phase-15 smoke test found the "Steps, last 14 days" chart on
Android's Stats screen (`DashboardScreen.kt`) showing only the oldest 4
days in the window while "Sleep, last 14 days" right below it correctly
showed all 12. Investigated with the same two-investigator-plus-supervisor
pattern Phase 13 established (one agent on web/schema, one on Android,
one independently re-verifying both against the actual code before
anything shipped).

**Root cause.** `HealthDataRepository.kt`'s `stepsDeferred`/`sleepDeferred`
queries both passed `order: "start_time.asc"` + `limit: "2000"`.
`SupabaseRestClient.select()` auto-paginates past PostgREST's 1000-row
page cap *unless* the caller's own params already include `limit`, in
which case it issues one single capped request instead. Ascending order
+ a single capped page means a metric type with more rows than the cap in
the window loses everything past it -- which in ascending order is the
*newest* end, not the oldest. Steps (dense per-sample rows, especially
with multiple sources) exceeds 2000 rows in 14 days; sleep (~1-2 rows/
night) essentially never does, which is exactly why only steps truncated.

**Confirmed pre-existing**, not a Phase 15 regression -- diffed against
the commit immediately before that work began and found the identical
pattern already there, untouched by the Metric cutover (which only
renamed the table and added the `metric_type` filter). Also confirmed to
be the *same bug class* the web dashboard already hit and fixed in
`562f711` ("Paginate sample-based queries past PostgREST's 1000-row
default cap") -- that commit's own message notes the bug had previously
been misdiagnosed as duplication/proration twice before being correctly
identified as plain truncation, which is almost certainly why this class
of bug reads as "duplication or cutoff, not sure which" in institutional
memory. The web fix (`lib/queries.ts`'s `fetchAllRows()`) was never
ported to this Android screen. `DataPointRepository.kt`'s steps query
was checked and confirmed clean -- it never set `limit`, so it was never
vulnerable.

**Fix.** Removed the `limit` param from both queries, letting
`SupabaseRestClient.select()`'s existing pagination run -- both queries
are already date-bounded by `sinceIso`, so this only changes behavior
when there's enough real data to need more than one page. A `desc`+
re-sort alternative was considered and rejected: `bucketSleepByNight`
(unlike `bucketStepsByDay`) doesn't re-sort its own output, and
`DashboardScreen`'s "last night's sleep" reads `sleepNights.lastOrNull()`
assuming ascending order already -- a naive `desc` flip would have
silently swapped "last night" for "first night in the window," the same
class of silent-wrong-data bug this fix was for.

Verified: `./gradlew :app:compileDebugKotlin` and `:app:lintDebug` both
clean. No live Supabase access in this environment (standing constraint
throughout this project) to confirm against real row counts -- this
remains a high-confidence code-reading fix pending a real-device check.

## Phase 17 -- Android light/dark mode audit

Requested audit against four rules: text/background contrast, card
background matching page background (with a border + shadow instead of a
second fill tone), uniform stat-tile sizing, and titles/buttons that don't
wrap or resize when a sibling's state changes. Same two-audit-plus-
supervisor methodology as Phase 13 and the steps-data-bug investigation --
one agent on color/card-surface, one on stat-tile/title-button layout, a
supervisor independently re-verifying both against the real code (and
sweeping `CoachHomeScreen.kt`/`ComingSoonScreen.kt`/`SlideOutNav.kt`,
which neither investigator had named) before anything shipped.

**Text contrast: clean, no changes.** Every `Text` color already pairs
with the token backing its real container everywhere.

**Card bg = page bg: `Theme.kt`'s card/page split was systemic and
deliberate -- reversed.** `background` and `surface`/`secondary`/
`primaryContainer`/`surfaceVariant` previously resolved to different
tones (page vs. card) in both themes; now all resolve to the same
`Primary` value, so a card reads as distinct only via its own border +
elevation (most `OutlinedCard` usage already had both and needed no
other change). `LightSecondary`/`DarkSecondary` removed from `Color.kt`
as now-unused. Two things that depended on the old two-tone split would
have broken *worse* once unified, so they shipped in the same change:
`home/NotificationShade.kt`'s `PreviewCard`/`EventPreviewCard` and their
date chip had no border at all and were only visible by fill-color
contrast against their parent panel -- added a real border to each.
`DashboardScreen.kt`'s `SleepBarChart` bar fill used `colorScheme.secondary`
(already washed-out against the page, visible in an earlier bug-hunt
screenshot) -- would have gone fully invisible; moved to
`ExtendedColors.info`. The shade's own outer panel (no border, fills with
`surface`) was reviewed and left alone -- it's header chrome anchored to
the status bar, not a card, so becoming page-colored is a harmless side
effect, not a regression.

**Stat tiles: one real bug, `HomeScreen.kt`'s `TopDataPointsRow`.**
`weight(1f)` only equalized width; a tile whose value wrapped to two
lines rendered taller than its siblings. Fixed with
`height(IntrinsicSize.Min)` on the row and `fillMaxHeight()` on each
card.

**Titles wrapping / buttons resizing between states: confirmed, including
the named case.** `WorkoutScreen.kt`'s in-progress header had no
`maxLines`/overflow on the title and no fixed width on the Pause/Resume
or Finish/Finishing buttons, so the title wrapped as a button's own label
changed its width -- split into two rows (title alone with `maxLines = 1`
+ ellipsis; buttons below) and gave each button a `widthIn(min = ...)`
sized to its own longest label, so neither the wrap nor the per-button
resize can happen. Same title treatment applied to the pre-workout header
for consistency (never actually triggers today, no adjacent
state-changing button, but kept matching). The same "button resizes with
its own label" pattern, standalone rather than title-adjacent, got the
same `widthIn(min = ...)` fix in six more places: `ProfileScreen.kt`'s
Sync now / Force full re-sync buttons, `InboxScreen.kt`'s Send button,
`LoginScreen.kt`'s Send code button, `VerifyCodeScreen.kt`'s Verify and
Resend code buttons, and `CalendarScreen.kt`'s Connect/Manage button.

Verified: `./gradlew :app:compileDebugKotlin` and `:app:lintDebug` both
clean. Minimum button widths are estimated from label length and Material3
default content padding, not measured against a render -- worth a visual
check on a real device, same caveat as every other Android-only change in
this project (no emulator in this environment).

## Phase 18 -- Phase 17's fix didn't actually fix it: two root causes the audit missed

Real-device screenshots after Phase 17 shipped showed both problems still
present -- dark, barely-legible text on dark backgrounds, and cards still
visibly a different color than the page. Phase 17's audit checked every
explicit color pairing and every token value and found both genuinely
clean; the actual bugs were in two mechanisms neither investigator was
asked to look for -- not wrong colors, but *missing* ones and an automatic
Material3 behavior neither had reason to suspect from reading token
values alone. Diagnosed directly this time (the mechanism was concrete
enough, and the stakes of guessing wrong on a second pass were high
enough, to verify in code rather than delegate).

**Dark-on-dark text: every screen's `Scaffold` had the bug `HomeScreen.kt`
already found and fixed once.** `HomeScreen.kt` doesn't use `Scaffold` --
it has its own `Surface(color = Color.Transparent, contentColor =
MaterialTheme.colorScheme.onBackground)` with a comment explaining
exactly why both params are required together: `Color.Transparent` isn't
a role Material3's `contentColorFor()` can map to an "on-X" text color,
so if `contentColor` isn't given explicitly it resolves to
`Color.Unspecified`, and `LocalContentColor` becomes `Unspecified` for
every descendant -- any `Text` that doesn't set its own explicit `color`
(as `StatRow`/`StepsBarChart`/`SleepBarChart`'s values, `WorkoutScreen`'s
title, and others don't) then falls through to a near-black default,
regardless of theme. Every *other* screen uses `Scaffold(containerColor =
Color.Transparent)` -- the exact same setup, minus the `contentColor`
HomeScreen's own comment says is required. Fixed by adding
`contentColor = MaterialTheme.colorScheme.onBackground` to all 9 of
them (`CalendarScreen`, `ProfileScreen`, `ComingSoonScreen`,
`VerifyCodeScreen`, `InboxScreen`, `WorkoutScreen`, `CoachHomeScreen`,
`LoginScreen`, `DashboardScreen`), matching the pattern already proven
correct once.

**Card color still different from the page: Material3's automatic
elevation tint, using `primary` by default.** `Theme.kt` never set
`colorScheme.surfaceTint`, so it defaulted to `primary` (the warm
accent). Every `OutlinedCard` here sets a nonzero elevation
(`CardDefaults.outlinedCardElevation`), and Material3's `Surface` blends
`surfaceTint` over an elevated surface's fill at an alpha proportional to
that elevation to simulate a lighting/elevation effect -- so despite
`surface` and `background` now resolving to the identical base color
(Phase 17's fix), every card still rendered with a visible accent-tinted
overlay the flat page never got. Fixed by pinning `surfaceTint` to the
same `Primary` value as `background`/`surface` in both color schemes,
making the blend a no-op -- a card's fill is now actually identical to
the page, with only its border marking it as a card, which was the
actual, original ask.

Verified: `./gradlew :app:compileDebugKotlin` and `:app:lintDebug` both
clean. Both root causes are standard, well-documented Material3
mechanisms (`contentColorFor`'s role-mapping fallback, `Surface`'s tonal
elevation blend) rather than anything specific to guesswork about this
codebase -- confirmed by reading the actual `Scaffold`/`Surface` call
sites and `Theme.kt`, not inferred from the screenshots alone. Still
pending a real-device visual confirmation, same standing limitation as
every Android change in this project.

## Phase 19 -- Pre-merge: finished an incomplete storybook removal

Checking PR #18 before merging to `main` found both Vercel deployment
checks failing. Every local verification this whole restructure relied
on had reused already-installed `node_modules` rather than a fresh
install, so a partial dependency removal several commits back on this
branch (dashboard storybook setup, "removed storybook and related
dependencies") never got caught locally -- it deleted `.storybook/` and
the Next.js-specific `@storybook/*` packages, but left 10 `.stories.tsx`
files importing the now-gone `@storybook/nextjs-vite`, plus `vitest.config.ts`,
`.eslintrc.json`'s `plugin:storybook/recommended` extend, and several
now-fully-orphaned devDependencies (`storybook`, `eslint-plugin-storybook`,
`vitest`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, `msw`,
`playwright`, `mockdate`, `vite`) and `public/mockServiceWorker.js` in
place. Next.js type-checks every file in the project during `next
build`, regardless of whether anything imports it, so the orphaned story
files' dangling import failed the build outright -- reproduced locally
with `npm ci` + a dummy-env `next build` (vs. this session's prior checks,
which never re-installed from the lockfile and so never saw it).

Finished the removal: deleted the 10 story files, `vitest.config.ts`,
and `public/mockServiceWorker.js`; dropped the dead ESLint extend and the
now-unused devDependencies (confirmed via grep that nothing outside
storybook ever imported `msw`/`mockdate`/`playwright`/`vitest` -- no
`.test.ts` files or e2e setup exist in this project). Regenerated
`package-lock.json` via `npm install`. Verified against a genuinely fresh
install this time: `npm ci`, `tsc --noEmit`, `next lint`, dummy-env `next
build` all clean.

## Phase 20 -- Dropped the pre-restructure tables

The last deferred step from Phases 14-15: `library_*`, `assigned_*`,
`document_responses`, the 9 original Health Connect tables, and
`coach_notes` were kept in place through the whole restructure as a
safety net while every consumer got cut over -- confirmed cut over and
merged since PR #18. Re-ran a fresh repo-wide grep across `dashboard/`
and `android/` immediately before writing `0037_drop_legacy_tables.sql`
and found zero remaining references (only AI tool names like
`get_library_exercises`, PostgREST relation aliases like
`assigned_workouts:assignments(name)`, and `metric_type`/consent-key
string values that happen to share a name with an old table -- none of
which are an actual table reference), so dropped all of them. Order
follows each group's own FK graph (children before parents), with
`cascade` on every statement as a second line of defense rather than a
substitute for getting that order right. `workout_sessions`/
`workout_session_exercises`/`workout_session_sets` untouched, as their
FKs were already repointed away from the dropped tables back in 0034.

No application code changes needed -- this is a schema-only migration.
Verified with `tsc --noEmit` (clean, as expected for a DB-only change).

## Phase 21 -- Steps data accuracy: client timezone + chosen data source

Follow-up to the Phase 16 pagination fix: steps still didn't match the
client's wearable even after that shipped. Investigated directly (traced
the root causes from the code's own comments rather than needing another
multi-agent audit) and found two real, concrete issues, plus a feature
request that turned out to simplify one of them.

**Root causes.** (1) Android's on-device Stats/data-point screens never
got the cross-source dedup web's `resolveOverlappingSources` already had
-- both files had their own comments flagging the gap. Health Connect
doesn't dedupe a wearable and a phone's own step sensor both reporting
the same walk, so Android was summing both and showing more than the
wearable alone ever reported. (2) Day-bucketing was inconsistent across
platforms: web bucketed by **UTC** calendar day (deliberate, per that
code's own comment), Android by the **device's real local** timezone --
for any client not in UTC, the same data could land on different
calendar days depending on which surface you looked at. Root enabler:
nothing in the schema stored a client's timezone at all, and Android
never sent one -- web had no way to do better than UTC even if it tried.

**Schema (`0038_client_timezone_and_source_preference.sql`).**
`client_profiles.timezone` (IANA zone id, Android writes it on every
sync, same "device reports its own setting" pattern as
`preferred_weight_unit`). `client_metric_source_preference` (one row per
`(client, metric_type)` a client has explicitly overridden) -- the new
feature requested alongside the fix: let a client pick an explicit
source ("use my Garmin, not my phone") instead of relying on the merge
heuristic. A set preference makes the heuristic moot for that type --
with one source there's nothing left to reconcile.

**Web (`lib/queries.ts`).** Added a small offset-correction timezone
helper (`tzOffsetMillis`/`localDateKey`/`localDayStartUtc`, via
`Intl.DateTimeFormat` rather than a new date-library dependency) and
threaded a client's stored timezone through every per-day aggregation --
`resolveOverlappingSources`, `accumulateStepsByDay`, sleep, exercise
sessions, and the sample-series chart data all bucket by the client's
real local day now. `getOverviewStats`' "today" boundary moved off the
server's own ambient timezone (`new Date().setHours(0,0,0,0)` --
effectively arbitrary on a Vercel/Node runtime) onto the same helper.
Also closed a gap found along the way: "Steps today" on the overview
never went through the dedup heuristic at all, unlike the chart right
below it -- it does now. Every per-metric-type fetch also checks
`client_metric_source_preference` first and filters to that source when
set, skipping the heuristic entirely.

**Android.** `SyncRepository.kt` patches `client_profiles.timezone` from
`ZoneId.systemDefault().id` at the start of every sync -- cheap,
idempotent, a failure here doesn't fail the sync itself. `HealthData
Repository.kt`/`DataPointRepository.kt` each got their own
`resolveOverlappingSources` (same heuristic as web -- group by local
day, pick the higher-total source as primary, prorate the rest by
non-overlapping time -- independently implemented per file rather than
shared, matching those two files' existing independence from each
other), gated the same way: check for a preference first, filter and
skip the heuristic if one exists. `ProfileScreen.kt`'s "Data types"
section gained a per-type source picker (`SourcePicker`, a `DropdownMenu`
off a `TextButton`) -- "All sources" (clears the preference) plus
whichever sources have actually been seen for that client+type, with a
small known-package-to-friendly-name table (Garmin Connect, Samsung
Health, Google Fit, etc.) and a title-cased fallback for anything
unrecognized. `SupabaseRestClient.kt` gained a generic `delete(table,
filters)` -- it previously only had a health-connect-id-prefix-specific
one. `ProfileRepository.kt` gained the read/write methods for the new
table, following its existing role as the place Android reads/writes
`client_profiles`-adjacent settings.

Verified: dashboard `tsc --noEmit`/`next lint` clean; Android
`compileDebugKotlin`/`lintDebug` clean, independently re-run and the
dedup/preference-gating logic spot-checked directly against the diff
(not just the fork's own report) before committing. Two things flagged
as unverified rather than claimed solid: the friendly-name package-id
mapping (no real device/emulator here to confirm against), and the
whole feature generally, same standing limitation as every prior pass --
no live Supabase project in this environment to confirm against real
multi-source data.

## Phase 22 -- Android: dashboard load time + persistent nav

Two more reported Android behaviors, investigated and fixed directly
(no multi-agent audit needed -- both root causes were findable by
reading the existing code and its own comments).

**Dashboard slow to load, on both first load and navigating back.**
Two compounding causes, both in `SupabaseRestClient.kt`, so the fix
benefits every screen's repository calls, not just Dashboard/Stats:

1. Every `SupabaseRestClient` instance built its own fresh `OkHttpClient`
   (10+ construction sites across the repositories). Square's own
   guidance is that `OkHttpClient` should be a shared singleton -- it
   owns a real connection pool and thread pool, and a fresh instance per
   call throws away TCP/TLS connection reuse on every single request.
   Fixed with a `by lazy` shared singleton (`sharedHttpClient`); each
   `SupabaseRestClient`'s own `http` now just points at it.
2. `select()`'s pagination loop was strictly sequential (`while(true) {
   fetch page; await }`), even though the call itself already runs
   concurrently with the dashboard's other queries via `async`. A dense
   per-minute Garmin steps history over a 14-day window can need
   5-10+ pages for one query alone. Fixed by fetching the first page
   with `Prefer: count=exact`, reading the total row count straight off
   PostgREST's `Content-Range` response header (no separate count
   round-trip needed), and fetching every remaining page in parallel via
   `async`/`awaitAll` instead of one at a time.

No live device/emulator in this environment to measure the actual
before/after latency -- verified via `compileDebugKotlin` only. This is
an acknowledged limitation, not a claimed fix confirmed on-device.

**Persistent nav, collapse/expand driven only by the user.** Two
separate bugs, both architectural:

1. *Auto-collapses on navigate.* `SlideOutNav.kt` baked an unconditional
   `onToggleExpanded()` call into every destination button's `onClick`
   (previously "by design," per that file's own prior comment). Removed
   it -- selecting a destination now only calls `destination.onClick`;
   expand/collapse is driven solely by the dedicated toggle button,
   independent of navigation.
2. *Doesn't persist across screens.* `SlideOutNav` was only ever composed
   inside `HomeScreen` -- every other screen (Dashboard/Workout/Calendar/
   Inbox/Profile) had no nav chrome at all. Fixed by hoisting it out of
   `HomeScreen` entirely and into `MainActivity`'s top-level composition,
   rendered once as a persistent overlay (a sibling of `AuthNavHost` in
   the same outer `Box`), gated on `role == "client" && userId != null`
   to keep coach accounts nav-free exactly as before. `AuthNavHost.kt`'s
   `dashboardRoute`/`workoutRoute`/`calendarRoute`/`inboxRoute` helpers
   became public so `MainActivity` can build the same routes directly.
   A `navigateTopLevel()` extension (`launchSingleTop` +
   `popUpTo(ROUTE_HOME, saveState = true)` + `restoreState = true`, the
   standard Jetpack Navigation Compose persistent-nav pattern) keeps the
   back stack from growing unboundedly now that the nav can jump between
   top-level destinations from anywhere, not just from Home.

Hoisting the nav required hoisting its `expanded` state too -- now
`rememberSaveable` (survives process death, not just in-session
navigation) at the `MainActivity` level instead of `remember`ed inside
`HomeScreen`. That in turn meant hoisting `userId`/`role`/`displayName`/
`homeSummary` and their fetch out of `HomeScreen`'s own composable scope
(which only exists while `ROUTE_HOME` is the active destination) up to
the same level, since the nav needs `role`/`userId` to decide whether to
render at all, regardless of which screen is showing. A deliberate bonus
side effect: Home's role/summary data is no longer re-fetched from
scratch every time a client navigates back to Home -- the same class of
fix as the dashboard load-time issue above, just for Home specifically.

Verified: `compileDebugKotlin`/`lintDebug` both clean across all four
touched files (`SupabaseRestClient.kt`, `SlideOutNav.kt`,
`AuthNavHost.kt`, `HomeScreen.kt`, `MainActivity.kt`); the lone lint hit
in `MainActivity.kt` (`Uri.parse` vs `String.toUri`) is a pre-existing
style suggestion unrelated to this change. As with the load-time fix
above, there's no device/emulator here to confirm the nav's actual
on-device feel (expand/collapse persistence across real navigation,
animation smoothness) -- only compile, lint, and direct code review are
available as verification in this environment.

## Phase 23 -- Nav on-device follow-up + a real "null" message bug

A screenshot from the just-shipped Phase 22 nav confirmed it now
persists and stays collapsed/expanded correctly, but also surfaced two
more issues: the nav visually overlapped Inbox's composer/Send button,
and there was no way back to the Home screen from the nav at all. The
same screenshot also showed a client chat message rendering as the
literal text "null" -- not asked about, but a real bug, investigated
and root-caused along with the other two.

**Nav overlapping Inbox's Send button.** Root cause: `SlideOutNav`'s
outer `Box` always reserves its fully-expanded width (`expandedWidth`,
~354dp for 5 destinations) and right-aligns its content within that
reserved space (`contentAlignment = CenterEnd`) so the toggle button
doesn't visibly jump position when the pill expands/collapses. Anchored
at the screen's true bottom-left corner, that means the *collapsed*
toggle actually renders well to the right of the literal left edge --
on narrower screens, close enough to collide with whatever a given
screen pins at its own bottom-right (Inbox's composer row). Fixed by
giving the nav extra bottom clearance (`NAV_BOTTOM_CLEARANCE = 80.dp`,
on top of the normal 16dp edge padding) in `MainActivity.kt`, enough to
clear a standard `OutlinedTextField` + `Button` composer row (~88dp
tall) on any screen, not just Inbox.

**No way back to Home from the nav.** The persistent nav's five
destinations (Workouts/Calendar/Inbox/Stats/Profile) never included the
Home screen itself -- reachable only via each screen's own back arrow.
Added a sixth destination ("Home", using the user-supplied house-outline
icon -- a new `ic_home.xml` vector drawable matching the existing
icons' convention: 24dp viewport, 2dp stroke, round caps/joins, no
fill) as the first item in the list, navigating to `ROUTE_HOME` via the
same `navigateTopLevel()` helper as the others.

**The "null" message bug.** Root cause: `ChatRepository.kt`'s
`getMessages()` read a message's body via the single-argument
`JSONObject.optString("body")`. org.json's own `NULL` sentinel has a
`toString()` of `"null"`, and the no-fallback overload of `optString`
returns that sentinel's `toString()` rather than Kotlin `null` or an
empty string when the column is SQL `NULL` -- so a message whose body
column was actually null rendered as the literal text "null" in
`MessageBubble`. This codebase already has the correct fix for this
exact org.json footgun elsewhere (`WorkoutRepository.kt`'s
`toWorkoutSession()`/`toSessionSet()`, which guard every nullable
column with `isNull(...)` first) -- `ChatRepository.kt` just didn't
have it. A grep for the same no-fallback `optString(key)` pattern
turned up two more real instances of the same bug class, both logic
inversions rather than cosmetic text: `HomeSummaryRepository.kt`'s
`loadCheckInDue()` read a null `submitted_at` as "already submitted"
(so a client who hadn't actually submitted their check-in yet would
have it silently marked not-due), and `loadWeekCompletion()` read a
null `completed_at` as "completed" (so a merely-started, unfinished
workout session would show as a solid DONE dot on Home's week strip
instead of PARTIAL). All three fixed with the same `isNull(...)` guard
pattern already established in `WorkoutRepository.kt`. (The other
`optString` call sites in the codebase all use the two-argument
`optString(key, fallback)` overload, which org.json implements safely --
left untouched.)

Verified: `compileDebugKotlin`/`lintDebug` clean. No device/emulator
here to confirm the nav's new clearance looks right in practice or that
a real null `chat_messages.body`/`check_in_responses.submitted_at`/
`workout_sessions.completed_at` row reproduces as described -- the fix
follows directly from org.json's documented `optString` behavior and
this codebase's own existing correct usage of the same guard elsewhere,
but isn't confirmed against live data in this environment.

## Phase 24 -- Nav toggle unreachable once expanded (regression from Phase 23)

On-device follow-up to Phase 23's Home icon: expanding the nav made the
toggle button disappear entirely, with no way to collapse it again.

**Root cause.** `SlideOutNav`'s anti-jump fix (Phase 22-era, predates
this phase) reserves the pill's *fully expanded* width in an outer `Box`
at all times and right-aligns the actual content within it, so the
toggle button's on-screen X position is fixed regardless of expanded
state. That fixed position is `left-edge + expandedWidth - toggle
width` -- it was never actually validated against how much screen width
is available. Going from 5 destinations to 6 (adding Home in Phase 23)
pushed `expandedWidth` from ~354dp to ~412dp, and on screens narrower
than that, the toggle's now-fixed position landed past the right edge
of the display -- rendered, but literally off-screen and untappable.

**Fix.** `SlideOutNav` now measures its real on-screen budget with
`BoxWithConstraints` and caps the reserved width at `minOf(expandedWidth,
maxWidth)`, so the toggle's fixed position can never exceed the visible
area no matter how many destinations are configured or how narrow the
screen is. If the destinations themselves don't fit in what's left
after that cap (pill padding + toggle width), the destinations row now
scrolls horizontally (`horizontalScroll` + `widthIn(max = ...)`) instead
of overflowing invisibly off-screen -- so on a screen too narrow for all
6 destinations to lay out flat, every destination is still reachable by
swiping, rather than some of them silently becoming untappable too.

Verified: `compileDebugKotlin`/`lintDebug` clean. Still no device/
emulator here to confirm the toggle is now visibly reachable on the
screen size from the reporting screenshot, or that the horizontal-scroll
fallback feels right in practice if it ever actually engages -- this is
a from-first-principles layout fix (the `BoxWithConstraints`/`minOf`
cap directly eliminates the off-screen-toggle failure mode the previous
fixed-width approach had no guard against), not one confirmed visually
against the reported device.

**Follow-up, same report:** the owner wasn't convinced a horizontal
scroll inside a bottom-corner pill nav would read as discoverable to
users, and asked instead to simply not show the icon for whatever
screen the user is already on. That's a better fix anyway -- it means
every one of the 6 screens shows at most 5 destinations at once (never
"go to where you already are"), which is exactly the icon count that
already fit comfortably before Home was added, so the Phase 24 scroll
fallback becomes a rare safety net (still useful for a route outside
the nav's own 6, like `ComingSoonScreen`, which currently shows all 6
since none of them match it) rather than the everyday behavior.
Implemented by making `AuthNavHost.kt`'s `ROUTE_DASHBOARD`/
`ROUTE_WORKOUT`/`ROUTE_CALENDAR`/`ROUTE_INBOX` route *templates* public
(alongside the route-builder functions, which already were) and reading
`navController.currentBackStackEntryAsState()` in `MainActivity.kt` to
filter each destination out of the list when its route matches the
current one -- comparing against the template directly works because
Navigation Compose's own `destination.route` is the template string
(e.g. `"workout/{clientId}"`), not the resolved path with the real
`clientId` filled in, so no argument-decoding is needed to compare.

Verified: `compileDebugKotlin`/`lintDebug` clean.

## Phase 25 -- User-testing round 1: sleep precision + Android bottom-of-screen coverage

First two (of four) fixes from the first real round of user testing. The
other two -- a workout/exercise authoring redesign and a full scheduling
calendar -- are substantially larger and tracked in Phase 26+ below.

**Sleep shown as "7h 30m" instead of "7.5h".** Users reported sleep not
matching their wearable, and the rounded-to-one-decimal display was
hiding exactly how far off. Root cause was display-only -- both
platforms already recompute `hours` from a raw `start_time`/`end_time`
diff on every load; nothing decimal is persisted. Changed the rounding
itself from nearest-tenth-of-an-hour to nearest-minute, and added a
small `formatHoursMinutes()` helper on each platform (`dashboard/lib/
time-format.ts`, next to the existing `formatClock`; a new top-level fn
in `HealthDataRepository.kt`), applied everywhere sleep duration is
shown as text: `getDataPointSummary`'s "X last night" card and
`DataOverlayChart`'s tooltip on web (special-cased on the `sleep_
sessions` series key, since that chart is shared across every metric
type and the others still show their normal decimal + unit), and
`DashboardScreen.kt`'s "Last sleep" stat row + per-night chart labels
on Android. `getOverviewStats`'s `lastSleepHours` (AI-assistant context
only, never rendered as text to a user) got the same minute-precision
fix for consistency but intentionally stayed a plain number, not an
h:mm string.

**Android: system nav bar covering bottom-of-screen content.** Investigated
by disassembling the actual compiled Material3 1.2.1 AAR this project
depends on, not just reading docs -- confirmed `Scaffold`'s default
`contentWindowInsets` already resolves to `WindowInsets.systemBars`, so
every screen using `Scaffold` + `.padding(padding)` on its root content
was already nav-bar-safe; adding `.navigationBarsPadding()` there would
have been redundant, not a fix. Two real, confirmed gaps instead: (1)
`InboxScreen.kt`'s composer row had no `.imePadding()`, so the keyboard
(not the nav bar) could cover it -- fixed. (2) `ProfileScreen.kt`'s
"Data types" section's `SourcePicker` `DropdownMenu` -- disassembled
Material3's `DropdownMenuPositionProvider` directly and confirmed it
positions purely against raw window size with zero inset awareness at
all, so with its anchor sitting flush at the bottom of the scrollable
content, the popup could open downward into the area behind the system
nav bar. Fixed exactly as the user asked -- added real bottom margin
(`Spacer(Modifier.height(72.dp))`, the same clearance convention
`HomeScreen.kt` already uses) after the last `ListItem` in that section,
so the dropdown's anchor is no longer flush against the edge the
position provider measures against.

Verified: `compileDebugKotlin`/`lintDebug` clean (Android); `tsc
--noEmit`/`next lint` clean (web). No device/live environment to
visually confirm the dropdown no longer clips behind the nav bar in
practice -- this fix follows directly from disassembling the actual
library code in use, not guesswork, but isn't confirmed on a real
screen.

## Phase 26 -- User-testing round 1: workout/exercise authoring redesign (web)

Third (of four) fix from this round of user testing. Creating a workout
used to be two separate pages -- `workouts/new` collected only title/
media/description, then redirected to `workouts/[workoutId]`, the only
place exercises could actually be added. The exercise picker there was
a native `<select>` holding every exercise the coach can see (own +
shared base library) as one giant list of `<option>`s -- no hard
server-side cap, just the practical ceiling of a native dropdown once a
library gets large. And an assigned workout -- a specific client's own
copy -- had no editor anywhere; the only page for one was read-only.

**One screen, not two.** `workouts/new/page.tsx` no longer has a form at
all -- visiting it now just mints a blank `status: 'draft'` workout
("New workout") and redirects straight to `workouts/[workoutId]`, the
same screen used for editing, with `autoFocus` on the name field so the
coach can immediately type over the placeholder. This is the same
"create as a draft, then edit in place" shape already established for
AI-drafted workouts (`lib/workout-drafting.ts`) -- confirmed that path
already lands a coach on this exact screen too, so it picks up the
merged flow with no changes of its own. The old `createWorkout` server
action (form-based, only ever called from the now-gone form) was
deleted rather than left unused.

**Exercise search, not a dropdown.** New `ExerciseSearchField`
component (`components/library/ExerciseSearchField.tsx`), shaped like
the existing `calendar/TimeCombobox.tsx` (controlled input, `open`
state, absolute-positioned results list, click-outside-to-close) but
committing a picked exercise's *id* into a hidden form field rather
than free text, so the surrounding `<form action={addWorkoutExercise}>`
needed no changes beyond swapping the `<select>` out for this. Filters
by plain substring ("contains") match against the full exercise list,
loaded once and filtered client-side -- deliberately not debounced
server search, since a coach's own + shared library is realistically in
the low hundreds and trivially fast to filter in-browser; the fetch is
isolated behind one prop so it can become a real debounced search later
without touching the component, if a library ever actually grows past
what's comfortable in memory. No match → a "Create new exercise" result
row instead of an empty list.

**Inline exercise creation, round-trips back to the workout.** No
`returnTo` pattern existed anywhere in this app before. Added one:
`ExerciseSearchField`'s "Create new exercise" row links to
`exercises/new?returnTo=<workout URL>&name=<typed text>` (pre-filling
the new exercise's name from what was already typed); `createExercise`
reads `returnTo` (validated as same-origin-relative only, never an open
redirect) and, on success, redirects to `${returnTo}?addExerciseId=<id>`
instead of the exercise's own detail page. Each workout page checks for
that query param on load, calls its own "add exercise" action with it,
then redirects to its plain URL -- so a refresh never double-adds it,
and the coach lands back exactly where they were building the workout,
with the new exercise already in the list.

**Editing an assigned workout's own exercises -- new capability,
confirmed in scope with the user.** `assignments`/`assignment_
components` already carry everything needed for this (per `0034_
assignments.sql`'s own header comment, a client's assignment is a
frozen *flattened copy*, not a join back to the template) and RLS
already grants the coach full insert/update/delete on
`assignment_components`/`assignment_component_groups`
(`assignment_components_coach_all` etc.) -- confirmed before writing
any code that no new migration was needed for this part, only
application code. Added a full mirror of `workouts/actions.ts`'s nine
exercise/block mutations in a new `assigned/workouts/
[assignedWorkoutId]/actions.ts`, targeting `assignment_components`/
`assignment_component_groups` (`assignment_id`, not `parent_id`) instead
of `template_components`/`template_component_groups`, each taking
`clientId` as a leading bound argument so the resulting function still
matches the same `(targetId, ...)` shape the editor component expects.
Adding a new exercise there copies the picked exercise's current
display fields onto the new flattened row (name/instructions/media),
the exact same copy `_assign_workout_snapshot` already does when a
workout is first assigned, with `source_template_id` set to the picked
exercise.

**`WorkoutExerciseListEditor` is now one component serving both
screens**, not two near-copies. Refactored it to take its nine
mutation functions as an injected `actions` prop (`WorkoutExerciseActions`)
and a generic `targetId` instead of importing `workouts/actions.ts`'s
functions by name and hardcoding a `workoutId` -- the component itself
never knew or cared whether an id was a workout's own or a client's
assignment of one, so neither call site has to either. The template
editor (`workouts/[workoutId]/page.tsx`) and the new assigned-workout
editor each pass their own matching `actions` bundle.

Verified: `tsc --noEmit`, `next lint`, and a full dummy-env `next build`
(34/34 pages, no errors) all clean. No live Supabase project in this
environment to exercise the actual search/returnTo/add flow end to end
against real data, or to confirm the exercise list stays comfortably
fast to filter at a real coach's library size -- both are implemented
exactly as designed and verified by direct code review, not by running
them live.

## Phase 27 -- Scheduling calendar: schema, web read side, drag-and-drop

The fourth and largest fix from this round of user testing. The
calendar previously showed only coaching calls (`calendar_events`) --
nothing tied a workout, program, document, or check-in to a specific
day anywhere in the schema. This phase lays the foundation
(`supabase/migrations/0039_assignment_scheduling.sql`) and builds the
web side on top of it; Android and the remaining web interactions
(click-to-edit/complete, assign-from-calendar) are tracked in the
stages below this one, still in progress as of this entry.

**Schema.** `assignments` gains `scheduled_date` (the day an item shows
on the calendar), `start_date` (program rows -- when a client's run of
it begins), `week_number`/`day_of_week` (workout rows, carried straight
from `template_components` at assignment time -- that data existed at
the template level already, via `ProgramWorkoutListEditor.tsx`'s
`ScheduleFields`, but was never carried through to the client's actual
assignment before this), `recurrence_days_of_week`/`recurrence_end_date`
(standalone recurring workouts), and `recurrence_source_id` (set on a
*generated* occurrence row, deliberately separate from
`parent_assignment_id`, which already means "nested under this program
assignment"). A program's nested workouts get a concrete `scheduled_date`
computed once at assignment time (`start_date + (week_number-1)*7 +
(day_of_week-1)` days -- day_of_week here is relative to start_date's
own weekday, not a fixed Monday-start week; documented inline in the
migration). Two new RPCs: `reschedule_assignment` (security definer --
the only write a client has onto their own assignment row at all,
deliberately narrower than a blanket client UPDATE policy would be) and
`generate_recurring_occurrences` (security definer, idempotent,
materializes real independent assignment rows -- each with its own
copied exercises -- for a recurring workout's missing occurrences in a
bounded window, rather than computing virtual occurrences at read time;
moving one occurrence only ever touches that row). check_in_templates/
check_in_responses needed no schema change -- day_of_week there already
supports projecting virtual occurrences cheaply at read time.

Unusually for this project, the migration was verified by actually
running it: this environment turned out to have PostgreSQL 16 installed
locally (unused until now). Ran the *entire* 39-migration history
against a fresh local database (stubbing only the Supabase-specific
pieces an app migration wouldn't otherwise need -- `auth.users`/`auth.uid()`,
`storage.buckets`/`storage.objects`, the `anon`/`authenticated` roles, a
`supabase_realtime` publication), then exercised every new function with
real inserts: a two-workout program assigned with a Monday start date
produced exactly the expected `scheduled_date`s (including a workout
left intentionally unscheduled on the template, which correctly stayed
unscheduled rather than defaulting to week 1 day 1); `reschedule_
assignment` worked for the owning coach and client and correctly
rejected an unrelated user; a Monday/Wednesday recurring workout
generated exactly the right occurrence dates over a 21-day window, each
with its exercises copied, running the generator twice produced no
duplicates, and both of `generate_recurring_occurrences`'s own guards
(non-recurring assignment, unauthorized caller) rejected correctly. This
is real functional verification, not just "the SQL parses."

**Web read side (`lib/calendar-items.ts`).** A new `listCalendarItems`
merges `calendar_events` with scheduled workouts/documents and projected
check-in occurrences into one `CalendarItem[]`, each tagged with a
`kind`. Deliberately client-scoped only -- the coach's own aggregate
`/dashboard/calendar` workspace (showing every client's calls at once)
stays calls-only, matching the user's own framing of this as "the shared
calendar *between coach and client*," not a coach-wide view of every
client's workouts at once. Reuses `getClientTimezone`/`localDateKey`
(exported from `lib/queries.ts`, built for the earlier steps/sleep
timezone-accuracy phase) rather than naively slicing the UTC ISO range
strings `rangeForView` produces -- slicing would be off by a day for any
client east of UTC, the same class of bug that phase fixed for health
data, now avoided here from the start.

**Web rendering (`components/calendar/CalendarViews.tsx`).** Generalized
from `CalendarEventRow` to the new `CalendarItem` -- `AgendaList`/
`DayList`/`WeekGrid`/`MonthGrid` all take the merged type now, with a
kind-tinted pill (reusing this app's existing semantic/series color
tokens) and a ✓ for a completed item. `CalendarCard`/`CalendarWorkspace`
(and all four pages that render them) updated to fetch and pass the
merged items; existing Google sync/booking-link behavior on those
components is untouched.

**Drag-and-drop (`@dnd-kit/core`).** No drag-and-drop library existed in
this app; added `@dnd-kit/core`+`@dnd-kit/utilities` (confirmed via
`npm audit` that neither introduces any new vulnerability -- the
9 flagged are pre-existing, in Next.js/ESLint/PostCSS/Zod, unrelated to
this change). `WeekGrid`/`MonthGrid` take an optional `onReschedule`
prop -- day cells become drop targets, items become drag sources (a
check-in occurrence never does, since it has no row of its own to move).
Dropping a workout/document calls `reschedule_assignment`; dropping a
call shifts its existing start/end instants by the day delta (preserving
time-of-day and duration) through the existing `updateEvent`, so a
drag-and-drop of a call doesn't lose anything a manual edit wouldn't.
An optimistic local update applies immediately and rolls back with an
inline error if the mutation fails.

Verified: `tsc --noEmit`, `next lint`, dummy-env `next build` (34/34
pages) all clean. The RPCs underneath are the part with real functional
verification (above); the drag interaction itself, and the UI/UX feel
of dropping an item on a day, haven't been exercised in a browser in
this environment.
