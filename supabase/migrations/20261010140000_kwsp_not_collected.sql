-- To staff, money that came by KWSP has not been collected.
--
-- The owner reads an invoice with RM2,000 by bank transfer and RM500 by KWSP as
-- **RM500 outstanding**: the withdrawal is the student's EPF account settling
-- their share, not the academy holding the money, and the staff screens exist
-- to say what the academy has actually collected.
--
-- The student's side must not move. `amount_paid_sen`, `balance_sen` and
-- `status` are what the learner's billing page, the public pay link and
-- `create-bill` read, and to the student that invoice **is** settled — showing
-- them a balance would put a Pay button on money KWSP has already covered. So
-- those three columns keep their meaning exactly, and the staff view gets
-- columns of its own beside them:
--
--   kwsp_paid_sen    the part of amount_paid_sen that came by KWSP
--   collected_sen    amount_paid_sen - kwsp_paid_sen
--   uncollected_sen  greatest(0, total_sen - collected_sen)
--
-- Two books on one row, each internally consistent:
--
--   student:  total = amount_paid + balance
--   staff:    total = collected   + uncollected      (KWSP sits in uncollected)
--
-- Columns rather than a join to `payments` at read time, for two reasons. The
-- list on /payments is a plain PostgREST read and can only filter on a column
-- ("show me what is uncollected"); and the join is what timed out under RLS in
-- 20261010120000 — a figure kept on the row needs no second table at all.

-- ---------------------------------------------------------------------------
-- 1. The columns.
--
--    `kwsp_paid_sen` is owned by `app.sync_invoice_paid`, like
--    `amount_paid_sen`: never write it from a client. The other two are
--    generated, so they cannot be written at all.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists kwsp_paid_sen int not null default 0;

comment on column public.invoices.kwsp_paid_sen
  is 'The part of amount_paid_sen that came by KWSP. Maintained by app.sync_invoice_paid — never write it.';

-- Backfill from the ledger. `set_updated_at` is held off for this one
-- statement: nothing about these invoices changed today, and a bumped
-- `updated_at` on 110 rows would say otherwise. `notify_invoice_issued` fires
-- on UPDATE OF status only, so it is not involved.
alter table public.invoices disable trigger set_updated_at;

update public.invoices i
   set kwsp_paid_sen = k.kwsp_sen
  from (
    select p.invoice_id, sum(p.amount_sen)::int as kwsp_sen
    from public.payments p
    where p.status = 'succeeded' and p.method = 'kwsp'
    group by p.invoice_id
  ) k
 where k.invoice_id = i.id;

alter table public.invoices enable trigger set_updated_at;

-- A generated column cannot reference another, so `uncollected_sen` spells
-- `collected_sen` out. Clamped at zero for the reason `balance_sen` is: an
-- overpayment is not a negative debt, and one student's credit must not erase
-- another's arrears in a sum over the column.
alter table public.invoices
  add column if not exists collected_sen int
  generated always as (amount_paid_sen - kwsp_paid_sen) stored,
  add column if not exists uncollected_sen int
  generated always as (greatest(0, total_sen - (amount_paid_sen - kwsp_paid_sen))) stored;

comment on column public.invoices.collected_sen
  is 'What the academy has collected: amount_paid_sen less the KWSP part. The staff view of "paid". Generated — never write it.';
comment on column public.invoices.uncollected_sen
  is 'What the academy has not collected, clamped at zero. The staff view of "outstanding"; unlike balance_sen it still counts money covered by KWSP. Generated — never write it.';

-- ---------------------------------------------------------------------------
-- 2. The trigger keeps `kwsp_paid_sen` beside `amount_paid_sen`.
--
--    One more sum over the same rows, written in the same UPDATE under the
--    same lock. `status` is computed exactly as before, from every succeeded
--    payment: it is the student's status. The extra `is distinct from` is for
--    a payment whose method is corrected to or from KWSP — `_paid` does not
--    move then, and an invoice that is still `issued` would otherwise be
--    skipped.
-- ---------------------------------------------------------------------------
create or replace function app.sync_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app', 'pg_temp'
as $function$
declare
  _ids uuid[];
  _id uuid;
  _paid integer;
  _kwsp integer;
begin
  -- An UPDATE that moves a payment between invoices has to settle both.
  if tg_op = 'INSERT' then
    _ids := array[new.invoice_id];
  elsif tg_op = 'DELETE' then
    _ids := array[old.invoice_id];
  elsif new.invoice_id = old.invoice_id then
    _ids := array[new.invoice_id];
  else
    _ids := array[new.invoice_id, old.invoice_id];
  end if;

  foreach _id in array _ids
  loop
    perform 1 from public.invoices where id = _id for update;

    select coalesce(sum(amount_sen), 0),
           coalesce(sum(amount_sen) filter (where method = 'kwsp'), 0)
      into _paid, _kwsp
      from public.payments
      where invoice_id = _id and status = 'succeeded';

    update public.invoices i
      set amount_paid_sen = _paid,
          kwsp_paid_sen = _kwsp,
          status = case
                     when i.status in ('void', 'cancelled') then i.status
                     when _paid >= i.total_sen               then 'paid'
                     when _paid > 0                          then 'partially_paid'
                     when i.status in ('paid', 'partially_paid') then 'issued'
                     else i.status
                   end,
          updated_at = now()
      where i.id = _id
        and (i.amount_paid_sen is distinct from _paid
             or i.kwsp_paid_sen is distinct from _kwsp
             or i.status in ('paid', 'partially_paid'));
  end loop;

  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. `invoice_totals` — the /payments tiles and the receivables summary.
