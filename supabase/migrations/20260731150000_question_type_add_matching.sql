-- Adds the sixth question type.
--
-- Isolated in its own migration because Postgres will not let the same
-- transaction that adds an enum label go on to reference it. The scoring work
-- in 20260731150100 needs 'matching' to already exist.
alter type public.question_type add value if not exists 'matching';
