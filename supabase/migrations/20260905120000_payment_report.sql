-- The payment report: money received, drilled month -> course -> student -> rows.
--
-- `/payments` is the invoice book (what people were asked for) and
-- `/payments/log` is the ledger (what arrived, newest first). Neither answers
-- the question an academy actually asks at the end of a term — *where did the
-- money come from* — because both are flat lists and the answer is a
-- hierarchy. This adds the aggregate half.
--
-- Three decisions worth writing down:
--
-- 1. **Succeeded only.** A report of money received must not count a bounced
--    FPX attempt or a refund. The log keeps those rows on purpose — knowing an
--    attempt failed is the point of a ledger — but adding them here would
--    overstate the takings. So `payment_report` hard-codes
--    `status = 'succeeded'` and the page calls the log functions with
--    `_status := 'succeeded'`, so every figure on the screen counts the same
--    rows.
--
-- 2. **Days are the academy's, not the browser's.** A payment at 00:30 on
--    1 September UTC is 08:30 on 1 September in Kuala Lumpur, and a report that
--    files it under August is wrong to the person reading it. Every date
--    comparison and every month bucket here converts
--    `coalesce(paid_at, created_at)` into `academies.timezone` first — the same
--    rule `features/appointments/calendar.ts` follows on the client.
--
-- 3. **The drill narrows the SAME scope the leaf reads.** Rather than a second
--    row-level function that could drift, `payment_log_page` and
--    `payment_log_totals` grow the identical scope arguments
--    (`_from`/`_to`/`_course`/`_no_course`/`_student`), so the leaf of the
--    drill *is* the ledger, filtered. That also means the report's summary
--    comes from `payment_log_totals` at every rung — one source for the
--    number, so a group's rows and the total above them cannot disagree.
--
-- The month rung is expressed as `_from`/`_to` rather than a `_month`
-- argument: 'YYYY-MM' -> first and last day is string arithmetic the client can
-- do without knowing a timezone, and it keeps one scope vocabulary across all
-- three functions instead of two that have to be kept in step.

-- ---------------------------------------------------------------------------
-- 1. The ledger page, with the report's scope arguments.
--
--    Argument list changes, so drop-and-create: `create or replace` with a new
--    signature leaves the old function behind as an overload and makes the
--    PostgREST call ambiguous.
-- ---------------------------------------------------------------------------
drop function if exists public.payment_log_page(uuid, text, public.payment_status, int, int, text);

