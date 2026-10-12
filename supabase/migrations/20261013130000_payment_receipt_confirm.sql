-- Confirming a bank transfer receipt.
--
-- An uploaded receipt is still only what an admin attached. The owner wants a
-- second pair of eyes: a Director looks at the receipt and confirms it. So a
-- bank transfer is now in one of three places — **pending** (no receipt),
-- **uploaded** (a receipt, not yet confirmed) and **confirmed**.
--
-- Confirming is a fact about the paperwork, like pending was at first. It moves
-- no money: `payments.has_receipt` is what makes a transfer collected, and that
-- is true from the upload. Nothing here touches `payments` or `invoices`.

-- ---------------------------------------------------------------------------
-- 1. Who confirmed, and when.
--
--    On the receipt, not the payment: it is the receipt that was looked at.
--    The name is a snapshot for the reason `uploaded_by_name` is.
-- ---------------------------------------------------------------------------
alter table public.payment_receipts
  add column if not exists confirmed_at      timestamptz,
  add column if not exists confirmed_by      uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_by_name text;

comment on column public.payment_receipts.confirmed_at is
  'When a Director confirmed this receipt. NULL is uploaded but not confirmed. Written only by confirm_payment_receipt; cleared when the file is replaced.';

-- ---------------------------------------------------------------------------
-- 2. A replaced receipt is a different document.
--
--    The Edge Function replaces by upserting the row, which leaves every
--    column it does not name as it was — so without this a confirmation would
--    carry over to a file nobody has looked at. A trigger rather than a change
--    to the function, so the rule holds for every writer.
-- ---------------------------------------------------------------------------
create or replace function app.reset_receipt_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.file_path is distinct from old.file_path then
    new.confirmed_at := null;
    new.confirmed_by := null;
    new.confirmed_by_name := null;
  end if;
  return new;
end;
$$;

create or replace trigger payment_receipts_reset_confirmation
  before update on public.payment_receipts
  for each row execute function app.reset_receipt_confirmation();

-- ---------------------------------------------------------------------------
-- 3. Confirm.
--
--    Directors only (a system admin is a Director). SECURITY DEFINER because
--    clients have no DML on `payment_receipts`; the academy is read from the
--    receipt, never from the caller. "No such receipt" and "not yours to
--    confirm" are the same answer.
--
--    Confirming twice keeps the first confirmation: the second caller finds
--    the work done, not their name over somebody else's.
--
--    The UPDATE fires `app.sync_payment_receipt`, whose own UPDATE of
--    `payments` is guarded by `not has_receipt` and so matches nothing — the
--    money trigger is not reached.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_payment_receipt(_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := (select auth.uid());
  _academy uuid;
begin
  select r.academy_id into _academy
    from public.payment_receipts r
   where r.payment_id = _payment;

  if _academy is null or not app.is_director(_academy) then
    raise exception 'No such receipt';
  end if;

  update public.payment_receipts r
     set confirmed_at = now(),
         confirmed_by = _uid,
         confirmed_by_name = coalesce(
           (select nullif(btrim(pf.full_name), '')
              from public.profiles pf where pf.id = _uid),
           (select auth.jwt() ->> 'email'))
   where r.payment_id = _payment
     and r.confirmed_at is null;
end;
$$;

comment on function public.confirm_payment_receipt(uuid) is
  'Mark a bank transfer receipt as confirmed. Directors of the receipt''s academy only.';

revoke all on function public.confirm_payment_receipt(uuid) from public, anon;
grant execute on function public.confirm_payment_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The page and its counts, with the third state.
--
--    `_state` is 'pending', 'uploaded', 'confirmed' or NULL for all three, and
--    'uploaded' means uploaded and NOT confirmed — the three are slices, so
--    the cards add up to every bank transfer.
--
--    New functions, not new versions of `bank_transfer_receipts_page` and
--    `bank_transfer_receipt_counts`: both return more columns than those do,
--    which CREATE OR REPLACE cannot change, and a web build deployed before
--    this one still calls the old pair. They are left as they are — to them
--    'uploaded' is still "has a receipt" — and are dead once the web that
--    calls `receipt_queue_*` is deployed.
-- ---------------------------------------------------------------------------
create function public.receipt_queue_page(
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
  receipt_uploaded_by_name text,
  receipt_confirmed_at timestamptz,
  receipt_confirmed_by_name text
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
    r.uploaded_by_name,
    r.confirmed_at,
    r.confirmed_by_name
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
          when 'uploaded' then r.payment_id is not null and r.confirmed_at is null
          when 'confirmed' then r.confirmed_at is not null
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
      -- A phone number, compared digits to digits: see app.phone_needle.
      or (
        app.phone_needle(_search) is not null
        and position(
              app.phone_needle(_search)
              in regexp_replace(coalesce(s.phone, ''), '\D', '', 'g')
            ) > 0
      )
    )
  -- `id` last: OFFSET paging over a non-unique sort repeats one row and skips
  -- another.
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.receipt_queue_page(uuid, text, text, int, int)
  is 'One page of succeeded bank-transfer payments with their receipt, if any. _state: pending | uploaded | confirmed | NULL for all. Admin only.';

create function public.receipt_queue_counts(
  _academy uuid,
  _search text default null
)
returns table (
  pending_count bigint,
  pending_sen bigint,
  uploaded_count bigint,
  uploaded_sen bigint,
  confirmed_count bigint,
  confirmed_sen bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where r.payment_id is null),
    coalesce(sum(p.amount_sen) filter (where r.payment_id is null), 0),
    count(*) filter (where r.payment_id is not null and r.confirmed_at is null),
    coalesce(sum(p.amount_sen) filter (
      where r.payment_id is not null and r.confirmed_at is null), 0),
    count(*) filter (where r.confirmed_at is not null),
    coalesce(sum(p.amount_sen) filter (where r.confirmed_at is not null), 0)
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
      -- A phone number, compared digits to digits: see app.phone_needle.
      or (
        app.phone_needle(_search) is not null
        and position(
              app.phone_needle(_search)
              in regexp_replace(coalesce(s.phone, ''), '\D', '', 'g')
            ) > 0
      )
    );
$$;

comment on function public.receipt_queue_counts(uuid, text)
  is 'Pending, uploaded and confirmed counts and amounts for receipt_queue_page. Keep the WHERE clause identical to that function, minus _state.';

revoke all on function public.receipt_queue_page(uuid, text, text, int, int) from public, anon;
revoke all on function public.receipt_queue_counts(uuid, text) from public, anon;
grant execute on function public.receipt_queue_page(uuid, text, text, int, int) to authenticated;
grant execute on function public.receipt_queue_counts(uuid, text) to authenticated;
