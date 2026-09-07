-- Course billing: who on this course has paid, who has not finished paying,
-- and who has never been billed at all.
--
-- The report section already reads two books. `payment_report` aggregates
-- **payments** — where money came from — and cannot say who has *not* paid,
-- because a student who owes RM800 has no payment row. `invoice_report` fixed
-- that by reading **invoices** instead, so an absence of payment became
-- visible.
--
-- This is the same gap one level up, and the invoice book has it: an invoice
-- book cannot say who has never been **invoiced**. A student enrolled on a
-- course with no invoice against them has no row in `invoices` either, so they
-- are invisible to every money screen in the app. On this database that is not
-- a corner case — 112 of 666 live enrolments have no invoice, and one whole
-- intake of 94 has never been billed at all.
--
-- The only table that knows a student is on a course before any money is asked
-- for is `enrollments`. So both functions are driven from the roster and LEFT
-- JOIN the invoices onto it, which is what turns "never billed" from a missing
-- row into a row you can read.
--
-- ---------------------------------------------------------------------------
-- Four decisions worth writing down
--
-- 1. **The invoice ↔ course link is `(student_id, course_id)`, not
--    `enrollment_id`.** `invoices.enrollment_id` exists and is NULL on every
--    row in this database — invoices are raised per student and stamped with a
--    course, never with an enrolment. Joining on `enrollment_id` would report
--    every student as unbilled, which is the exact failure this exists to fix.
--
-- 2. **No date window.** Every other report function takes `_from`/`_to`.
--    These deliberately do not: the students being looked for are the ones with
--    no invoice, an absence has no date, and any window would filter out
--    precisely the answer. "Not yet billed" is a state, not a period.
--
-- 3. **Which enrolments count: `active` and `completed`.** `pending` is a
--    request staff have not accepted yet, and prompting an admin to bill
--    somebody they have not admitted would be wrong. `dropped` and `cancelled`
--    are off the course; anything they still owe stays visible on the
--    receivables view, which reads invoices and so does not depend on the
--    roster at all. Archived students are NOT excluded — a debt does not stop
--    existing when a record is filed away, and a debt report that hides
--    debtors is worse than no report.
--
-- 4. **Admin-only, as a predicate rather than an error.** SECURITY INVOKER
--    like every other report function, so RLS scopes the caller — but with
--    `app.is_admin` in the WHERE clause, which the others neither have nor
--    need. `docs/money-is-admin-only.md` moved the `invoices` SELECT policy to
--    `app.is_admin` while `enrollments` and `students` stayed staff-readable,
--    so a trainer reading this join would get the whole roster with **zero**
--    invoices attached and every student on the course reported as "never
--    invoiced". That is not an empty answer, it is a false one. The predicate
--    makes it empty instead, which is what a trainer is allowed to see and
--    what the rest of the section already returns them.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The roll-up: one row per course.
--
--    Also the totals line for the roster below it, when called with `_course`.
--    One function rather than two, for the reason the report section keeps
--    repeating: rows are a page and totals are an aggregate, and a second copy
--    of this join would be free to drift from the first — drift that shows up
--    as a course claiming 9 unbilled students over a list containing 11.
-- ---------------------------------------------------------------------------
create or replace function public.course_billing_summary(
  _academy uuid,
  _course uuid default null
)
returns table (
  course_id uuid,
  course_title text,
  course_code text,
  course_status public.course_status,
  student_count bigint,
  uninvoiced_count bigint,
  unpaid_count bigint,
  partial_count bigint,
  paid_count bigint,
  billed_sen bigint,
  paid_sen bigint,
  outstanding_sen bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with billed as (
    -- Every live invoice, rolled up per (student, course) once. Done before
    -- the join to the roster so that a student enrolled twice on one course
    -- cannot make their invoice count towards it twice.
    select
      i.student_id,
      i.course_id,
      count(*)::bigint as invoice_count,
      sum(i.total_sen)::bigint as billed_sen,
      sum(i.amount_paid_sen)::bigint as paid_sen,
      sum(i.balance_sen)::bigint as outstanding_sen
    from public.invoices i
    where i.academy_id = _academy
      -- The same exclusion every money total in the app makes: these are not
      -- real receivables and must not appear in one.
      and i.status not in ('void', 'cancelled', 'draft')
      and i.course_id is not null
    group by i.student_id, i.course_id
  ),
  roster as (
    select distinct on (e.course_id, e.student_id)
      e.course_id,
      e.student_id,
      coalesce(b.invoice_count, 0) as invoice_count,
      coalesce(b.billed_sen, 0) as billed_sen,
      coalesce(b.paid_sen, 0) as paid_sen,
      coalesce(b.outstanding_sen, 0) as outstanding_sen
    from public.enrollments e
    left join billed b
      on b.student_id = e.student_id and b.course_id = e.course_id
    where e.academy_id = _academy
      and app.is_admin(_academy)
      and e.status in ('active', 'completed')
      and (_course is null or e.course_id = _course)
    -- One row per person per course even where the enrolment was recorded
    -- more than once.
    order by e.course_id, e.student_id, e.enrolled_at desc
  )
  select
    c.id,
    c.title,
    c.code,
    c.status,
    count(*)::bigint,
    count(*) filter (where r.invoice_count = 0)::bigint,
    count(*) filter (where r.invoice_count > 0 and r.paid_sen = 0)::bigint,
    count(*) filter (where r.paid_sen > 0 and r.outstanding_sen > 0)::bigint,
    count(*) filter (where r.invoice_count > 0 and r.outstanding_sen = 0)::bigint,
    sum(r.billed_sen)::bigint,
    sum(r.paid_sen)::bigint,
    sum(r.outstanding_sen)::bigint
  from roster r
  join public.courses c on c.id = r.course_id
  group by c.id, c.title, c.code, c.status
  -- Unbilled first: it is the question this function exists to answer, and a
  -- course nobody has invoiced is the one an admin needs to see today.
  order by
    count(*) filter (where r.invoice_count = 0) desc,
    sum(r.outstanding_sen) desc,
    c.title,
    c.id
  limit 500;
$$;

comment on function public.course_billing_summary(uuid, uuid)
  is 'Per-course billing roll-up over live enrolments: how many students are unbilled, unpaid, part paid or settled, and the money behind each. Pass _course for one course, which is also the totals line for course_billing_roster. Admin-only.';

revoke all on function public.course_billing_summary(uuid, uuid) from public, anon;
grant execute on function public.course_billing_summary(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The roster: one row per enrolled student on one course.
--
--    Paged, because an intake here already runs to 289 students. Ordered by
--    what needs doing rather than by size of debt: never invoiced, then billed
--    and nothing paid, then part paid, then settled. Ordering by outstanding
--    alone would sink the never-invoiced to the bottom of the list — their
--    balance is zero precisely because nobody has asked them for anything yet.
-- ---------------------------------------------------------------------------
create or replace function public.course_billing_roster(
  _academy uuid,
  _course uuid,
  -- 'uninvoiced' | 'unpaid' | 'partial' | 'paid'. Null is everyone.
  _status text default null,
  _search text default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  student_id uuid,
  full_name text,
  student_no text,
  email text,
  phone text,
  enrollment_status public.enrollment_status,
  enrolled_at timestamptz,
  invoice_count bigint,
  billed_sen bigint,
  paid_sen bigint,
  outstanding_sen bigint,
  pay_status text,
  last_invoice_id uuid,
  last_invoice_no text,
  due_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with billed as (
    select
      i.student_id,
      count(*)::bigint as invoice_count,
      sum(i.total_sen)::bigint as billed_sen,
      sum(i.amount_paid_sen)::bigint as paid_sen,
      sum(i.balance_sen)::bigint as outstanding_sen,
      -- The invoice to open from the row: the one still owing and due soonest
      -- if there is one, else the latest. A row with a balance is opened to
      -- chase it; a settled row is opened to check it.
      (array_agg(i.id order by (i.balance_sen > 0) desc, i.due_at asc nulls last,
                 coalesce(i.issued_at, i.created_at) desc))[1] as last_invoice_id,
      (array_agg(i.invoice_no order by (i.balance_sen > 0) desc, i.due_at asc nulls last,
                 coalesce(i.issued_at, i.created_at) desc))[1] as last_invoice_no,
      (array_agg(i.due_at order by (i.balance_sen > 0) desc, i.due_at asc nulls last,
                 coalesce(i.issued_at, i.created_at) desc))[1] as due_at
    from public.invoices i
    where i.academy_id = _academy
      and i.course_id = _course
      and i.status not in ('void', 'cancelled', 'draft')
    group by i.student_id
  ),
  roster as (
    select distinct on (e.student_id)
      e.student_id,
      s.full_name,
      s.student_no,
      s.email,
      s.phone,
      e.status as enrollment_status,
      e.enrolled_at,
      coalesce(b.invoice_count, 0) as invoice_count,
      coalesce(b.billed_sen, 0) as billed_sen,
      coalesce(b.paid_sen, 0) as paid_sen,
      coalesce(b.outstanding_sen, 0) as outstanding_sen,
      case
        when coalesce(b.invoice_count, 0) = 0 then 'uninvoiced'
        when coalesce(b.outstanding_sen, 0) = 0 then 'paid'
        when coalesce(b.paid_sen, 0) > 0 then 'partial'
        else 'unpaid'
      end as pay_status,
      b.last_invoice_id,
      b.last_invoice_no,
      b.due_at
    from public.enrollments e
    join public.students s on s.id = e.student_id
    left join billed b on b.student_id = e.student_id
    where e.academy_id = _academy
      and app.is_admin(_academy)
      and e.course_id = _course
      and e.status in ('active', 'completed')
    order by e.student_id, e.enrolled_at desc
  ),
  filtered as (
    select r.*
    from roster r
    where (_status is null or r.pay_status = _status)
      and (
        _search is null or btrim(_search) = ''
        or r.full_name ilike '%' || btrim(_search) || '%'
        or r.student_no ilike '%' || btrim(_search) || '%'
        or r.email ilike '%' || btrim(_search) || '%'
      )
  )
  select
    f.student_id,
    f.full_name,
    f.student_no,
    f.email,
    f.phone,
    f.enrollment_status,
    f.enrolled_at,
    f.invoice_count,
    f.billed_sen,
    f.paid_sen,
    f.outstanding_sen,
    f.pay_status,
    f.last_invoice_id,
    f.last_invoice_no,
    f.due_at,
    -- The filtered count, for the pager. The unfiltered totals come from
    -- course_billing_summary, which is what the summary line reads.
    count(*) over () as total_count
  from filtered f
  order by
    -- Work first, money second.
    case f.pay_status
      when 'uninvoiced' then 0
      when 'unpaid' then 1
      when 'partial' then 2
      else 3
    end,
    f.outstanding_sen desc,
    f.full_name nulls last,
    -- OFFSET paging over a non-unique sort repeats one row and skips another.
    f.student_id
  limit greatest(1, least(coalesce(_limit, 50), 500))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.course_billing_roster(uuid, uuid, text, text, int, int)
  is 'One page of a course roster carrying each student''s billing state — uninvoiced | unpaid | partial | paid — with billed/paid/outstanding. Never-invoiced students come first: they appear in no other money screen. Admin-only.';

revoke all on function public.course_billing_roster(uuid, uuid, text, text, int, int) from public, anon;
grant execute on function public.course_billing_roster(uuid, uuid, text, text, int, int) to authenticated;
