-- The KWSP subtotal has to be computed once, not once per invoice.
--
-- `20261010120000_kwsp_separate.sql` joined each invoice to a CTE that sums
-- its KWSP payments. Postgres inlines a CTE that is referenced once, and under
-- row-level security it then chose to re-run that sum for every invoice: each
-- pass re-checks `app.is_admin` / `app.owns_student` on every payment row, so
-- ~800 invoices x ~2,500 payments is two million policy calls and the request
-- died on the 8-second statement timeout. As the table owner there is no
-- policy to evaluate and the same query returns at once — which is why it
-- passed when it was checked as `postgres` and failed for every signed-in
-- user.
--
-- `materialized` pins the sum to a single pass (44 ms as a signed-in admin).
-- The functions are otherwise unchanged, and so are their signatures and row
-- types, so this is `create or replace` and grants carry over.
--
-- Rule for this codebase: a function that reads RLS-protected tables is
-- verified **as a signed-in user**, never only as the owner.

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
  overdue_sen bigint,
  kwsp_sen bigint
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
  kwsp as materialized (
    select p.invoice_id, sum(p.amount_sen)::bigint as kwsp_sen
    from public.payments p
    where p.academy_id = _academy
      and p.status = 'succeeded'
      and p.method = 'kwsp'
    group by p.invoice_id
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
    ), 0),
    -- Part of `collected_sen`, never in addition to it.
    coalesce(sum(k.kwsp_sen), 0)
  from public.invoices i
  cross join zone z
  left join kwsp k on k.invoice_id = i.id
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
  kwsp_sen bigint,
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
  kwsp as materialized (
    select p.invoice_id, sum(p.amount_sen)::bigint as kwsp_sen
    from public.payments p
    where p.academy_id = _academy
      and p.status = 'succeeded'
      and p.method = 'kwsp'
    group by p.invoice_id
  ),
  scoped as (
    select
      i.total_sen,
      i.amount_paid_sen,
      coalesce(k.kwsp_sen, 0) as kwsp_sen,
      i.balance_sen,
      i.course_id,
      c.title as course_title,
      i.student_id,
      s.full_name as student_full_name,
      s.student_no,
      to_char(coalesce(i.issued_at, i.created_at) at time zone z.tz, 'YYYY-MM') as ym
    from public.invoices i
    cross join zone z
    left join kwsp k on k.invoice_id = i.id
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
      sum(r.kwsp_sen)::bigint as kwsp_sen,
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
      sum(r.kwsp_sen)::bigint,
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
      sum(r.kwsp_sen)::bigint,
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
    g.kwsp_sen,
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
  kwsp_sen bigint,
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
  ),
  kwsp as materialized (
    select p.invoice_id, sum(p.amount_sen)::bigint as kwsp_sen
    from public.payments p
    where p.academy_id = _academy
      and p.status = 'succeeded'
      and p.method = 'kwsp'
    group by p.invoice_id
  )
  select
    i.id,
    i.invoice_no,
    i.status,
    i.issued_at,
    i.due_at,
    i.total_sen,
    i.amount_paid_sen,
    coalesce(k.kwsp_sen, 0),
    i.balance_sen,
    i.student_id,
    s.full_name,
    s.student_no,
    i.course_id,
    c.title
  from public.invoices i
  cross join zone z
  left join kwsp k on k.invoice_id = i.id
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
