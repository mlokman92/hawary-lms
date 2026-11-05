-- /lpkc filters by course as well as by part and status. Its cards count
-- within the course that is picked, and its course select offers only the
-- courses this reader has reports in. Both come from the same rows:
-- report_part_counts, split by course as well, with the title so that no
-- second read is needed to fill the select.
--
-- SECURITY INVOKER like report_part_counts: RLS on report_submissions is what
-- limits a trainer to their own desk, so these counts cannot disagree with the
-- list under them.
--
-- report_part_counts(uuid) stays for now. Builds already deployed still call
-- it; drop it once the build that uses this function has been deployed.
create function public.report_course_part_counts(_academy_id uuid)
returns table (
  course_id uuid,
  course_title text,
  part public.lpkc_stage,
  stage text,
  n bigint
)
language sql
stable
set search_path to ''
as $$
  select r.course_id, c.title, r.lpkc_stage, public.report_stage(r), count(*)
  from public.report_submissions r
  join public.courses c on c.id = r.course_id
  where r.academy_id = _academy_id
  group by 1, 2, 3, 4;
$$;
revoke all on function public.report_course_part_counts(uuid) from public, anon;
grant execute on function public.report_course_part_counts(uuid) to authenticated;
