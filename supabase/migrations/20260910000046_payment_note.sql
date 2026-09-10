-- A note on a payment row.
--
-- The ledger already names the method, the reference and the person who typed
-- the row in, but none of those carry the sentence a manual payment usually
-- needs -- a cheque number, "paid at the front desk", which sibling settled it,
-- why the amount is short of the instalment. That sentence had nowhere to go.
--
-- Nullable and unconstrained: a note is optional by definition, and the client
-- stores a blank one as NULL so "no note" has exactly one representation.
--
-- Note that `payments: admin view all, student view own` lets a student read
-- their own payment rows, so this column is readable by the student it
-- concerns. It is a note *about the payment*, not a staff-private one; no
-- screen shows it to them, but nothing stops the API returning it either.
alter table public.payments add column if not exists note text;

comment on column public.payments.note is
  'Free-text remark on a payment (cheque number, who handed it over). Readable by the student the payment belongs to -- not a staff-private field.';

-- The ledger reader gains the column, and gains it in `_search` too: "cheque
-- 4471" is exactly what somebody types into the search box, and the note is now
-- the only place that string lives. `payment_log_totals` gets the identical
-- clause -- the two must agree about which rows they are looking at, or a page
-- of rows sums to a different figure than the line printed above it.
--
-- Drop and create, not CREATE OR REPLACE: the return type changes.
drop function if exists public.payment_log_page(
  uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid
);

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
  _student uuid default null
)
returns table (
  id uuid,
  amount_sen integer,
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
set search_path to ''
as $function$
declare
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
    _tz;
end;
$function$;

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
set search_path to ''
as $function$
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
$function$;

grant execute on function public.payment_log_page(
  uuid, text, public.payment_status, int, int, text, date, date, uuid, boolean, uuid
) to authenticated;