--
--    Gains `uncollected_sen` and loses its join to `payments`. The existing
--    columns keep their meaning — `outstanding_sen` is still the sum of
--    `balance_sen` — because the Academy mobile apps already installed read
--    them, and a figure that changed under an app that does not know why is a
--    bug report. Row type changes, so drop-and-create.
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
  kwsp_sen bigint,
  uncollected_sen bigint
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
    -- Everything paid, KWSP included, and not clamped: an overpayment was
    -- collected, because it was.
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
    coalesce(sum(i.kwsp_paid_sen), 0),
    -- The staff view of outstanding: KWSP has not been collected.
    coalesce(sum(i.uncollected_sen), 0)
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
  is 'Invoiced/collected/outstanding/overdue for an academy as the student sees them, plus the KWSP part of collected and uncollected_sen — outstanding as staff see it, with KWSP not counted as collected. Optionally narrowed to one course (_course) or to invoices with none (_no_course), an issue-date window, or one student.';

revoke all on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) from public, anon;
grant execute on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. `invoice_report` — one rung of the receivables drill.
--
--    Staff-only, so `outstanding_sen` simply becomes the staff figure and the
--    debtors-first ordering follows it: an invoice whose remainder is waiting
--    on KWSP is a debtor on this screen. Row type unchanged.
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
  scoped as (
    select
      i.total_sen,
      i.amount_paid_sen,
      i.kwsp_paid_sen,
      i.uncollected_sen,
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
      sum(r.kwsp_paid_sen)::bigint as kwsp_sen,
      sum(r.uncollected_sen)::bigint as outstanding_sen,
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
      sum(r.kwsp_paid_sen)::bigint,
      sum(r.uncollected_sen)::bigint,
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
      sum(r.kwsp_paid_sen)::bigint,
      sum(r.uncollected_sen)::bigint,
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
  is 'One rung of the receivables drill, as staff see it: billed, paid (everything, KWSP included), the KWSP part of paid, and outstanding with KWSP not counted as collected. Grouped by _dim (month | course | student), debtors first. Months bucket on issued_at, unlike payment_report which buckets on paid_at.';

-- ---------------------------------------------------------------------------
-- 5. `invoice_report_page` — the invoices at the bottom of that drill.
--
--    Gains `uncollected_sen` and orders by it; `balance_sen` stays in the row
--    for what it says. Row type changes, so drop-and-create.
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
  uncollected_sen int,
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
    i.kwsp_paid_sen::bigint,
    i.balance_sen,
    i.uncollected_sen,
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
    -- Still uncollected before settled, then longest overdue, then newest.
    (i.uncollected_sen > 0) desc,
    i.due_at asc nulls last,
    coalesce(i.issued_at, i.created_at) desc,
    i.id desc
  -- Clamp rather than trust: these reach us from a query string.
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int)
  is 'One page of invoices at the bottom of the receivables drill, each with the KWSP part of what was paid and what staff count as uncollected. Scope arguments match invoice_report and invoice_totals; uncollected first, longest overdue first.';

revoke all on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int) from public, anon;
grant execute on function public.invoice_report_page(uuid, date, date, uuid, boolean, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `/courses/:id/billing` — the same rule on the course roster.
--
--    Both functions are admin-only staff screens, so paid becomes collected
--    and outstanding becomes uncollected; `pay_status` follows, and a student
--    whose remainder is waiting on KWSP reads `partial`, not `paid`. Row types
--    unchanged.
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
      sum(i.collected_sen)::bigint as paid_sen,
      sum(i.uncollected_sen)::bigint as outstanding_sen
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

create or replace function public.course_billing_roster(
  _academy uuid,
  _course uuid,
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
      sum(i.collected_sen)::bigint as paid_sen,
      sum(i.uncollected_sen)::bigint as outstanding_sen,
      -- The invoice to open from the row: the one still uncollected and due
      -- soonest if there is one, else the latest. A row with money to chase is
      -- opened to chase it; a settled row is opened to check it.
      (array_agg(i.id order by (i.uncollected_sen > 0) desc, i.due_at asc nulls last,
                 coalesce(i.issued_at, i.created_at) desc))[1] as last_invoice_id,
      (array_agg(i.invoice_no order by (i.uncollected_sen > 0) desc, i.due_at asc nulls last,
                 coalesce(i.issued_at, i.created_at) desc))[1] as last_invoice_no,
      (array_agg(i.due_at order by (i.uncollected_sen > 0) desc, i.due_at asc nulls last,
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
