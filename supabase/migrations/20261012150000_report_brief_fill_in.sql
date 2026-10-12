-- ============================================================================
-- A student fills in the fields their report is missing
-- ----------------------------------------------------------------------------
-- Reports sent before the introduction, objectives and problem statement were
-- asked for hold them as null (20261012110000_report_brief.sql). Making a
-- student send a whole new version, with documents, just to type three
-- paragraphs would be the wrong price, so this lets them add the missing ones
-- to the thread directly.
--
--   * Only the student whose report it is.
--   * Only a field that is still empty — a filled one is changed by sending a
--     new version, the same as before. So this can never overwrite wording a
--     checker has already read.
--   * Any status. It fills a blank and touches nothing about the review, so an
--     approved report that predates the fields can be completed too.
--   * No timeline entry, no notification, no status move: it is not a reply.
--     The checker sees the text next time they open the report.
-- ============================================================================
create or replace function public.set_report_brief(
  _report_id         uuid,
  _introduction      text default null,
  _objectives        text default null,
  _problem_statement text default null
) returns json
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_report  public.report_submissions;
  v_intro   text := nullif(btrim(_introduction), '');
  v_obj     text := nullif(btrim(_objectives), '');
  v_problem text := nullif(btrim(_problem_statement), '');
  v_new_i   text;
  v_new_o   text;
  v_new_p   text;
begin
  if v_uid is null then raise exception 'You must be signed in'; end if;

  select * into v_report from public.report_submissions where id = _report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;

  -- Only the student it belongs to. Anyone else gets the same answer as for an
  -- id that does not exist.
  if app.report_role(v_report) is distinct from 'student' then
    raise exception 'Report not found';
  end if;

  v_new_i := case when coalesce(btrim(v_report.introduction), '') = ''
                  then v_intro end;
  v_new_o := case when coalesce(btrim(v_report.objectives), '') = ''
                  then v_obj end;
  v_new_p := case when coalesce(btrim(v_report.problem_statement), '') = ''
                  then v_problem end;

  if v_new_i is null and v_new_o is null and v_new_p is null then
    raise exception 'Write something first';
  end if;

  update public.report_submissions
     set introduction      = coalesce(v_new_i, introduction),
         objectives        = coalesce(v_new_o, objectives),
         problem_statement = coalesce(v_new_p, problem_statement)
   where id = _report_id;

  return json_build_object('id', _report_id);
end;
$$;

revoke all on function public.set_report_brief(uuid, text, text, text)
  from public, anon;
grant execute on function public.set_report_brief(uuid, text, text, text)
  to authenticated;
