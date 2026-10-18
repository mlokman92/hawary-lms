select coalesce(jsonb_agg(x order by x.file_name, x.payment_id), '[]'::jsonb) as rows from (
  select r.payment_id, r.file_path, r.file_name, r.mime_type, r.size_bytes,
         p.amount_sen, (p.paid_at at time zone 'Asia/Kuala_Lumpur')::date as paid_date,
         s.full_name as student, i.invoice_no,
         case when r.confirmed_at is not null then 'checked'
              when cardinality(r.flag_reasons) > 0 then 'flagged' else 'uploaded' end as state
  from public.payment_receipts r
  join public.payments p on p.id = r.payment_id
  left join public.students s on s.id = p.student_id
  left join public.invoices i on i.id = p.invoice_id
  where p.method = 'bank_transfer' and p.status = 'succeeded'
    and p.academy_id = '9c5fd727-65cd-4657-ab4d-fe52fa93d8b7'  -- Hawary Academy, not the store demo (tools/demo-academy)
) x;
