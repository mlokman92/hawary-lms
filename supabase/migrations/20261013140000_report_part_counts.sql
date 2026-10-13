-- The queue's numbers, by part of the LPKC and by stage. The page filters on
-- both at once, so a tile has to count within the part that is picked and a
-- part has to count within the tile that is pressed: one grid answers both.
-- SECURITY INVOKER like report_stage_counts, so RLS narrows a trainer to the
-- reports assigned to them. report_stage_counts stays for the sidebar and the
-- mobile app.
create function public.report_part_counts(_academy_id uuid)
returns table (part public.lpkc_stage, stage text, n bigint)
language sql
stable
set search_path to ''
as $$
  select r.lpkc_stage, public.report_stage(r), count(*)
  from public.report_submissions r
  where r.academy_id = _academy_id
  group by 1, 2;
$$;

revoke all on function public.report_part_counts(uuid) from public, anon;
grant execute on function public.report_part_counts(uuid) to authenticated;
