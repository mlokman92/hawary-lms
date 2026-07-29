-- ============================================================================
-- 0022 · Per-course active student count, for the course cards.
--
-- "Active enrolled students" = enrollments with status 'active' whose student
-- record is not archived. The second half matters: archiving a student only
-- sets students.archived_at and leaves their enrollment rows alone, so a raw
-- count of active enrollments would include people the Students page has
-- already hidden, and the two screens would disagree.
--
-- Student *status* (active / trial / inactive / withdrawn) is deliberately NOT
-- part of the filter — a trial student holding an active enrolment is still an
-- enrolled student. The enrollment's own status is the gate.
--
-- security_invoker: the view runs as the CALLER, so RLS on enrollments and
-- students still applies and one academy can never read another's counts.
-- Without it a view runs as its owner (postgres) and would bypass RLS entirely.
--
-- Courses with no active students simply have no row here; the client treats a
-- missing course_id as 0.
-- ============================================================================

create view public.course_enrollment_stats
with (security_invoker = true) as
select
  e.academy_id,
  e.course_id,
  count(*)::int as active_students
from public.enrollments e
join public.students s
  on s.academy_id = e.academy_id
 and s.id         = e.student_id
where e.status = 'active'
  and s.archived_at is null
group by e.academy_id, e.course_id;

revoke all on public.course_enrollment_stats from anon;
grant select on public.course_enrollment_stats to authenticated;
