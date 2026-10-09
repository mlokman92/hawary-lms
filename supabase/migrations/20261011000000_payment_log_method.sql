-- The payment log filters by method of payment.
--
-- The log's one filter was the payment's *status*, and in this ledger that
-- filter has a single value: every one of 2,547 rows is `succeeded`. What the
-- owner asks of the ledger is "show me the bank transfers", "show me what came
-- by KWSP" — so the status picker is replaced by a method picker, and both log
-- functions learn `_method`.
--
-- `_status` stays an argument. The Academy mobile apps already installed call
-- these with named arguments and no `_method`; a NULL default means they keep
-- resolving to the one function that exists and keep getting every method.
--
-- Argument lists change, so both are drop-and-create: `create or replace` with
-- a new signature would leave the old function behind as an overload, and
-- PostgREST's named-argument call would then resolve to neither.

-- ---------------------------------------------------------------------------
-- 1. `payment_log_page`
-- ---------------------------------------------------------------------------
drop function if exists public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid);

create function public.payment_log_page(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null,
  _limit int default 50,
  _offset int default 0,
  _sort text default 'recorded',
  _from date default null,
  _to date default null,
  _course uuid default null,
  _no_course boolean default false,
  _student uuid default null,
  _method public.payment_method default null
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
  note text,
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
as $function$
declare
  -- A two-clause whitelist, not a CASE inside ORDER BY: a CASE is not
  -- indexable and would force a full sort of the ledger on every page turn.
  _order text := case
    when _sort = 'paid'
      then 'p.paid_at desc nulls last, p.created_at desc, p.id desc'
      else 'p.created_at desc, p.id desc'
  end;
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
      p.note,
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
        or position(
             lower(btrim($3))
             in lower(concat_ws(' ',
               s.full_name, s.student_no, i.invoice_no,
               c.title, p.provider_ref, pr.full_name, p.note))
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
      and ($12 is null or p.method = $12)
    order by %s
    limit $4
    offset $5
  $q$, _order)
  using
    _academy,
    _status,
    _search,
    greatest(1, least(coalesce(_limit, 50), 200)),
    greatest(0, coalesce(_offset, 0)),
    _from,
    _to,
    _course,
    coalesce(_no_course, false),
    _student,
    _tz,
    _method;
end;
$function$;

comment on function public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid, public.payment_method)
  is 'One page of the payments ledger: search, status, method, an academy-local date window, course and student. Keep the WHERE clause identical to payment_log_totals.';

revoke all on function public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid, public.payment_method) from public, anon;
grant execute on function public.payment_log_page(uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid, public.payment_method) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. `payment_log_totals` — the same filter, summed. Its WHERE clause must
--    stay equivalent to the page's, or the cards stop describing the rows.
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
  _student uuid default null,
  _method public.payment_method default null
)
returns table (
  total_count bigint,
  received_sen bigint,
  kwsp_sen bigint,
  collected_count bigint,
  bank_transfer_sen bigint,
  bank_transfer_count bigint,
  fpx_sen bigint,
  fpx_count bigint
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
    count(*),
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded'), 0),
    -- Part of `received_sen`, never in addition to it.
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded' and p.method = 'kwsp'), 0),
    -- How many payments `received_sen - kwsp_sen` is made of.
    count(*) filter (where p.status = 'succeeded' and p.method <> 'kwsp'),
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded' and p.method = 'bank_transfer'), 0),
    count(*) filter (where p.status = 'succeeded' and p.method = 'bank_transfer'),
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded' and p.method = 'fpx'), 0),
    count(*) filter (where p.status = 'succeeded' and p.method = 'fpx')
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
    and (_student is null or p.student_id = _student)
    and (_method is null or p.method = _method);
$$;

comment on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method)
  is 'Row count, money received, the KWSP part of it, and the bank-transfer and FPX parts with their counts, for a payment_log_page filter. Keep the WHERE clause identical to that function.';

revoke all on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method) from public, anon;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method) to authenticated;
