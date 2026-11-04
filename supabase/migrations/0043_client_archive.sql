-- Client management: archive/delete was entirely missing -- a coach had
-- no way to remove a client from their active roster at all. A hard
-- delete is the wrong default here: 25+ tables cascade off client_id
-- (sessions, chat, notes, assignments, metrics...), so one click would
-- permanently destroy a client's entire history. Soft-delete instead --
-- archived_at null means active (every existing row, unaffected); set it
-- to stop showing the client in the default roster without touching any
-- of their data, and it's trivially reversible (unarchive = clear it).

alter table public.client_profiles
  add column if not exists archived_at timestamptz;
