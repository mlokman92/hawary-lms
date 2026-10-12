-- The receipts queue, oldest first as well as newest.
--
-- The queue is worked from the top, and "the top" is not always the payment
-- typed in last: a Director clearing a backlog starts from the oldest. `_sort`
-- is 'newest' (the default, what the page did before) or 'oldest', both by
-- when the payment was recorded — the date the first column shows.
--
-- A sixth argument is a new function to PostgREST, and a call that left
-- `_sort` out would match both — so the five-argument version is renamed
-- aside (`_v2`) rather than left as an overload. Nothing deployed calls it.

alter function public.receipt_queue_page(uuid, text, text, int, int)
  rename to receipt_queue_page_v2;

create function public.receipt_queue_page(
  _academy uuid,
  _state text default null,
  _search text default null,
  _limit int default 50,
  _offset int default 0,
  _sort text default 'newest'
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
  receipt_confirmed_by_name text,
  receipt_flag_reasons text[],
  receipt_flagged_at timestamptz,
  receipt_flagged_by_name text
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
    r.confirmed_by_name,
    r.flag_reasons,
    r.flagged_at,
    r.flagged_by_name
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
                               and r.confirmed_at is null
                               and cardinality(r.flag_reasons) = 0
          when 'flagged' then cardinality(r.flag_reasons) > 0
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
  -- `id` last in either direction: OFFSET paging over a non-unique sort
  -- repeats one row and skips another. A CASE here cannot use an index, which
  -- the search above could not either; this is a few thousand rows.
  order by
    case when _sort = 'oldest' then p.created_at end asc,
    case when _sort = 'oldest' then p.id end asc,
    p.created_at desc,
    p.id desc
  limit greatest(1, least(coalesce(_limit, 50), 200))
  offset greatest(0, coalesce(_offset, 0));
$$;

comment on function public.receipt_queue_page(uuid, text, text, int, int, text)
  is 'One page of succeeded bank-transfer payments with their receipt, if any. _state: pending | uploaded | flagged | confirmed | NULL for all. _sort: newest (default) | oldest, by when the payment was recorded. Admin only.';

revoke all on function public.receipt_queue_page(uuid, text, text, int, int, text) from public, anon;
grant execute on function public.receipt_queue_page(uuid, text, text, int, int, text) to authenticated;
