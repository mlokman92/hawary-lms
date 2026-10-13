-- The order the queue is read in: moderating, pending trainer approval, changes
-- needed, approved. A computed column, so PostgREST can sort and page on it —
-- the stage's own text sorts alphabetically, which is not this order.
-- It asks public.report_stage, so it knows nothing that function would not say:
-- a row the caller cannot read ranks last, with nothing learned from it.
create function public.report_stage_rank(_r public.report_submissions)
returns integer
language sql
stable
set search_path to ''
as $$
  select case public.report_stage(_r)
    when 'moderating'        then 1
    when 'pending_approval'  then 2
    when 'changes_requested' then 3
    when 'approved'          then 4
    else 5
  end;
$$;

revoke all on function public.report_stage_rank(public.report_submissions) from public, anon;
grant execute on function public.report_stage_rank(public.report_submissions) to authenticated;
