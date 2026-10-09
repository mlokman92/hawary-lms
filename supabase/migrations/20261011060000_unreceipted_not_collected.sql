-- A bank transfer without its receipt has not been collected.
--
-- A bank transfer is the one payment the system takes on a staff member's
-- word. The receipts queue (20261010220000) made the missing proof visible;
-- the owner now wants it to *count*: until the receipt is uploaded, the money
-- is not in any Collected figure, and on staff screens it is still
-- outstanding. All of them — the 2,331 transfers already in the ledger too.
--
-- This is the KWSP rule again, with a second reason for money to be "paid but
-- not collected", and it is built the same way:
--
--   * the student's side does not move. `amount_paid_sen`, `balance_sen` and
--     `status` still count every payment. A student who transferred the money
--     owes nothing, sees nothing owing and is offered no Pay button, whether
--     or not the academy has filed its copy of the receipt;
--   * the staff reading is in columns beside them, kept by triggers:
--
--       unreceipted_sen  bank transfers on this invoice with no receipt
--       collected_sen    amount_paid - kwsp_paid - unreceipted
--       uncollected_sen  total - collected, never below zero
--       owed_sen         total - amount_paid + unreceipted, never below zero
--
--     `owed_sen` is "outstanding" for a screen that shows KWSP as a figure of
--     its own (/payments): what students still owe, plus what they have sent
--     without proof. `uncollected_sen` is "outstanding" for a screen that does
--     not: it has the KWSP money in it as well.
--
-- Whether a payment has a receipt lives on the payment (`has_receipt`), set by
-- a trigger on `payment_receipts`. Not a join at read time: the aggregates
-- here run under RLS over a few thousand payments, and a join to a second
-- policy-guarded table is the shape that timed out in 20261010120000.

-- ---------------------------------------------------------------------------
-- 1. `payments.has_receipt`
--
--    Owned by the trigger below — never write it. It flips when a receipt row
--    appears or goes, and because it is an UPDATE of `payments` it fires
--    `app.sync_invoice_paid`, which is exactly what re-files the invoice.
--    (The receipts table was kept away from the money trigger when a receipt
--    was only paperwork. It is not only paperwork any more.)
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists has_receipt boolean not null default false;

comment on column public.payments.has_receipt
  is 'Whether a payment_receipts row exists for this payment. Maintained by app.sync_payment_receipt — never write it.';

update public.payments p
   set has_receipt = true
 where exists (select 1 from public.payment_receipts r where r.payment_id = p.id)
   and not p.has_receipt;

create or replace function app.sync_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.payments set has_receipt = true
     where id = new.payment_id and not has_receipt;
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and new.payment_id is distinct from old.payment_id) then
    -- Zero rows when the payment itself is being deleted and took the receipt
    -- with it; that is fine, there is nothing left to mark.
    update public.payments set has_receipt = false
     where id = old.payment_id and has_receipt;
  end if;
  return null;
end;
$function$;

drop trigger if exists payment_receipts_sync_payment on public.payment_receipts;
create trigger payment_receipts_sync_payment
  after insert or update or delete on public.payment_receipts
  for each row execute function app.sync_payment_receipt();

-- ---------------------------------------------------------------------------
-- 2. `invoices.unreceipted_sen`, and the columns that follow from it.
--
--    Added and back-filled before the generated columns are redefined, so the
--    table is rewritten once with the right figures. `set_updated_at` is held
--    off for the back-fill: nothing about these invoices changed today except
--    how staff count them.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists unreceipted_sen int not null default 0;

comment on column public.invoices.unreceipted_sen
  is 'The part of amount_paid_sen that came by bank transfer with no receipt uploaded. Maintained by app.sync_invoice_paid — never write it.';

alter table public.invoices disable trigger set_updated_at;
alter table public.invoices disable trigger set_invoice_course;

update public.invoices i
   set unreceipted_sen = u.sen
  from (
    select p.invoice_id, sum(p.amount_sen)::int as sen
    from public.payments p
    where p.status = 'succeeded'
      and p.method = 'bank_transfer'
      and not p.has_receipt
    group by p.invoice_id
  ) u
 where u.invoice_id = i.id;

alter table public.invoices enable trigger set_invoice_course;
alter table public.invoices enable trigger set_updated_at;

alter table public.invoices
  alter column collected_sen
    set expression as (amount_paid_sen - kwsp_paid_sen - unreceipted_sen),
  alter column uncollected_sen
    set expression as (greatest(0, total_sen - (amount_paid_sen - kwsp_paid_sen - unreceipted_sen)));

alter table public.invoices
  add column if not exists owed_sen int
  generated always as (greatest(0, total_sen - amount_paid_sen + unreceipted_sen)) stored;

comment on column public.invoices.collected_sen
  is 'What the academy has collected: amount_paid_sen less KWSP and less bank transfers with no receipt. The staff view of "paid". Generated — never write it.';
comment on column public.invoices.uncollected_sen
  is 'What the academy has not collected, clamped at zero: the student''s balance, plus KWSP, plus bank transfers with no receipt. Generated — never write it.';
comment on column public.invoices.owed_sen
  is 'Outstanding where KWSP is shown as its own figure: the student''s balance plus bank transfers with no receipt, clamped at zero. Generated — never write it.';

