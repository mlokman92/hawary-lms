-- ============================================================================
-- 0011 · Billing → the Payments module. Repoint invoices/payments student_id
--        from profiles to the students table (clears the deferred inconsistency
--        from migration 0006), and auto-generate invoice numbers.
-- ============================================================================

-- Invoice number generator (INV-XXXXXX, unique per academy).
create or replace function app.gen_invoice_no()
returns text language plpgsql volatile set search_path = '' as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  r text := '';
  i int;
begin
  for i in 1..6 loop
    r := r || substr(chars, (floor(random() * length(chars)))::int + 1, 1);
  end loop;
  return 'INV-' || r;
end;
$$;

create or replace function app.set_invoice_no()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate text;
  tries int := 0;
begin
  if new.invoice_no is not null and new.invoice_no <> '' then
    return new;
  end if;
  loop
    candidate := app.gen_invoice_no();
    exit when not exists (
      select 1 from public.invoices i
      where i.academy_id = new.academy_id and i.invoice_no = candidate
    );
    tries := tries + 1;
    if tries > 25 then raise exception 'Could not generate an invoice number'; end if;
  end loop;
  new.invoice_no := candidate;
  return new;
end;
$$;
create trigger set_invoice_no before insert on public.invoices
  for each row execute function app.set_invoice_no();

-- ---------------------------------------------------------------------------
-- Repoint invoices.student_id -> students (was profiles).
-- ---------------------------------------------------------------------------
alter table public.invoices drop constraint invoices_student_id_fkey;
alter table public.invoices
  add constraint invoices_academy_id_student_id_fkey
  foreign key (academy_id, student_id)
  references public.students (academy_id, id) on delete restrict;
create index invoices_academy_student_idx on public.invoices (academy_id, student_id);

drop policy if exists "invoices: staff view all, student view own" on public.invoices;
create policy "invoices: staff view all, student view own"
  on public.invoices for select to authenticated
  using (app.is_staff(academy_id) or app.owns_student(student_id));

drop policy if exists "invoice_items: staff all, student own-invoice" on public.invoice_items;
create policy "invoice_items: staff all, student own-invoice"
  on public.invoice_items for select to authenticated
  using (
    app.is_staff(academy_id)
    or exists (
      select 1 from public.invoices i
      where i.id = invoice_id and app.owns_student(i.student_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Repoint payments.student_id -> students (nullable; null only that column).
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint payments_student_id_fkey;
alter table public.payments
  add constraint payments_academy_id_student_id_fkey
  foreign key (academy_id, student_id)
  references public.students (academy_id, id) on delete set null (student_id);
create index payments_academy_student_idx on public.payments (academy_id, student_id);

drop policy if exists "payments: staff view all, student view own" on public.payments;
create policy "payments: staff view all, student view own"
  on public.payments for select to authenticated
  using (app.is_staff(academy_id) or app.owns_student(student_id));
