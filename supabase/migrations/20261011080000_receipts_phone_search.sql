-- The receipts queue can be searched by phone number.
--
-- A receipt arrives by WhatsApp from a number, and often the number is all
-- the admin has to go on: the banking screenshot shows the payer's bank, not
-- which student they are. So the queue's search — name, student number,
-- invoice, course, recorder, note — also takes a phone number.
--
-- Phone numbers are matched **digits to digits**, never as text. The same
-- number is stored and typed half a dozen ways — 0123456789, 012-345 6789,
-- +60 12-345 6789, 60123456789 — and a text search finds only the spelling
-- that happens to be on the record.

-- ---------------------------------------------------------------------------
-- 1. The needle.
--
--    NULL unless the search *looks like* a phone number: only digits, spaces
--    and + - ( ), and at least four digits once the prefix is off. That guard
--    is the point — without it "siri 2" would match every student whose number
--    has a 2 in it.
--
--    The leading 60 or 0 is dropped, because that is where two spellings of
--    one Malaysian number differ: 0123456789 and 60123456789 both contain
--    123456789, and so does whatever the admin types.
-- ---------------------------------------------------------------------------
create or replace function app.phone_needle(_search text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(_search, '')) ~ '^[0-9+() -]+$'
     and length(regexp_replace(regexp_replace(_search, '\D', '', 'g'), '^(60|0)', '')) >= 4
    then regexp_replace(regexp_replace(_search, '\D', '', 'g'), '^(60|0)', '')
  end;
$$;

comment on function app.phone_needle(text)
  is 'The digits to look for when a search box holds a phone number, with the leading 60/0 dropped; NULL when the text is not a phone number.';

-- ---------------------------------------------------------------------------
-- 2. Both receipts functions take it. Their WHERE clauses must stay the same
--    as each other, minus `_state`. Signatures and row types are unchanged.
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
