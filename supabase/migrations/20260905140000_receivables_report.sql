-- Receivables: who has paid, and who still owes.
--
-- The payment report added last week answers "where did the money come from" —
-- it aggregates `payments`, so every figure on it is cash that arrived. That
-- book cannot answer "who has *not* paid", because a student who owes RM800 has
-- no payment row to aggregate. Absence is invisible in a cash ledger.
--
-- So the report gains a second view over the same drill (month → course →
-- student), reading `invoices` instead: **billed · paid · outstanding** per
-- rung, debtors first. Same scope vocabulary as the payments side
-- (`_from`/`_to`/`_course`/`_no_course`/`_student`), so the two views are the
-- same question asked of two books and the breadcrumb means the same thing in
-- both.
--
-- Months here bucket on `coalesce(issued_at, created_at)` — when the money was
-- *asked for* — where the payments view buckets on when it arrived. That is the
-- actual difference between the two books and why they are not one query: a
-- September payment against an August invoice belongs in August on one and
-- September on the other, and a row that claimed both would be wrong twice.

-- ---------------------------------------------------------------------------
-- 1. `balance_sen`, so a balance is a column and not a comparison.
--
--    `total_sen - amount_paid_sen` is a column-to-column expression, which
--    PostgREST cannot filter on at all — and "show me the invoices with
--    something still owing" is exactly what the /payments stat tiles now do
--    when you press them. Generated and stored rather than a view, so the
--    existing paged PostgREST read keeps working with one added `.gt()`.
--
--    Clamped at zero for the same reason `invoice_totals` clamps: an
--    overpayment is not a negative debt, and letting it go negative would let
--    one student's credit erase another's arrears in any sum over the column.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists balance_sen int
  generated always as (greatest(0, total_sen - amount_paid_sen)) stored;

comment on column public.invoices.balance_sen
  is 'Outstanding amount, clamped at zero. Generated — never write it.';

-- No index: the list still orders by (academy_id, created_at desc, id desc),
-- which `invoices_academy_created_at_idx` covers, and this is a predicate
-- applied to rows that index already ordered. Revisit if an academy's invoice
-- count reaches the tens of thousands.

-- ---------------------------------------------------------------------------
-- 2. `invoice_totals` learns the report's remaining scope arguments.
--
--    It already took `_course`/`_no_course` for the /payments tiles. Adding
--    `_from`/`_to`/`_student` makes it the summary line for every rung of the
--    receivables drill too — the same trick the payments view plays with
--    `payment_log_totals`, and for the same reason: one source for the number,
--    so a rung's rows and the total above them cannot disagree.
--
--    Argument list changes, so drop-and-create: `create or replace` with a new
--    signature leaves the old function behind as an overload and PostgREST's
--    named-argument call then resolves to neither.
-- ---------------------------------------------------------------------------
drop function if exists public.invoice_totals(uuid, uuid, boolean);
drop function if exists public.invoice_totals(uuid, uuid, boolean, date, date, uuid);

create or replace function public.invoice_totals(
  _academy uuid,
  _course uuid default null,
  _no_course boolean default false,
  -- Academy-local calendar days on the invoice's issue date, both inclusive.
  _from date default null,
  _to date default null,
  _student uuid default null
)
returns table (
  invoice_count bigint,
  invoiced_sen bigint,
  collected_sen bigint,
  outstanding_sen bigint,
  overdue_sen bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with zone as (
    select coalesce(
      (select a.timezone from public.academies a where a.id = _academy),
      'Asia/Kuala_Lumpur'
    ) as tz
  )
  select
    -- How many invoices the sums were taken over. The receivables leaf pages
    -- through exactly this set, and a pager needs a count, not a sum.
    count(*),
    coalesce(sum(i.total_sen), 0),
    -- The raw sum, not clamped: an overpayment was collected, because it was.
    coalesce(sum(i.amount_paid_sen), 0),
    coalesce(sum(i.balance_sen), 0),
    coalesce(sum(
      case
        when i.balance_sen > 0
         and (i.status = 'overdue' or (i.due_at is not null and i.due_at < now()))
        then i.balance_sen
        else 0
      end
    ), 0)
  from public.invoices i
  cross join zone z
  where i.academy_id = _academy
    -- Not real receivables; they must stay out of every money total.
    and i.status not in ('void', 'cancelled', 'draft')
    and case
          when _no_course then i.course_id is null
          when _course is not null then i.course_id = _course
          else true
        end
    and (_from is null or (coalesce(i.issued_at, i.created_at) at time zone z.tz)::date >= _from)
    and (_to is null or (coalesce(i.issued_at, i.created_at) at time zone z.tz)::date <= _to)
    and (_student is null or i.student_id = _student);
$$;

comment on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid)
  is 'Invoiced/collected/outstanding/overdue for an academy, optionally narrowed to one course (_course) or to invoices with none (_no_course), an issue-date window, or one student.';

