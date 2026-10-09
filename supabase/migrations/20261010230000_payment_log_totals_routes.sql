-- The payment log's number cards: Total collections, Bank transfer, FPX.
--
-- The log had one figure above it — "N payments · RM received" — and the owner
-- wants the takings split by how they arrived. `payment_log_totals` already
-- sums the filtered ledger once; it now also says how much of it came by bank
-- transfer and how much by FPX, and how many payments each is.
--
-- Total collections is not a column: it is `received_sen - kwsp_sen`, because
-- to staff money that came by KWSP has not been collected
-- (docs/payment-report.md). Its count is `collected_count`. The total is
-- larger than Bank transfer + FPX by whatever came as cash or "other".
--
-- Everything is a FILTER over the same rows under the same WHERE, so the
-- cards answer exactly the search and status the table below them is showing.
--
-- Row type changes, so drop-and-create. Existing columns keep their meaning.
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
    and (_student is null or p.student_id = _student);
$$;

comment on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid)
  is 'Row count, money received, the KWSP part of it, and the bank-transfer and FPX parts with their counts, for a payment_log_page filter. Keep the WHERE clause identical to that function.';

revoke all on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid) to authenticated;
