-- The Outstanding tile on /payments counts what students still owe — not KWSP.
--
-- The tiles there are Total invoiced | Collected | KWSP | Outstanding. While
-- Outstanding was "everything the academy has not collected" it contained the
-- KWSP tile's money a second time, so the three money tiles added up to more
-- than the first. The owner wants them to be three separate slices:
--
--   Total invoiced = Collected + KWSP + Outstanding
--
-- which makes Outstanding the student's own balance — `balance_sen`, already
-- summed here as `outstanding_sen`. What was missing is the *count* behind it,
-- for the "(n)" on the tile: `outstanding_count`, taken with the predicate the
-- tile's filter uses (`balance_sen > 0`).
--
-- `uncollected_sen` / `uncollected_count` stay: the report, the invoice page
-- and the other staff screens still read "outstanding" as uncollected, because
-- they have no separate KWSP figure to hold that money.
--
-- Row type changes, so drop-and-create. Existing columns keep their meaning.
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
  outstanding_count bigint
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
    count(*) filter (where i.balance_sen > 0)
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
  is 'Invoiced/collected/outstanding/overdue for an academy as the student sees them, plus the KWSP part of collected, uncollected_sen (outstanding as staff see it, with KWSP not counted as collected), and how many invoices have something collected, something by KWSP, something uncollected, and something the student still owes (outstanding_count). Optionally narrowed to one course (_course) or to invoices with none (_no_course), an issue-date window, or one student.';

revoke all on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) from public, anon;
grant execute on function public.invoice_totals(uuid, uuid, boolean, date, date, uuid) to authenticated;
