-- The payment log's cards add up: Cash and Other join Bank transfer and FPX.
--
-- Total collections was shown beside two of its parts, and the row did not
-- add up — RM50,000 of cash and "other" was in the total and nowhere else.
-- The owner asked for the missing cards.
--
-- `other_*` is everything collected that is **not** bank transfer, FPX or
-- cash — the `other` method, and card and e-wallet with it. Defined as the
-- remainder on purpose, so that
--
--   received_sen - kwsp_sen = bank_transfer + fpx + cash + other
--
-- holds whatever methods exist, rather than only for the ones somebody
-- remembered to give a card.
--
-- Row type changes, so drop-and-create. Existing columns keep their meaning.
drop function if exists public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method);

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
  fpx_count bigint,
  cash_sen bigint,
  cash_count bigint,
  other_sen bigint,
  other_count bigint
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
    count(*) filter (where p.status = 'succeeded' and p.method = 'fpx'),
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded' and p.method = 'cash'), 0),
    count(*) filter (where p.status = 'succeeded' and p.method = 'cash'),
    -- The remainder: collected, and none of the three above.
    coalesce(sum(p.amount_sen) filter (
      where p.status = 'succeeded'
        and p.method not in ('bank_transfer', 'fpx', 'cash', 'kwsp')), 0),
    count(*) filter (
      where p.status = 'succeeded'
        and p.method not in ('bank_transfer', 'fpx', 'cash', 'kwsp'))
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
  is 'Row count, money received, the KWSP part of it, and the bank-transfer, FPX, cash and other parts with their counts, for a payment_log_page filter. Keep the WHERE clause identical to that function.';

revoke all on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method) from public, anon;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method) to authenticated;
