-- AI assistant Stage 5: draft documents (forms) from a text prompt. Same
-- shape and same reasoning as migration 0029 for library_workouts --
-- see that file's comment. Scoped to form-type documents only: a 'file'
-- document needs an actual uploaded file, which drafting from a text
-- prompt can't produce.

alter table public.library_documents
  add column if not exists status text not null default 'published' check (status in ('draft', 'published'));
