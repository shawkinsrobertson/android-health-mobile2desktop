-- Visibility Scope, pass 1: the one concrete schema bug in the three
-- existing visibility mechanisms (see PLANNING.md's Phase 14 section for
-- the full writeup). client_data_consent's own migration comment
-- (0014_client_data_consent.sql) said the point of "one row per (client,
-- data type)" was that adding a new data type later is a new row shape,
-- not a schema change -- but the data_type CHECK constraint it shipped
-- with contradicted that from day one, and 0024_blood_glucose.sql had to
-- prove it by dropping and recreating the constraint just to add one
-- value.
--
-- This drops that constraint for good. data_type becomes plain
-- `not null` text, validated only by the small fixed set of keys
-- lib/assistant.ts's fetch*ForAssistant functions actually look up (see
-- isConsented there) -- the same posture every other "type" discriminator
-- in this schema that's meant to grow without a migration already uses
-- (e.g. ai_assistant_proposals.type is a CHECK today because its three
-- values are genuinely closed; data_type is not that kind of field).
alter table public.client_data_consent
  drop constraint if exists client_data_consent_data_type_check;
