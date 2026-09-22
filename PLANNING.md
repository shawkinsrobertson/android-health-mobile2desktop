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
- **Vitals** (extends HR/SpO2/BP/resp-rate): `BloodGlucoseRecord`,
  `BodyTemperatureRecord`.
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

## Standing product decisions

- **One coach per client** (a `coach_id` column on `client_profiles`, not a
  join table). Simplest schema for now; revisit only if multi-coach
  support becomes a real requirement -- it's a bigger migration than adding
  a join table cold, since every "coach's clients" query today assumes the
  single-FK model.
- **Magic link (email OTP)** is the only auth method. No passwords.
