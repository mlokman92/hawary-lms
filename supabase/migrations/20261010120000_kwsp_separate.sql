-- KWSP as its own figure on the money screens.
--
-- An EPF Account 2 education withdrawal is money the academy did receive, but
-- it is not money a student paid: it arrives by its own route, on its own
-- timetable, with its own paperwork. Folded into "collected" it hides how much
-- the students themselves have paid, which is the number the owner reads the
-- screen for. So every aggregate that reports money in now reports the KWSP
-- part beside it, and the screens show the two apart.
--
-- Each function keeps its existing total and gains `kwsp_sen` — the part of
-- that total that came by KWSP — rather than returning a pre-subtracted figure.
-- "Collected without KWSP" is then one subtraction on the client, and a caller
-- that does not know about the split (the mobile apps already in people's
-- hands) keeps reading exactly the number it read yesterday.
--
-- Return types change and argument lists do not, so every function is
-- drop-and-create: `create or replace` cannot change a function's row type.

-- ---------------------------------------------------------------------------
-- 1. `payment_log_totals` — the ledger's summary line.
-- ---------------------------------------------------------------------------
drop function if exists public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid);

create function public.payment_log_totals(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null,
  _from date default null,
  _to date default null,
  _course uuid default null,
  _no_course boolean default false,
  _student uuid default null
)
returns table (total_count bigint, received_sen bigint, kwsp_sen bigint)
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
    count(*),
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded'), 0),
    -- Part of `received_sen`, never in addition to it.
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded' and p.method = 'kwsp'), 0)
  from public.payments p
  cross join zone z
  left join public.invoices i on i.id = p.invoice_id
  left join public.courses c on c.id = i.course_id
  left join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.created_by
  where p.academy_id = _academy
    and (_status is null or p.status = _status)
    and (
      _search is null
      or btrim(_search) = ''
      or position(
           lower(btrim(_search))
           in lower(concat_ws(' ',
             s.full_name, s.student_no, i.invoice_no,
             c.title, p.provider_ref, pr.full_name, p.note))
         ) > 0
    )
    and (_from is null or (coalesce(p.paid_at, p.created_at) at time zone z.tz)::date >= _from)
    and (_to is null or (coalesce(p.paid_at, p.created_at) at time zone z.tz)::date <= _to)
    and case
          when coalesce(_no_course, false) then i.course_id is null
          when _course is not null then i.course_id = _course
          else true
        end
    and (_student is null or p.student_id = _student);
$$;

comment on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid)
  is 'Row count, money received and the KWSP part of it for a payment_log_page filter. Keep the WHERE clause identical to that function.';

revoke all on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. `payment_report` — one rung of the money-received drill.
--
--    Still ranked by `amount_sen`, the whole of what arrived: a course is not
--    smaller because its students drew on KWSP to pay for it.
-- ---------------------------------------------------------------------------
drop function if exists public.payment_report(uuid, text, date, date, uuid, boolean, uuid);

