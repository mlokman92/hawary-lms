-- ============================================================================
-- 0004 · Billing: invoices, invoice items, payments. Money is stored as
--        integer sen (1 MYR = 100 sen). Online payments are recorded by an
--        Edge Function using the service role (bypasses RLS).
-- ============================================================================

create type public.invoice_status   as enum ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled');
create type public.payment_status   as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.payment_method   as enum ('cash', 'bank_transfer', 'fpx', 'card', 'ewallet', 'other');
create type public.payment_provider as enum ('manual', 'billplz', 'toyyibpay', 'stripe');

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete restrict,
  enrollment_id   uuid,
  invoice_no      text not null,
  status          public.invoice_status not null default 'draft',
  currency        text not null default 'MYR',
  subtotal_sen    integer not null default 0 check (subtotal_sen >= 0),
  tax_sen         integer not null default 0 check (tax_sen >= 0),   -- SST
  total_sen       integer not null default 0 check (total_sen >= 0),
  amount_paid_sen integer not null default 0 check (amount_paid_sen >= 0),
  issued_at       timestamptz,
  due_at          timestamptz,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (academy_id, invoice_no),
  unique (academy_id, id),
  -- SET NULL only the nullable enrollment_id (PG15+ column-list syntax); nulling
  -- the whole key would violate the NOT NULL on academy_id and block deletes.
  foreign key (academy_id, enrollment_id)
    references public.enrollments (academy_id, id) on delete set null (enrollment_id)
);
create index invoices_academy_id_idx    on public.invoices (academy_id);
create index invoices_student_id_idx     on public.invoices (student_id);
create index invoices_enrollment_id_idx  on public.invoices (enrollment_id);
create index invoices_created_by_idx     on public.invoices (created_by);
create trigger set_updated_at before update on public.invoices
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invoice line items
-- ---------------------------------------------------------------------------
create table public.invoice_items (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  invoice_id     uuid not null,
  description    text not null,
  quantity       integer not null default 1 check (quantity > 0),
  unit_price_sen integer not null default 0 check (unit_price_sen >= 0),
  amount_sen     integer not null default 0 check (amount_sen >= 0),
  created_at     timestamptz not null default now(),
  foreign key (academy_id, invoice_id)
    references public.invoices (academy_id, id) on delete cascade
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index invoice_items_academy_id_idx  on public.invoice_items (academy_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  invoice_id   uuid not null,
  student_id   uuid references public.profiles(id) on delete set null,
  amount_sen   integer not null check (amount_sen > 0),
  currency     text not null default 'MYR',
  method       public.payment_method not null default 'other',
  provider     public.payment_provider not null default 'manual',
  provider_ref text,                                   -- gateway transaction id
  status       public.payment_status not null default 'pending',
  paid_at      timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- RESTRICT: never let an invoice with recorded payments be hard-deleted and
  -- silently destroy the money/audit trail. Void the invoice (status) instead.
  foreign key (academy_id, invoice_id)
    references public.invoices (academy_id, id) on delete restrict
);
create index payments_invoice_id_idx on public.payments (invoice_id);
create index payments_academy_id_idx  on public.payments (academy_id);
create index payments_student_id_idx  on public.payments (student_id);
create index payments_created_by_idx  on public.payments (created_by);
-- Idempotency: a retried gateway webhook (same provider + provider_ref) must
-- conflict rather than insert a duplicate payment. Manual/cash rows (null ref)
-- are unconstrained.
create unique index payments_provider_ref_key
  on public.payments (academy_id, provider, provider_ref)
  where provider_ref is not null;
create trigger set_updated_at before update on public.payments
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS  (billing is an admin function; students may read their own records)
-- ---------------------------------------------------------------------------
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments      enable row level security;

-- invoices ------------------------------------------------------------------
create policy "invoices: staff view all, student view own"
  on public.invoices for select to authenticated
  using (app.is_staff(academy_id) or student_id = (select auth.uid()));
create policy "invoices: admin insert" on public.invoices for insert to authenticated
  with check (app.is_admin(academy_id));
create policy "invoices: admin update" on public.invoices for update to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));
create policy "invoices: admin delete" on public.invoices for delete to authenticated
  using (app.is_admin(academy_id));

-- invoice_items -------------------------------------------------------------
create policy "invoice_items: staff all, student own-invoice"
  on public.invoice_items for select to authenticated
  using (
    app.is_staff(academy_id)
    or exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.student_id = (select auth.uid())
    )
  );
create policy "invoice_items: admin insert" on public.invoice_items for insert to authenticated
  with check (app.is_admin(academy_id));
create policy "invoice_items: admin update" on public.invoice_items for update to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));
create policy "invoice_items: admin delete" on public.invoice_items for delete to authenticated
  using (app.is_admin(academy_id));

-- payments ------------------------------------------------------------------
create policy "payments: staff view all, student view own"
  on public.payments for select to authenticated
  using (app.is_staff(academy_id) or student_id = (select auth.uid()));
create policy "payments: admin insert" on public.payments for insert to authenticated
  with check (app.is_admin(academy_id));
create policy "payments: admin update" on public.payments for update to authenticated
  using (app.is_admin(academy_id)) with check (app.is_admin(academy_id));
create policy "payments: admin delete" on public.payments for delete to authenticated
  using (app.is_admin(academy_id));
