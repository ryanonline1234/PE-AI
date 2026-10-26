-- Teacher key: a per-class secret, separate from the class code students see.
-- Students know the class code by design, so the code alone cannot gate edits.
-- The key is generated server-side on first save, shown to the teacher once,
-- and only its SHA-256 hex digest is stored.
--
-- Rows created before this migration have a NULL hash; the first keyed save
-- claims them (see app/api/save-class/route.ts).

alter table pe_classes add column if not exists teacher_key_hash text;
