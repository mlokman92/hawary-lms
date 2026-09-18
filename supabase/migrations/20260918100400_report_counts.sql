-- The four numbers above the report queue.
--
-- Rows are a page, totals are an aggregate — the lesson `/payments` had to be
-- retrofitted with. A page of 50 cannot answer "how many are waiting on me",
-- and deriving the tiles from the page would quietly reinterpret the question.
--
-- SECURITY INVOKER, like invoice_totals and payment_log_totals: RLS already
-- scopes the caller to their own reports (admin all, own instructor, own
-- student), so definer rights would buy nothing but risk. A trainer who checks
-- nothing gets four zeros, which is true.
create or replace function public.report_counts(_academy_id uuid)
returns table (status public.report_status, n bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  select r.status, count(*)
  from public.report_submissions r
  where r.academy_id = _academy_id
  group by r.status;
$$;

revoke all on function public.report_counts(uuid) from public, anon;
grant execute on function public.report_counts(uuid) to authenticated;