create or replace function public.payment_log_page(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null,
  _limit int default 50,
  _offset int default 0,
  _sort text default 'recorded',
  -- Academy-local calendar days, both inclusive. NULL = unbounded on that end.
  _from date default null,
  _to date default null,
  _course uuid default null,
  -- The null-course bucket, which `_course` cannot express: the same
  -- convention `invoice_totals` already uses for its course filter.
  _no_course boolean default false,
  _student uuid default null
)
returns table (
  id uuid,
  amount_sen int,
  method public.payment_method,
  provider public.payment_provider,
  provider_ref text,
  status public.payment_status,
  paid_at timestamptz,
  created_at timestamptz,
  invoice_id uuid,
  invoice_no text,
  course_id uuid,
  course_title text,
  student_id uuid,
  student_full_name text,
  student_no text,
  recorded_by_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  -- A whitelist, not interpolation: `_sort` picks one of two clauses written
  -- out in full right here, so no client string ever reaches the SQL text.
  -- Anything unrecognised falls to 'recorded' rather than erroring — a bad
  -- sort key is not a reason to refuse to show someone their ledger.
  --
  -- Dynamic SQL rather than a CASE inside ORDER BY because a CASE expression
  -- is not indexable: it would force a full sort of the academy's payments on
  -- every page turn, and defeat both covering indexes.
  _order text := case
    when _sort = 'paid'
      then 'p.paid_at desc nulls last, p.created_at desc, p.id desc'
      else 'p.created_at desc, p.id desc'
  end;
  -- Read once. Falls back rather than failing: an academy row hidden from the
  -- caller must not turn a ledger into an error, and every academy here is
  -- Malaysian.
  _tz text := coalesce(
    (select a.timezone from public.academies a where a.id = _academy),
    'Asia/Kuala_Lumpur'
  );
begin
  return query execute format($q$
    select
      p.id,
      p.amount_sen,
      p.method,
      p.provider,
      p.provider_ref,
      p.status,
      p.paid_at,
      p.created_at,
      p.invoice_id,
      i.invoice_no,
      c.id,
      c.title,
      p.student_id,
      s.full_name,
      s.student_no,
      pr.full_name
    from public.payments p
    left join public.invoices i on i.id = p.invoice_id
    left join public.courses c on c.id = i.course_id
    left join public.students s on s.id = p.student_id
    left join public.profiles pr on pr.id = p.created_by
    where p.academy_id = $1
      and ($2 is null or p.status = $2)
      and (
        $3 is null
        or btrim($3) = ''
        -- `position(... in ...)` rather than ILIKE: the needle is raw user
        -- input, and a stray %% or _ in a name would otherwise be a wildcard.
        or position(
             lower(btrim($3))
             in lower(concat_ws(' ',
               s.full_name, s.student_no, i.invoice_no,
               c.title, p.provider_ref, pr.full_name))
           ) > 0
      )
      and ($6 is null or (coalesce(p.paid_at, p.created_at) at time zone $11)::date >= $6)
      and ($7 is null or (coalesce(p.paid_at, p.created_at) at time zone $11)::date <= $7)
      and case
            when $9 then i.course_id is null
            when $8 is not null then i.course_id = $8
            else true
          end
      and ($10 is null or p.student_id = $10)
    order by %s
    limit $4
    offset $5
  $q$, _order)
  using
    _academy,
    _status,
    _search,
    -- Clamp rather than trust: these reach us from a query string.
    greatest(1, least(coalesce(_limit, 50), 200)),
    greatest(0, coalesce(_offset, 0)),
    _from,
    _to,
    _course,
    coalesce(_no_course, false),
    _student,
    _tz;
end;
$fn$;

comment on function public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid)
  is 'One page of the academy payment ledger. _sort is ''recorded'' (created_at, the default) or ''paid'' (paid_at). _from/_to are academy-local calendar days, inclusive. Filters must match payment_log_totals exactly or the pager and the summary disagree.';

revoke all on function public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The same scope, aggregated: count and money received.
--
--    Still a second call rather than a window function on the page query — the
--    page is 50 rows and the totals are over all of them, so folding both into
--    one statement would make every page scan the whole ledger to render 50
--    lines. The WHERE clause below must stay equivalent to the one above.
-- ---------------------------------------------------------------------------
drop function if exists public.payment_log_totals(uuid, text, public.payment_status);

create or replace function public.payment_log_totals(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null,
  _from date default null,
  _to date default null,
  _course uuid default null,
  _no_course boolean default false,
  _student uuid default null
)
returns table (total_count bigint, received_sen bigint)
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
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded'), 0)
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
             c.title, p.provider_ref, pr.full_name))
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
  is 'Row count and money received for a payment_log_page filter. Keep the WHERE clause identical to that function.';

revoke all on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One rung of the drill: the same scope, grouped one way.
--
--    `_dim` names the dimension the caller is standing on, not a path — the
--    path lives in the scope arguments, which is what makes the rungs
--    composable: "September" is `_from`/`_to`, "September, Quran class" adds
--    `_course`, and the leaf is the log with all three.
--
--    Groups come back whole rather than paged: at academy scale a month has
--    tens of courses and hundreds of students, and a report you have to page
--    through is a list. `limit` is a backstop, and `group_count` reports the
--    true number so a clipped report can say so instead of quietly lying.
--
--    Months sort newest first (a report is read backwards from now); courses
--    and students sort by money, largest first, because that is the ranking
--    the question implies.
-- ---------------------------------------------------------------------------
create or replace function public.payment_report(
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
    count(*) over ()
  from grouped g
  order by g.month_key desc nulls last, g.amount_sen desc, g.label, g.key
  limit 500;
$$;

comment on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid)
  is 'One rung of the payment drill-down: succeeded payments in the given scope, grouped by _dim (month | course | student). Scope arguments match payment_log_page, so the leaf of the drill is that function.';

revoke all on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid) to authenticated;