-- ---------------------------------------------------------------------------
-- 3. The payment trigger keeps `unreceipted_sen` beside the other two.
--
--    One more FILTER over the same rows, in the same UPDATE, under the same
--    lock. `status` is still computed from every succeeded payment: it is the
--    student's status, and a missing receipt is not the student's problem.
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
  _unreceipted integer;
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
           coalesce(sum(amount_sen) filter (where method = 'kwsp'), 0),
           coalesce(sum(amount_sen) filter (
             where method = 'bank_transfer' and not has_receipt), 0)
      into _paid, _kwsp, _unreceipted
      from public.payments
      where invoice_id = _id and status = 'succeeded';

    update public.invoices i
      set amount_paid_sen = _paid,
          kwsp_paid_sen = _kwsp,
          unreceipted_sen = _unreceipted,
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
             or i.unreceipted_sen is distinct from _unreceipted
             or i.status in ('paid', 'partially_paid'));
  end loop;

  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The read functions say how much of what they report has no receipt.
--
--    As with KWSP, each keeps its existing columns meaning what they meant —
--    the Academy mobile apps already installed read them — and gains the new
--    part beside them. Row types change, so each is drop-and-create.
--    `course_billing_summary` / `_roster` are untouched: they read
--    `collected_sen` and `uncollected_sen`, which have just changed under them.
-- ---------------------------------------------------------------------------

-- invoice_totals
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
  uncollected_sen bigint,
  collected_count bigint,
  kwsp_count bigint,
  uncollected_count bigint,
  outstanding_count bigint,
  unreceipted_sen bigint,
  owed_sen bigint,
  owed_count bigint
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
    coalesce(sum(i.uncollected_sen), 0),
    -- The size of each tile's set. An invoice paid partly by KWSP is in all
    -- three, exactly as it is in all three lists.
    count(*) filter (where i.collected_sen > 0),
    count(*) filter (where i.kwsp_paid_sen > 0),
    count(*) filter (where i.uncollected_sen > 0),
    -- Invoices with something the student can still pay: the Outstanding
    -- tile's set. A KWSP-covered invoice is not in it.
    count(*) filter (where i.balance_sen > 0),
    -- Bank transfers with no receipt: inside `collected_sen`, and
    -- taken out of it by every staff screen.
    coalesce(sum(i.unreceipted_sen), 0),
    -- Outstanding beside a KWSP figure, and how many invoices it is.
    coalesce(sum(i.owed_sen), 0),
    count(*) filter (where i.owed_sen > 0)
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
  is 'Invoiced/collected/outstanding/overdue for an academy as the student sees them, plus the KWSP part of collected, uncollected_sen (outstanding as staff see it, with KWSP not counted as collected), and how many invoices have something collected, something by KWSP, something uncollected, and something the student still owes (outstanding_count). unreceipted_sen is the bank-transfer money with no receipt; owed_sen / owed_count are outstanding as /payments shows it: the balance plus that. Optionally narrowed to one course (_course) or to invoices with none (_no_course), an issue-date window, or one student.';

revoke all on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) from public, anon;
grant execute on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) to authenticated;

-- invoice_report
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
  collected_sen bigint,
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
      i.collected_sen,
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
      sum(r.collected_sen)::bigint as collected_sen,
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
      sum(r.collected_sen)::bigint,
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
      sum(r.collected_sen)::bigint,
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
    g.collected_sen,
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
  is 'One rung of the receivables drill, as staff see it: billed, paid (everything), the KWSP part of paid, collected (paid less KWSP and less bank transfers with no receipt), and outstanding as what is not collected. Grouped by _dim (month | course | student), debtors first. Months bucket on issued_at, unlike payment_report which buckets on paid_at.';

revoke all on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.invoice_report(uuid, text, date, date, uuid, boolean, uuid) to authenticated;

-- invoice_report_page
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
  collected_sen int,
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
    i.collected_sen,
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

-- payment_report
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
  unreceipted_sen bigint,
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
      case when p.method = 'bank_transfer' and not p.has_receipt
           then p.amount_sen else 0 end as unreceipted_sen,
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
      sum(r.unreceipted_sen)::bigint as unreceipted_sen,
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
      sum(r.unreceipted_sen)::bigint,
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
      sum(r.unreceipted_sen)::bigint,
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
    g.unreceipted_sen,
    count(*) over ()
  from grouped g
  order by g.month_key desc nulls last, g.amount_sen desc, g.label, g.key
  limit 500;
$$;

comment on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid)
  is 'One rung of the payment drill-down: succeeded payments in the given scope, grouped by _dim (month | course | student). amount_sen is everything received; kwsp_sen is the part that came by KWSP and unreceipted_sen the part that came by bank transfer with no receipt. Scope arguments match payment_log_page, so the leaf of the drill is that function.';

revoke all on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.payment_report(uuid, text, date, date, uuid, boolean, uuid) to authenticated;

-- payment_log_totals
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
  other_count bigint,
  unreceipted_sen bigint,
  unreceipted_count bigint
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
        and p.method not in ('bank_transfer', 'fpx', 'cash', 'kwsp')),
    -- Bank transfers with no receipt: inside `bank_transfer_*`, and not
    -- collected until the receipt is uploaded.
    coalesce(sum(p.amount_sen) filter (
      where p.status = 'succeeded' and p.method = 'bank_transfer' and not p.has_receipt), 0),
    count(*) filter (
      where p.status = 'succeeded' and p.method = 'bank_transfer' and not p.has_receipt)
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
  is 'Row count, money received, the KWSP part of it, and the bank-transfer, FPX, cash and other parts with their counts, and the bank-transfer part that has no receipt, for a payment_log_page filter. Keep the WHERE clause identical to that function.';

revoke all on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method) from public, anon;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status, date, date, uuid, boolean, uuid, public.payment_method) to authenticated;