revoke all on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) from public, anon;
grant execute on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One rung of the receivables drill.
--
--    The mirror of `payment_report`, over invoices. Sorted **outstanding
--    first**, not by size of the bill: the question this view exists to answer
--    is who still owes, so the answer belongs at the top of the table rather
--    than somewhere down it. Months still descend — a report is read backwards
--    from now — and the amount ranking breaks ties within a month.
--
--    `paid_sen` is the invoice's own `amount_paid_sen`, not a sum of
--    `payments`: an invoice settled by three instalments is one debt cleared,
--    and joining payments here would multiply the billed figure by the number
--    of times somebody paid towards it.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_report(
  _academy uuid,
  _dim text default 'month',
  _from date default null,
  _to date default null,
  _course uuid default null,
  _no_course boolean default false,
  _student uuid default null
)
returns table (
  key text,
  label text,
  sublabel text,
  invoice_count bigint,
  billed_sen bigint,
  paid_sen bigint,
  outstanding_sen bigint,
  group_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with zone as (
    select coalesce(
      (select a.timezone from public.academies a where a.id = _academy),
      'Asia/Kuala_Lumpur'
    ) as tz
  ),
  scoped as (
    select
      i.total_sen,
      i.amount_paid_sen,
      i.balance_sen,
      i.course_id,
      c.title as course_title,
      i.student_id,
      s.full_name as student_full_name,
      s.student_no,
      to_char(coalesce(i.issued_at, i.created_at) at time zone z.tz, 'YYYY-MM') as ym
    from public.invoices i
    cross join zone z
    left join public.courses c on c.id = i.course_id
    left join public.students s on s.id = i.student_id
    where i.academy_id = _academy
      and i.status not in ('void', 'cancelled', 'draft')
      and (_from is null or (coalesce(i.issued_at, i.created_at) at time zone z.tz)::date >= _from)
      and (_to is null or (coalesce(i.issued_at, i.created_at) at time zone z.tz)::date <= _to)
      and case
            when coalesce(_no_course, false) then i.course_id is null
            when _course is not null then i.course_id = _course
            else true
          end
      and (_student is null or i.student_id = _student)
  ),
  grouped as (
    select
      r.ym as key,
      r.ym as label,
      null::text as sublabel,
      count(*)::bigint as invoice_count,
      sum(r.total_sen)::bigint as billed_sen,
      sum(r.amount_paid_sen)::bigint as paid_sen,
      sum(r.balance_sen)::bigint as outstanding_sen,
      r.ym as month_key
    from scoped r
    where _dim = 'month'
    group by r.ym

    union all

    select
      coalesce(r.course_id::text, '__none__'),
      coalesce(max(r.course_title), ''),
      null::text,
      count(*)::bigint,
      sum(r.total_sen)::bigint,
      sum(r.amount_paid_sen)::bigint,
      sum(r.balance_sen)::bigint,
      null::text
    from scoped r
    where _dim = 'course'
    group by r.course_id

    union all

    select
      coalesce(r.student_id::text, '__none__'),
      coalesce(max(r.student_full_name), ''),
      max(r.student_no),
      count(*)::bigint,
      sum(r.total_sen)::bigint,
      sum(r.amount_paid_sen)::bigint,
      sum(r.balance_sen)::bigint,
      null::text
    from scoped r
    where _dim = 'student'
    group by r.student_id
  )
  select
    g.key,
    g.label,
    g.sublabel,
    g.invoice_count,
    g.billed_sen,
    g.paid_sen,
    g.outstanding_sen,
    count(*) over ()
  from grouped g
  order by
    g.month_key desc nulls last,
    g.outstanding_sen desc,
    g.billed_sen desc,
    g.label,
    g.key
  limit 500;
$$;

comment on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid)
  is 'One rung of the receivables drill: billed/paid/outstanding for invoices in the given scope, grouped by _dim (month | course | student), debtors first. Months bucket on issued_at, unlike payment_report which buckets on paid_at.';

revoke all on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The bottom of that drill: the invoices themselves.
--
--    An RPC rather than the existing PostgREST read because the window is an
--    academy-local calendar day on `coalesce(issued_at, created_at)`, which
--    PostgREST cannot express — and sending it a pre-computed instant would put
--    the timezone rule in the browser, where the two views would drift apart.
--
--    Ordered oldest-unpaid-first: this list is read to chase money, and the
--    debt that has been outstanding longest is the one to chase. `id` is the
--    final tie-break because OFFSET paging over a non-unique sort repeats one
--    row and skips another.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_report_page(
  _academy uuid,
  _from date default null,
  _to date default null,
  _course uuid default null,
  _no_course boolean default false,
  _student uuid default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  id uuid,
  invoice_no text,
  status public.invoice_status,
  issued_at timestamptz,
  due_at timestamptz,
  total_sen int,
  amount_paid_sen int,
  balance_sen int,
  student_id uuid,
  student_full_name text,
  student_no text,
  course_id uuid,
  course_title text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with zone as (
    select coalesce(
      (select a.timezone from public.academies a where a.id = _academy),
      'Asia/Kuala_Lumpur'
    ) as tz
  )
  select
    i.id,
    i.invoice_no,
    i.status,
    i.issued_at,
    i.due_at,
    i.total_sen,
    i.amount_paid_sen,
    i.balance_sen,
    i.student_id,
    s.full_name,
    s.student_no,
    i.course_id,
    c.title
  from public.invoices i
  cross join zone z
  left join public.students s on s.id = i.student_id
  left join public.courses c on c.id = i.course_id
  where i.academy_id = _academy
    and i.status not in ('void', 'cancelled', 'draft')
    and (_from is null or (coalesce(i.issued_at, i.created_at) at time zone z.tz)::date >= _from)
    and (_to is null or (coalesce(i.issued_at, i.created_at) at time zone z.tz)::date <= _to)
    and case
          when coalesce(_no_course, false) then i.course_id is null
          when _course is not null then i.course_id = _course
          else true
        end
    and (_student is null or i.student_id = _student)
  order by
    -- Still owing before settled, then longest overdue, then newest billed.
    (i.balance_sen > 0) desc,
    i.due_at asc nulls last,
    coalesce(i.issued_at, i.created_at) desc,
    i.id desc
  -- Clamp rather than trust: these reach us from a query string.
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int)
  is 'One page of invoices at the bottom of the receivables drill. Scope arguments match invoice_report and invoice_totals; unpaid first, longest overdue first.';

revoke all on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int) from public, anon;
grant execute on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int) to authenticated;