create function public.payment_report(
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
  payment_count bigint,
  amount_sen bigint,
  kwsp_sen bigint,
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
      p.amount_sen,
      case when p.method = 'kwsp' then p.amount_sen else 0 end as kwsp_sen,
      i.course_id,
      c.title as course_title,
      p.student_id,
      s.full_name as student_full_name,
      s.student_no,
      to_char(coalesce(p.paid_at, p.created_at) at time zone z.tz, 'YYYY-MM') as ym
    from public.payments p
    cross join zone z
    left join public.invoices i on i.id = p.invoice_id
    left join public.courses c on c.id = i.course_id
    left join public.students s on s.id = p.student_id
    where p.academy_id = _academy
      -- Money received. A failed attempt or a refund belongs in the ledger and
      -- not in a total of takings.
      and p.status = 'succeeded'
      and (_from is null or (coalesce(p.paid_at, p.created_at) at time zone z.tz)::date >= _from)
      and (_to is null or (coalesce(p.paid_at, p.created_at) at time zone z.tz)::date <= _to)
      and case
            when coalesce(_no_course, false) then i.course_id is null
            when _course is not null then i.course_id = _course
            else true
          end
      and (_student is null or p.student_id = _student)
  ),
  grouped as (
    select
      r.ym as key,
      r.ym as label,
      null::text as sublabel,
      count(*)::bigint as payment_count,
      sum(r.amount_sen)::bigint as amount_sen,
      sum(r.kwsp_sen)::bigint as kwsp_sen,
      -- Only meaningful on the month rung; NULL elsewhere, so the outer ORDER
      -- BY collapses to the money ranking.
      r.ym as month_key
    from scoped r
    where _dim = 'month'
    group by r.ym

    union all

    -- A payment against an invoice with no course is a real bucket, not a
    -- missing row: ad-hoc fees are billed that way. The sentinel is what lets
    -- the client drill INTO it.
    select
      coalesce(r.course_id::text, '__none__'),
      coalesce(max(r.course_title), ''),
      null::text,
      count(*)::bigint,
      sum(r.amount_sen)::bigint,
      sum(r.kwsp_sen)::bigint,
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
      sum(r.amount_sen)::bigint,
      sum(r.kwsp_sen)::bigint,
      null::text
    from scoped r
    where _dim = 'student'
    group by r.student_id
  )
  select
    g.key,
    g.label,
    g.sublabel,
    g.payment_count,
    g.amount_sen,
    g.kwsp_sen,
    count(*) over ()
  from grouped g
  order by g.month_key desc nulls last, g.amount_sen desc, g.label, g.key
  limit 500;
$$;

comment on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid)
  is 'One rung of the payment drill-down: succeeded payments in the given scope, grouped by _dim (month | course | student). amount_sen is everything received and kwsp_sen the part of it that came by KWSP. Scope arguments match payment_log_page, so the leaf of the drill is that function.';

revoke all on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `invoice_totals` — the /payments tiles and the receivables summary.
--
--    An invoice carries one `amount_paid_sen` and no record of how it was
--    paid, so the KWSP part has to come from the ledger. It is summed **per
--    invoice first** and joined as one row: joining `payments` directly would
--    repeat each invoice once per payment and multiply every other sum here.
--
--    `app.sync_invoice_paid` keeps `amount_paid_sen` equal to the succeeded
--    payments against the invoice, which is what makes `collected_sen -
--    kwsp_sen` the money that did not come by KWSP rather than an estimate.
-- ---------------------------------------------------------------------------
drop function if exists public.invoice_totals(uuid, uuid, boolean, date, date, uuid);

create function public.invoice_totals(
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
  kwsp as (
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

comment on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid)
  is 'Invoiced/collected/outstanding/overdue for an academy, plus the KWSP part of collected, optionally narrowed to one course (_course) or to invoices with none (_no_course), an issue-date window, or one student.';

revoke all on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) from public, anon;
grant execute on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. `invoice_report` — one rung of the receivables drill.
-- ---------------------------------------------------------------------------
drop function if exists public.invoice_report(uuid, text, date, date, uuid, boolean, uuid);

create function public.invoice_report(
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
  kwsp as (
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

comment on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid)
  is 'One rung of the receivables drill: billed/paid/outstanding for invoices in the given scope, grouped by _dim (month | course | student), debtors first. kwsp_sen is the part of paid_sen that came by KWSP. Months bucket on issued_at, unlike payment_report which buckets on paid_at.';

revoke all on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. `invoice_report_page` — the invoices at the bottom of that drill.
-- ---------------------------------------------------------------------------
drop function if exists public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int);

create function public.invoice_report_page(
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
  kwsp as (
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

comment on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int)
  is 'One page of invoices at the bottom of the receivables drill, each with the KWSP part of what was paid. Scope arguments match invoice_report and invoice_totals; unpaid first, longest overdue first.';

revoke all on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int) from public, anon;
grant execute on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int) to authenticated;
