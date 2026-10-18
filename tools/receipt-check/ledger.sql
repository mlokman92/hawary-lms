select coalesce(jsonb_agg(x), '[]'::jsonb) as rows from (
  select p.id as payment_id, p.student_id, p.amount_sen, p.has_receipt,
         (p.paid_at at time zone 'Asia/Kuala_Lumpur')::date as paid_date,
         s.full_name as student, s.organization, i.course_id
  from public.payments p
  left join public.students s on s.id = p.student_id
  left join public.invoices i on i.id = p.invoice_id
  where p.method = 'bank_transfer' and p.status = 'succeeded'
    and p.academy_id = '9c5fd727-65cd-4657-ab4d-fe52fa93d8b7'  -- Hawary Academy, not the store demo (tools/demo-academy)
) x;
