# Health Sync

Syncs Android Health Connect data to a Supabase Postgres database, with a
Next.js dashboard on top for viewing trends and (eventually) chatting with
an AI training coach grounded in that data.

```
┌─────────────────┐   Health Connect API   ┌──────────────┐
│  Android device  │ ─────────────────────▶ │ Health Sync  │
│ (Health Connect) │                         │  Android app │
└─────────────────┘                         └──────┬───────┘
                                                     │ PostgREST (anon key)
                                                     ▼
                                            ┌──────────────────┐
                                            │  Supabase Postgres │
                                            └────────┬──────────┘
                                                     │ read-only
                                                     ▼
                                            ┌──────────────────┐
                                            │ Next.js dashboard │
                                            │  (charts + coach) │
                                            └──────────────────┘
```

- **`android/`** — Kotlin/Jetpack Compose app. Reads Steps, Heart Rate,
  Sleep, Exercise sessions, and vitals (SpO2, blood pressure, respiratory
  rate) from Health Connect and upserts them into Supabase. Runs a
  background sync roughly every 15 minutes via WorkManager, plus a manual
  "Sync now" button.
- **`supabase/`** — SQL migration for the Postgres schema those tables
  live in.
- **`dashboard/`** — Next.js app that reads the same Supabase project:
  an overview page with charts, and a `/coach` chat shell ready for you to
  wire an LLM into.

## 1. Set up Supabase

1. In your Supabase project, open **SQL Editor** and run
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   (or apply it with the Supabase CLI: `supabase db push` /
   `psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql`). This creates
   the `steps`, `heart_rate_samples`, `sleep_sessions`, `sleep_stages`,
   `exercise_sessions`, `blood_oxygen`, `blood_pressure`, and
   `respiratory_rate` tables, all with RLS enabled and a permissive policy
   for the `anon` role (see the comment at the top of that file for why —
   short version: this is a single-user personal project, so the anon key
   itself is the thing you keep private).
2. Grab **Project Settings → API → Project URL** and the **`anon` `public`
   key**. You'll paste both into the Android app and the dashboard below.
   Do not use the `service_role` key anywhere in this project — it bypasses
   RLS entirely and should never leave the Supabase dashboard.

## 2. Set up the Android app

Requires Android Studio (Koala or newer) and a device or emulator running
Android 9+ with the Health Connect app installed (built-in on Android 14+;
installable from Play Store on 9–13).

1. Open the `android/` folder as a project in Android Studio.
2. Copy `android/local.properties.example` to `android/local.properties`
   and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` from step 1.
   `local.properties` is gitignored — this never gets committed.
3. Build & run. On first launch:
   - If Health Connect isn't installed, the app prompts you to install it.
   - Tap **Grant permissions** and allow read access to the requested data
     types.
   - Tap **Sync now** for an initial sync, or just wait — background sync
     kicks in automatically.
4. Each data type backfills a bounded window of history on its first sync
   (e.g. 30 days of steps, 90 days of exercise sessions — see
   `initialBackfillDays` in
   [`SyncSpec.kt`](android/app/src/main/java/com/healthsync/app/healthconnect/SyncSpec.kt)
   if you want more). After that, sync is incremental via Health Connect's
   changes API, so it only pushes what actually changed.

**Keeping the anon key private matters here**: because RLS is wide open
for the `anon` role, anyone with that key can read/write your tables. Don't
publish this app, don't put the key in a public repo, and don't reuse this
setup for anything beyond your own device.

## 3. Set up the dashboard

Requires Node 18+.

```sh
cd dashboard
npm install
cp .env.local.example .env.local   # fill in SUPABASE_URL / SUPABASE_ANON_KEY
npm run dev                        # http://localhost:3000
```

- **Overview** (`/`) — stat tiles plus steps/sleep charts, reading straight
  from Supabase via server components (`lib/queries.ts`).
- **Coach** (`/coach`) — a chat UI shell. `app/api/chat/route.ts` currently
  just echoes back a placeholder reply; the comment at the top of that file
  walks through wiring in a real model (pull recent data via
  `lib/queries.ts`, fold it into the prompt, call the LLM). That's the
  natural next step once you're ready for the "assistant coach" piece.

## Health Connect code reference

A few columns store Health Connect's raw integer codes rather than
resolved strings, to avoid the Android app depending on exact enum names
that have shifted across Health Connect SDK versions. Reference when
querying directly or building dashboard features around them:

- `sleep_stages.stage_type_code` — `SleepSessionRecord.Stage` stage
  constants (awake, light, deep, REM, etc.) — see
  [`androidx.health.connect.client.records.SleepSessionRecord`](https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/SleepSessionRecord).
- `exercise_sessions.exercise_type_code` — `ExerciseSessionRecord.exerciseType`
  constants (running, cycling, strength training, etc.) — see
  [`ExerciseSessionRecord`](https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/ExerciseSessionRecord).
- `blood_pressure.body_position_code` / `measurement_location_code` — see
  [`BloodPressureRecord`](https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/BloodPressureRecord).

## Known gaps / natural next steps

- **Weight / body composition** wasn't in scope for this pass — the schema
  and `SyncSpec` pattern in the Android app make it straightforward to add
  a `WeightRecord` spec + `weight` table the same way the others are built.
- **Exercise sessions** currently store type/title/timing only — calories
  and distance live in separate Health Connect record types
  (`TotalCaloriesBurnedRecord`, `DistanceRecord`) that aren't correlated to
  a specific session yet.
- **The AI coach** is a UI shell only — see `dashboard/app/api/chat/route.ts`.
- Pinned to the **stable** `androidx.health.connect:connect-client:1.1.0`
  release (not a pre-release alpha). `HealthConnectClient.getChanges()` is
  a plain suspend function returning a single `ChangesResponse` page —
  `SyncRepository.drainChanges()` loops on `hasMore`/`nextChangesToken`
  itself and treats `changesTokenExpired` as the signal to fall back to a
  fresh backfill. (There's no `ChangesMessage`/`Flow` wrapper in the
  library itself — that pattern shows up in Google's sample app, but it's
  app-level code the sample defines for itself, not part of the SDK.)
