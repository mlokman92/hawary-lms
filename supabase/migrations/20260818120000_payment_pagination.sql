-- Pagination for /payments and /payments/log.
--
-- Both pages fetched every row and did the work in the browser: the invoice
-- list summed four money tiles over the whole academy, the payment log summed
-- its own takings and searched across five joined columns. At 543 invoices and
-- 702 payments in one academy that still worked, but it is the wrong shape —
-- PostgREST caps a request at the project's "Max rows" (1000 by default), and a
-- LEDGER that silently stops at row 1000 is worse than one that is slow.
--
-- So the rows are paged and the totals become aggregates. The split matters:
-- a page of 50 rows cannot answer "how much is outstanding", and computing the
-- answer from the page would quietly reinterpret the question. Every function
-- here is SECURITY INVOKER — RLS on payments/invoices already scopes a caller
-- to their academy (`payments: staff view all, student view own`), so there is
-- no reason to hand out definer rights to read what the caller could read
-- anyway. That also means a student calling these gets their own rows and
-- nothing else, which is the correct answer rather than an error.

-- ---------------------------------------------------------------------------
-- 1. The payment log: one page of rows.
--
--    An RPC rather than PostgREST because the search spans five tables
--    (student name/number, invoice number, course title, gateway reference and
--    the person who recorded it) and PostgREST cannot OR across embedded
--    resources — `or=` only sees top-level columns.
--
--    The joins are LEFT: a payment whose invoice or student is hidden by RLS
--    must still appear in the ledger with a blank column, never vanish from it.
--
--    Ordering carries `p.id` as a final tie-break. Without a unique last key,
--    two payments sharing a `paid_at` can swap places between requests and
--    OFFSET paging then repeats one row and skips another.
-- ---------------------------------------------------------------------------
create or replace function public.payment_log_page(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null,
  _limit int default 50,
  _offset int default 0
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
language sql
stable
security invoker
set search_path = ''
as $$
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
  where p.academy_id = _academy
    and (_status is null or p.status = _status)
    and (
      _search is null
      or btrim(_search) = ''
      -- `position(... in ...)` rather than ILIKE: the needle is raw user input,
      -- and a stray % or _ in a name would otherwise become a wildcard.
      or position(
           lower(btrim(_search))
           in lower(concat_ws(' ',
             s.full_name, s.student_no, i.invoice_no,
             c.title, p.provider_ref, pr.full_name))
         ) > 0
    )
  order by p.paid_at desc nulls last, p.created_at desc, p.id desc
  -- Clamp rather than trust: `_limit` reaches this from a query string.
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.payment_log_page(uuid, text, public.payment_status, int, int)
  is 'One page of the academy payment ledger. Filters must match payment_log_totals exactly or the pager and the summary disagree.';

-- ---------------------------------------------------------------------------
-- 2. The payment log: the totals for the SAME filter.
--
--    Deliberately a second call over the same predicate rather than a window
--    function bolted onto the page query: the page is 50 rows and the totals
--    are over all of them, so folding both into one statement would make every
--    page scan the whole ledger to render 50 lines.
--
--    Only `succeeded` counts towards money received. A failed or pending row
--    belongs in the log — knowing an attempt bounced is the point of keeping
--    one — but adding it to the takings would overstate them.
-- ---------------------------------------------------------------------------
create or replace function public.payment_log_totals(
  _academy uuid,
  _search text default null,
  _status public.payment_status default null
)
returns table (total_count bigint, received_sen bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*),
    coalesce(sum(p.amount_sen) filter (where p.status = 'succeeded'), 0)
  from public.payments p
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
    );
$$;

comment on function public.payment_log_totals(uuid, text, public.payment_status)
  is 'Row count and money received for a payment_log_page filter. Keep the WHERE clause identical to that function.';

-- ---------------------------------------------------------------------------
-- 3. The invoice list: the four money tiles.
--
--    The rows themselves stay on PostgREST — a course filter is one `eq` and
--    the embeds are plain FKs, so an RPC would buy nothing. Only the tiles need
--    SQL, because they are sums over the whole filtered set and a page cannot
--    produce them.
--
--    This mirrors `computeStats` in PaymentsPage.tsx exactly, including the two
--    places it is deliberately asymmetric: `collected` is the raw sum of
--    amount_paid_sen (an overpayment shows as collected, because it was), while
--    `outstanding` and `overdue` clamp each invoice's balance at zero first, so
--    one student's credit can never erase another's debt.
--
--    `status = 'overdue'` is a dead enum value — nothing sets it, pg_cron is
--    not installed — so overdue is derived from `due_at`. The status arm is
--    kept for parity with the client in case that ever changes.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_totals(
  _academy uuid,
  _course uuid default null,
  _no_course boolean default false
)
returns table (
  invoiced_sen bigint,
  collected_sen bigint,
  outstanding_sen bigint,
  overdue_sen bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(i.total_sen), 0),
    coalesce(sum(i.amount_paid_sen), 0),
    coalesce(sum(greatest(0, i.total_sen - i.amount_paid_sen)), 0),
    coalesce(sum(
      case
        when greatest(0, i.total_sen - i.amount_paid_sen) > 0
         and (i.status = 'overdue' or (i.due_at is not null and i.due_at < now()))
        then greatest(0, i.total_sen - i.amount_paid_sen)
        else 0
      end
    ), 0)
  from public.invoices i
  where i.academy_id = _academy
    -- Not real receivables; they must stay out of every money total.
    and i.status not in ('void', 'cancelled', 'draft')
    and case
          when _no_course then i.course_id is null
          when _course is not null then i.course_id = _course
          else true
        end;
$$;

comment on function public.invoice_totals(uuid, uuid, boolean)
  is 'Invoiced/collected/outstanding/overdue for an academy, optionally narrowed to one course (_course) or to invoices with none (_no_course).';

-- ---------------------------------------------------------------------------
-- 4. Grants. Signed-in callers only; RLS does the rest.
-- ---------------------------------------------------------------------------
revoke all on function public.payment_log_page(uuid, text, public.payment_status, int, int) from public, anon;
revoke all on function public.payment_log_totals(uuid, text, public.payment_status) from public, anon;
revoke all on function public.invoice_totals(uuid, uuid, boolean) from public, anon;

grant execute on function public.payment_log_page(uuid, text, public.payment_status, int, int) to authenticated;
grant execute on function public.payment_log_totals(uuid, text, public.payment_status) to authenticated;
grant execute on function public.invoice_totals(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Indexes for the two orderings the pager actually uses.
--
--    Paging is ORDER BY + OFFSET, so without these every page sorts the whole
--    table. The payment index carries the full sort key including the id
--    tie-break; the invoice one matches the list's `created_at desc`.
-- ---------------------------------------------------------------------------
create index if not exists payments_academy_paid_at_idx
  on public.payments (academy_id, paid_at desc nulls last, created_at desc, id desc);

create index if not exists invoices_academy_created_at_idx
  on public.invoices (academy_id, created_at desc, id desc);
