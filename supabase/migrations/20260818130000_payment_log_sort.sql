-- The payment log can be ordered by when the money arrived OR by when it was
-- entered, and defaults to the latter.
--
-- `payment_log_page` ordered by `paid_at` only, which is the right order for a
-- ledger and the wrong one for the person filling it in. `RecordPaymentDialog`
-- asks for the payment date, so staff catching up on historical payments enter
-- them back-dated — in this database 737 of 742 rows have a `paid_at` on a
-- different day from their `created_at`. A payment banked today for money that
-- arrived in May sorts into May: row 338 of 742, page 7. It was never missing,
-- but "I just recorded it and cannot see it" is indistinguishable from missing,
-- and on a ledger that is the worst possible ambiguity.
--
-- Hence `_sort`, defaulting to 'recorded' — newest entry first, which is what
-- someone doing data entry means by "recent". 'paid' restores the value-date
-- order for reconciliation. Totals are unaffected: sum and count do not care
-- about ORDER BY, so `payment_log_totals` is untouched and the two still agree.

-- Argument list changes, so this is a drop-and-create rather than a replace:
-- `create or replace` with a new signature would leave the old function in
-- place as an overload and make the PostgREST call ambiguous.
drop function if exists public.payment_log_page(uuid, text, public.payment_status, int, int);

create or replace function public.payment_log_page(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null,
  _limit int default 50,
  _offset int default 0,
  _sort text default 'recorded'
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
  -- every page turn, and defeat both covering indexes below.
  _order text := case
    when _sort = 'paid'
      then 'p.paid_at desc nulls last, p.created_at desc, p.id desc'
      else 'p.created_at desc, p.id desc'
  end;
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
    greatest(0, coalesce(_offset, 0));
end;
$fn$;

comment on function public.payment_log_page(uuid, text, public.payment_status, int, int, text)
  is 'One page of the academy payment ledger. _sort is ''recorded'' (created_at, the default) or ''paid'' (paid_at). Filters must match payment_log_totals exactly or the pager and the summary disagree.';

revoke all on function public.payment_log_page(uuid, text, public.payment_status, int, int, text) from public, anon;
grant execute on function public.payment_log_page(uuid, text, public.payment_status, int, int, text) to authenticated;

-- The covering index for the new default ordering. Its `paid_at` sibling from
-- the pagination migration still serves _sort = 'paid'.
create index if not exists payments_academy_created_at_idx
  on public.payments (academy_id, created_at desc, id desc);
