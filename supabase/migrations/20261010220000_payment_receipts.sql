-- Bank transfer receipts.
--
-- A bank transfer is the one way money arrives that the system has to take on
-- trust: FPX is confirmed by the gateway's callback, but a transfer is a row a
-- staff member typed in. The owner wants the proof beside the claim — every
-- bank transfer in the ledger carries the receipt it was recorded from, and
-- one that does not is **pending** until somebody uploads it.
--
-- Pending is a fact about the paperwork, not about the money. It does not
-- touch `payments.status`, `invoices.amount_paid_sen` or any total: the
-- transfer was recorded as received and still counts as received. A payment
-- is pending exactly when it has no row here.

-- ---------------------------------------------------------------------------
-- 1. Where the files live.
--
--    Private: a receipt shows a payer's name, bank and account number. Read
--    only through a signed URL minted by the `payment-receipt` Edge Function.
--    A receipt is a photo, a screenshot or a PDF from a banking app, so the
--    type list is short and the cap is 10 MB.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts', 'payment-receipts', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. One receipt per payment.
--
--    `payment_id` is the primary key: uploading again replaces. A separate
--    table rather than columns on `payments`, because every UPDATE of a
--    payment fires `app.sync_invoice_paid` and takes the invoice's row lock —
--    attaching a file should not go anywhere near the money trigger.
--
--    Clients never write it. The Edge Function does, with the service role,
--    after checking the caller is an admin of the payment's academy and
--    copying `academy_id` from the payment itself — so the row's tenant cannot
--    be anything but the payment's.
--
--    Deleting a payment takes its receipt row with it. The object stays in the
--    bucket, orphaned, the way a deleted course material's does; nothing
--    sweeps either yet.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_receipts (
  payment_id       uuid primary key references public.payments(id) on delete cascade,
  academy_id       uuid not null references public.academies(id) on delete cascade,
  file_path        text not null,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       bigint not null,
  -- Snapshot of the name, like enrollment_events: the line "uploaded by" has
  -- to stay readable after the staff member's account is gone.
  uploaded_by      uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  created_at       timestamptz not null default now()
);

comment on table public.payment_receipts is
  'The receipt a bank-transfer payment was recorded from, one per payment. A bank transfer with no row here is pending. Written only by the payment-receipt Edge Function.';

create index if not exists payment_receipts_academy_idx
  on public.payment_receipts (academy_id);

alter table public.payment_receipts enable row level security;

-- Admins only, like the rest of the money section. No `owns_student` arm: the
-- student sent the receipt, they do not need the academy's copy back.
create policy "payment receipts: admin read"
  on public.payment_receipts for select to authenticated
  using (app.is_admin(academy_id));

revoke all on public.payment_receipts from anon, authenticated;
grant select on public.payment_receipts to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The page: bank transfers, with or without their receipt.
--
--    Succeeded bank transfers only — a transfer that was refunded or never
--    settled has nothing to prove. `_state` is 'pending', 'uploaded' or NULL
--    for both. Newest-recorded first, the order the ledger uses, because the
--    receipt in somebody's hand is for the payment they just typed in.
--
--    `app.is_admin(_academy)` is in the WHERE and not only in the policies:
--    `payments` lets a student read their own rows, and without it a student
--    calling this would get their own transfers back, every one "pending".
-- ---------------------------------------------------------------------------
create or replace function public.bank_transfer_receipts_page(
  _academy uuid,
  _state text default null,
  _search text default null,
  _limit int default 50,
  _offset int default 0
)
returns table (
  id uuid,
  amount_sen int,
  paid_at timestamptz,
  created_at timestamptz,
  note text,
  invoice_id uuid,
  invoice_no text,
  course_title text,
  student_id uuid,
  student_full_name text,
  student_no text,
  recorded_by_name text,
  receipt_file_name text,
  receipt_mime_type text,
  receipt_uploaded_at timestamptz,
  receipt_uploaded_by_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.amount_sen,
    p.paid_at,
    p.created_at,
    p.note,
    p.invoice_id,
    i.invoice_no,
    c.title,
    p.student_id,
    s.full_name,
    s.student_no,
    pr.full_name,
    r.file_name,
    r.mime_type,
    r.created_at,
    r.uploaded_by_name
  from public.payments p
  left join public.payment_receipts r on r.payment_id = p.id
  left join public.invoices i on i.id = p.invoice_id
  left join public.courses c on c.id = i.course_id
  left join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.created_by
  where p.academy_id = _academy
    and app.is_admin(_academy)
    and p.method = 'bank_transfer'
    and p.status = 'succeeded'
    and case _state
          when 'pending' then r.payment_id is null
          when 'uploaded' then r.payment_id is not null
          else true
        end
    and (
      _search is null
      or btrim(_search) = ''
      or position(
           lower(btrim(_search))
           in lower(concat_ws(' ',
             s.full_name, s.student_no, i.invoice_no,
             c.title, pr.full_name, p.note))
         ) > 0
    )
  -- `id` last: OFFSET paging over a non-unique sort repeats one row and skips
  -- another.
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.bank_transfer_receipts_page(uuid, text, text, int, int)
  is 'One page of succeeded bank-transfer payments with their receipt, if any. _state: pending | uploaded | NULL for both. Admin only.';

-- ---------------------------------------------------------------------------
-- 4. How many are pending, and how much money that is.
--
--    Its own call for the reason `payment_log_totals` is: the page is 50 rows
--    and the counts are over all of them. The WHERE clause must stay the same
--    as the page's, minus `_state` — both states are counted at once so the
--    filter can show each beside its name.
-- ---------------------------------------------------------------------------
create or replace function public.bank_transfer_receipt_counts(
  _academy uuid,
  _search text default null
)
returns table (
  pending_count bigint,
  pending_sen bigint,
  uploaded_count bigint,
  uploaded_sen bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where r.payment_id is null),
    coalesce(sum(p.amount_sen) filter (where r.payment_id is null), 0),
    count(*) filter (where r.payment_id is not null),
    coalesce(sum(p.amount_sen) filter (where r.payment_id is not null), 0)
  from public.payments p
  left join public.payment_receipts r on r.payment_id = p.id
  left join public.invoices i on i.id = p.invoice_id
  left join public.courses c on c.id = i.course_id
  left join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = p.created_by
  where p.academy_id = _academy
    and app.is_admin(_academy)
    and p.method = 'bank_transfer'
    and p.status = 'succeeded'
    and (
      _search is null
      or btrim(_search) = ''
      or position(
           lower(btrim(_search))
           in lower(concat_ws(' ',
             s.full_name, s.student_no, i.invoice_no,
             c.title, pr.full_name, p.note))
         ) > 0
    );
$$;

comment on function public.bank_transfer_receipt_counts(uuid, text)
  is 'Pending and uploaded counts and amounts for bank_transfer_receipts_page. Keep the WHERE clause identical to that function, minus _state.';

revoke all on function public.bank_transfer_receipts_page(uuid, text, text, int, int) from public, anon;
revoke all on function public.bank_transfer_receipt_counts(uuid, text) from public, anon;
grant execute on function public.bank_transfer_receipts_page(uuid, text, text, int, int) to authenticated;
grant execute on function public.bank_transfer_receipt_counts(uuid, text) to authenticated;
