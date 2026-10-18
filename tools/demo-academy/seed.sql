-- Hawary Demo Academy — the tenant the App Store and Play reviewers sign in to.
--
-- Builds it from nothing, and rebuilds it the same way: every run first deletes
-- the demo academy (everything hangs off it by academy_id, ON DELETE CASCADE),
-- then seeds it again with dates relative to today. Nothing outside the demo
-- academy is touched, and the run stops if either demo account belongs to any
-- other academy. See README.md beside this file.
--
--   npx -y supabase@latest db query --linked --project-ref vpklztxqkvqmmzsxfqgp -f tools/demo-academy/seed.sql
--
-- One file = one transaction: if anything fails, nothing changes.

-- The n-th weekday from today in Malaysia (negative = back), at a wall-clock time.
create function pg_temp.wd(_n int, _time text) returns timestamptz
language plpgsql as $$
declare
  d date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  step int := case when _n < 0 then -1 else 1 end;
  i int := 0;
begin
  while i < abs(_n) loop
    d := d + step;
    while extract(isodow from d) > 5 loop d := d + step; end loop;
    i := i + 1;
  end loop;
  return (d + _time::time) at time zone 'Asia/Kuala_Lumpur';
end $$;

-- A day relative to today in Malaysia, at a wall-clock time.
create function pg_temp.at(_days int, _time text) returns timestamptz
language sql as $$
  select (((now() at time zone 'Asia/Kuala_Lumpur')::date + _days) + _time::time)
         at time zone 'Asia/Kuala_Lumpur'
$$;

do $$
declare
  A   constant uuid := 'de3a0000-0000-4000-8000-000000000001';
  C   constant uuid := 'de3a0000-0000-4000-8000-0000000000c1';
  M1  constant uuid := 'de3a0000-0000-4000-8000-0000000000d1';
  M2  constant uuid := 'de3a0000-0000-4000-8000-0000000000d2';
  I1  constant uuid := 'de3a0000-0000-4000-8000-000000000101';
  I2  constant uuid := 'de3a0000-0000-4000-8000-000000000102';
  I3  constant uuid := 'de3a0000-0000-4000-8000-000000000103';
  R1  constant uuid := 'de3a0000-0000-4000-8000-000000000301';
  R2  constant uuid := 'de3a0000-0000-4000-8000-000000000302';
  REAL_ACADEMY constant uuid := '9c5fd727-65cd-4657-ab4d-fe52fa93d8b7';
  COURSE_TITLE constant text := 'DKM Prasekolah Siri Demo';
  TZ  constant text := 'Asia/Kuala_Lumpur';
  I1_NAME constant text := 'Puan Norhayati binti Salleh';
  I2_NAME constant text := 'Cik Shahida binti Omar';
  STU_NAME constant text := 'Aina Sofea binti Ahmad';

  v_stu   uuid;
  v_staff uuid;
  v_start date := (now() at time zone 'Asia/Kuala_Lumpur')::date - 45;
  v_issued timestamptz;
  v_ev    uuid;
  v_rep   uuid;
  v_at    timestamptz;
  v_ins   uuid;
  r       record;

  names text[] := array[
    'Nur Aisyah binti Rahman', 'Siti Khadijah binti Kamal', 'Farah Nadia binti Ismail',
    'Tan Mei Ling', 'Lim Hui Wen', 'Kavitha a/p Ramasamy', 'Priya a/p Subramaniam',
    'Nurul Izzah binti Hamzah', 'Wong Jia Yi', 'Aminah binti Yusof', 'Lee Xin Yi',
    'Muhammad Haziq bin Roslan', 'Rohani binti Abdullah'];
  orgs text[] := array[
    'Tadika Seri Mawar', 'Taska Permata Kasih', 'Tadika Bestari', 'Tadika Cahaya Ilmu',
    'Taska Anak Soleh', 'Tadika Pelangi Ceria'];
  topics text[] := array[
    'Permainan blok untuk kemahiran motor halus kanak-kanak 4 hingga 5 tahun',
    'Bercerita dengan boneka untuk meningkatkan kosa kata',
    'Aktiviti muzik dan pergerakan untuk perkembangan motor kasar',
    'Sudut bacaan untuk memupuk minat membaca',
    'Permainan pasir dan air dalam pembelajaran sains awal',
    'Aktiviti kolaj untuk kreativiti kanak-kanak',
    'Rutin harian bergambar untuk kemahiran urus diri',
    'Permainan peranan untuk kemahiran sosial',
    'Aktiviti mengira dengan bahan maujud',
    'Berkebun mini untuk pengenalan alam sekitar',
    'Lagu dan rima untuk kesedaran fonologi',
    'Permainan tradisional untuk motor kasar',
    'Teka-teki gambar untuk penyelesaian masalah'];
begin
  select id into v_stu   from auth.users where lower(email) = 'demo.user@hawary.my';
  select id into v_staff from auth.users where lower(email) = 'demo.staff@hawary.my';
  if v_stu is null or v_staff is null then
    raise exception 'Create demo.user@hawary.my and demo.staff@hawary.my first';
  end if;
  -- The demo is only safe while neither account can see anything real.
  if exists (select 1 from public.academy_members m
              where m.user_id in (v_stu, v_staff) and m.academy_id <> A) then
    raise exception 'A demo account is a member of another academy - stopping';
  end if;

  -- ---------------------------------------------------------------- reset --
  -- invoices.student_id is ON DELETE RESTRICT, so the money goes first.
  delete from public.payments where academy_id = A;
  delete from public.invoices where academy_id = A;
  delete from public.academies where id = A;

  -- -------------------------------------------------------------- academy --
  insert into public.academies (id, name, slug, phone, address, state, country, timezone, logo_url)
  values (A, 'Hawary Demo Academy', 'hawary-demo', '0120000000',
          'No. 1, Jalan Demo 1/1, Taman Demo, 81100 Johor Bahru, Johor', 'Johor', 'MY', TZ,
          (select logo_url from public.academies where id = REAL_ACADEMY));

  update public.profiles set full_name = STU_NAME, phone = '0120000100' where id = v_stu;
  update public.profiles set full_name = 'Demo Admin' where id = v_staff;

  insert into public.academy_members (academy_id, user_id, role, status) values
    (A, v_staff, 'admin', 'active'),
    (A, v_stu, 'student', 'active');

  insert into public.academy_booking_settings
    (academy_id, is_open, slot_minutes, assignment_mode, min_notice_hours, horizon_days,
     max_open_per_student, max_per_week_per_student)
  values (A, true, 60, 'round_robin', 2, 45, 2, null);

  insert into public.booking_hours (academy_id, weekday, start_time, end_time)
  select A, d, h.s, h.e
  from generate_series(1, 5) d,
       (values ('09:00'::time, '13:00'::time), ('14:00'::time, '17:00'::time)) h(s, e);

  -- ---------------------------------------------------------- instructors --
  insert into public.instructors
    (id, academy_id, instructor_no, full_name, gender, phone, specialization, status,
     is_bookable, is_report_checker)
  values
    (I1, A, 'DT-001', I1_NAME, 'female', '0120000201', 'Perkembangan kanak-kanak', 'active', true, true),
    (I2, A, 'DT-002', I2_NAME, 'female', '0120000202', 'Kurikulum prasekolah', 'active', true, true),
    (I3, A, 'DT-003', 'Encik Faizal bin Rahim', 'male', '0120000203', 'Kesihatan dan keselamatan', 'active', true, false);

  -- --------------------------------------------------------------- course --
  insert into public.courses
    (id, academy_id, title, code, description, status, price_sen, start_date, end_date, lpkc_stages)
  values
    (C, A, COURSE_TITLE, 'DKM-DEMO',
     'Diploma Kemahiran Malaysia (DKM) dalam bidang Pengasuhan dan Pendidikan Awal Kanak-Kanak.',
     'published', 250000, v_start, v_start + 182, array['summary', 'report', 'slide']::public.lpkc_stage[]);

  insert into public.course_instructors (academy_id, course_id, instructor_id)
  values (A, C, I1), (A, C, I2);

  insert into public.course_modules (id, academy_id, course_id, title, description, sort_order, is_published)
  values
    (M1, A, C, 'Modul 1: Perkembangan Kanak-Kanak', 'Tahap perkembangan dan cara memerhati.', 0, true),
    (M2, A, C, 'Modul 2: Persekitaran Pembelajaran', 'Susun atur kelas, keselamatan dan rutin.', 1, true);

  insert into public.notes (academy_id, course_id, module_id, title, is_published, sort_order, content)
  values
    (A, C, M1, 'Nota 1: Tahap perkembangan 4 hingga 6 tahun', true, 0,
     '<h2>Tahap perkembangan</h2><p>Kanak-kanak berumur 4 hingga 6 tahun berkembang dalam lima domain: fizikal, kognitif, bahasa, sosio-emosi dan kreativiti.</p><ul><li><strong>Fizikal</strong> — motor kasar (melompat, berlari) dan motor halus (menggunting, memegang pensel).</li><li><strong>Kognitif</strong> — mengelas, menyusun dan mengira objek.</li><li><strong>Bahasa</strong> — bercerita, bertanya dan mengenal huruf.</li><li><strong>Sosio-emosi</strong> — bergilir, berkongsi dan mengurus perasaan.</li></ul><p>Pemerhatian yang baik merekod apa yang dilihat, bukan tafsiran.</p>'),
    (A, C, M1, 'Nota 2: Pemerhatian dan rekod anekdot', true, 1,
     '<h2>Rekod anekdot</h2><p>Catat tarikh, masa, tempat dan tingkah laku kanak-kanak secara objektif.</p><ol><li>Tulis apa yang berlaku, satu ayat setiap tindakan.</li><li>Asingkan fakta daripada ulasan.</li><li>Gunakan rekod untuk merancang aktiviti seterusnya.</li></ol>'),
    (A, C, M2, 'Nota 3: Susun atur kelas prasekolah', true, 0,
     '<h2>Sudut pembelajaran</h2><p>Bahagikan kelas kepada sudut yang jelas: bacaan, seni, blok, sains dan main peranan.</p><p>Pastikan laluan selamat, bahan pada paras mata kanak-kanak dan label bergambar pada setiap rak.</p>'),
    (A, C, M2, 'Nota 4: Keselamatan dan kebersihan', true, 1,
     '<h2>Senarai semak harian</h2><ul><li>Periksa peralatan permainan sebelum digunakan.</li><li>Bahan kimia dan ubat disimpan berkunci.</li><li>Rutin basuh tangan sebelum makan dan selepas ke tandas.</li><li>Nombor kecemasan dipamerkan di pintu kelas.</li></ul>');

  -- ------------------------------------------------------------- students --
  -- Index 0 is the reviewer's own record (demo.user@hawary.my); 1-12 are
  -- invented people with no email and no account, so nothing is ever sent to
  -- them; 13 is a join request waiting to be approved.
  insert into public.students
    (id, academy_id, student_no, full_name, gender, ic_number, date_of_birth, phone, email,
     address, status, user_id, organization, personal_address)
  values
    ('de3a0000-0000-4000-8000-000000000200', A, 'DEMO-0001', STU_NAME, 'female',
     '980214-01-5566', '1998-02-14', '0120000100', 'demo.user@hawary.my',
     'Tadika Demo Ceria, No. 3, Jalan Demo 2/2, Taman Demo, 81100 Johor Bahru, Johor',
     'active', v_stu, 'Tadika Demo Ceria',
     'No. 12, Jalan Demo 2/3, Taman Demo, 81100 Johor Bahru, Johor');

  for i in 1..13 loop
    insert into public.students
      (id, academy_id, student_no, full_name, gender, ic_number, date_of_birth, phone,
       address, status, organization, personal_address)
    values (
      ('de3a0000-0000-4000-8000-0000000002' || lpad(to_hex(i), 2, '0'))::uuid, A,
      'DEMO-' || lpad((i + 1)::text, 4, '0'), names[i],
      case when names[i] like '% bin %' then 'male' else 'female' end::public.gender,
      to_char(date '1988-01-07' + i * 397, 'YYMMDD') || '-01-' || lpad((5000 + i * 137)::text, 4, '0'),
      date '1988-01-07' + i * 397,
      '01200001' || lpad(i::text, 2, '0'),
      orgs[1 + i % 6] || ', Johor Bahru, Johor',
      'active', orgs[1 + i % 6],
      'No. ' || (10 + i) || ', Jalan Demo ' || (1 + i % 4) || '/' || (1 + i % 7) || ', Taman Demo, 81100 Johor Bahru, Johor');
  end loop;

  insert into public.enrollments (academy_id, course_id, student_id, status, enrolled_at, approved_at)
  select A, C, ('de3a0000-0000-4000-8000-0000000002' || lpad(to_hex(i), 2, '0'))::uuid, 'active',
         v_start::timestamptz, v_start::timestamptz
  from generate_series(0, 12) i;

  insert into public.enrollments (academy_id, course_id, student_id, status, enrolled_at)
  values (A, C, 'de3a0000-0000-4000-8000-00000000020d', 'pending', pg_temp.at(-1, '20:15'));

  -- ---------------------------------------------------------------- money --
  v_issued := (v_start + time '10:00') at time zone TZ;
  insert into public.invoices
    (id, academy_id, student_id, invoice_no, status, subtotal_sen, total_sen, issued_at, due_at)
  select ('de3a0000-0000-4000-8000-0000000006' || lpad(to_hex(i), 2, '0'))::uuid, A,
         ('de3a0000-0000-4000-8000-0000000002' || lpad(to_hex(i), 2, '0'))::uuid,
         'DEMO-INV-' || lpad((i + 1)::text, 3, '0'), 'issued', 250000, 250000,
         v_issued, v_issued + interval '90 days'
  from generate_series(0, 12) i;

  insert into public.invoice_items (academy_id, invoice_id, description, quantity, unit_price_sen, amount_sen)
  select A, id, 'Yuran pengajian - ' || COURSE_TITLE, 1, 250000, 250000
  from public.invoices where academy_id = A;

  insert into public.payments
    (academy_id, invoice_id, student_id, amount_sen, method, provider, provider_ref, status, paid_at)
  select A,
         ('de3a0000-0000-4000-8000-0000000006' || lpad(to_hex(v.i), 2, '0'))::uuid,
         ('de3a0000-0000-4000-8000-0000000002' || lpad(to_hex(v.i), 2, '0'))::uuid,
         v.amt, v.method::public.payment_method, v.prov::public.payment_provider,
         case when v.method = 'fpx' then 'DEMO-FPX-' || v.i || '-' || v.d end,
         'succeeded', (v_start + v.d + time '11:30') at time zone TZ
  from (values
    (0, 100000, 'fpx', 'toyyibpay', 3), (0, 150000, 'fpx', 'toyyibpay', 30),
    (1, 250000, 'bank_transfer', 'manual', 5),
    (2, 50000, 'bank_transfer', 'manual', 2), (2, 50000, 'bank_transfer', 'manual', 12),
    (2, 50000, 'bank_transfer', 'manual', 22), (2, 50000, 'bank_transfer', 'manual', 32),
    (2, 50000, 'bank_transfer', 'manual', 42),
    (3, 250000, 'kwsp', 'manual', 20),
    (4, 250000, 'fpx', 'toyyibpay', 1),
    (5, 50000, 'bank_transfer', 'manual', 2), (5, 50000, 'bank_transfer', 'manual', 33),
    (6, 100000, 'fpx', 'toyyibpay', 10),
    (7, 150000, 'bank_transfer', 'manual', 15),
    (8, 50000, 'cash', 'manual', 4)
  ) v(i, amt, method, prov, d);

  -- The invoice and payment notices the triggers just wrote are dated now:
  -- date them when the money moved, and read.
  update public.notifications n
     set created_at = i.issued_at, read_at = i.issued_at + interval '1 day'
    from public.invoices i
   where n.academy_id = A and n.kind = 'invoice_issued'
     and i.id = (n.data ->> 'invoice_id')::uuid;
  update public.notifications n
     set created_at = p.paid_at, read_at = p.paid_at + interval '2 hours'
    from public.payments p
   where n.academy_id = A and n.kind = 'payment_received'
     and p.invoice_id = (n.data ->> 'invoice_id')::uuid
     and p.amount_sen = (n.data ->> 'amount_sen')::int;

  -- --------------------------------------------------------- appointments --
  insert into public.appointments
    (academy_id, instructor_id, student_id, starts_at, ends_at, status, auto_assigned, note)
  select A, v.ins, ('de3a0000-0000-4000-8000-0000000002' || lpad(to_hex(v.i), 2, '0'))::uuid,
         pg_temp.wd(v.d, v.t), pg_temp.wd(v.d, v.t) + interval '1 hour',
         v.st::public.appointment_status, true, v.note
  from (values
    (0, I1, -8, '10:00', 'completed', 'Semakan ringkasan LPKC'),
    (0, I1, 2, '10:00', 'booked', 'Bimbingan Bab 2 laporan LPKC'),
    (1, I1, 1, '09:00', 'booked', null),
    (2, I2, 1, '11:00', 'booked', 'Semakan slaid'),
    (3, I2, 2, '14:00', 'booked', null),
    (4, I1, 3, '09:00', 'booked', 'Bimbingan laporan'),
    (5, I2, 3, '15:00', 'booked', null),
    (6, I3, 4, '10:00', 'booked', null),
    (10, I1, 5, '11:00', 'booked', null),
    (7, I1, -1, '09:00', 'completed', null),
    (8, I2, -1, '14:00', 'completed', 'Semakan ringkasan'),
    (9, I3, -2, '11:00', 'no_show', null)
  ) v(i, ins, d, t, st, note);

  insert into public.notifications (academy_id, user_id, kind, data, created_at)
  select A, v_stu, 'appointment_booked',
         jsonb_build_object('appointment_id', ap.id, 'role', 'student', 'with_name', I1_NAME,
                            'starts_at', ap.starts_at, 'ends_at', ap.ends_at, 'tz', TZ),
         now() - interval '1 day'
  from public.appointments ap
  where ap.academy_id = A and ap.student_id = 'de3a0000-0000-4000-8000-000000000200'
    and ap.status = 'booked';

  -- ----------------------------------------------------------------- LPKC --
  -- The reviewer's own: the summary approved, the report sent back with
  -- changes, the slides not sent yet (so the app offers to send them).
  insert into public.report_submissions
    (id, academy_id, student_id, course_id, instructor_id, lpkc_stage, title,
     introduction, objectives, problem_statement, status, version, auto_assigned,
     submitted_at, reviewed_at, approved_at, created_by)
  values
    (R1, A, 'de3a0000-0000-4000-8000-000000000200', C, I1, 'summary', topics[1],
     'Kemahiran motor halus ialah asas kepada menulis, melukis dan mengurus diri. Projek ini meneliti aktiviti blok berstruktur di dalam kelas prasekolah.',
     '1. Mengenal pasti tahap kemahiran motor halus murid. 2. Melaksanakan aktiviti blok selama empat minggu. 3. Menilai perubahan selepas aktiviti.',
     'Sebahagian murid berumur 4 hingga 5 tahun masih sukar memegang pensel dan menggunting dengan betul.',
     'approved', 1, true,
     (v_start + 18 + time '21:14') at time zone TZ,
     (v_start + 20 + time '10:05') at time zone TZ,
     (v_start + 20 + time '10:05') at time zone TZ, v_stu),
    (R2, A, 'de3a0000-0000-4000-8000-000000000200', C, I1, 'report',
     'LPKC: ' || topics[1], null, null, null, 'changes_requested', 1, true,
     pg_temp.at(-6, '20:40'), pg_temp.at(-5, '11:20'), null, v_stu);

  insert into public.report_events (academy_id, report_id, kind, body, to_status, version, actor_id, actor_name, actor_role, created_at)
  values
    (A, R1, 'submitted', null, 'in_review', 1, v_stu, STU_NAME, 'student', (v_start + 18 + time '21:14') at time zone TZ),
    (A, R1, 'comment', 'Ringkasan jelas dan objektif boleh diukur. Diluluskan - teruskan dengan laporan penuh.',
     'approved', 1, null, I1_NAME, 'instructor', (v_start + 20 + time '10:05') at time zone TZ);

  insert into public.report_events (academy_id, report_id, kind, body, to_status, version, actor_id, actor_name, actor_role, created_at)
  values (A, R2, 'submitted', null, 'in_review', 1, v_stu, STU_NAME, 'student', pg_temp.at(-6, '20:40'))
  returning id into v_ev;
  insert into public.report_files (academy_id, report_id, event_id, version, file_path, file_name, mime_type, size_bytes)
  values (A, R2, v_ev, 1, A || '/' || v_stu || '/de3a0000-0000-4000-8000-000000000501.pdf',
          'LPKC_Aina_Sofea_draf1.pdf', 'application/pdf', 1583);
  insert into public.report_events (academy_id, report_id, kind, body, to_status, version, actor_id, actor_name, actor_role, created_at)
  values (A, R2, 'comment',
          E'Terima kasih, Aina. Beberapa perkara untuk dibaiki:\n1. Bab 2: tambah sekurang-kurangnya tiga rujukan terkini (2020 ke atas).\n2. Bab 3: nyatakan bilangan dan umur murid dalam sampel.\n3. Gunakan format rujukan APA secara konsisten.\nHantar semula versi baharu apabila siap.',
          'changes_requested', 1, null, I1_NAME, 'instructor', pg_temp.at(-5, '11:20'));

  insert into public.notifications (academy_id, user_id, kind, data, created_at, read_at)
  values
    (A, v_stu, 'report_status',
     jsonb_build_object('report_id', R1, 'role', 'student', 'with_name', I1_NAME, 'course', COURSE_TITLE,
                        'title', topics[1], 'status', 'approved'),
     (v_start + 20 + time '10:05') at time zone TZ, (v_start + 20 + time '12:00') at time zone TZ),
    (A, v_stu, 'report_status',
     jsonb_build_object('report_id', R2, 'role', 'student', 'with_name', I1_NAME, 'course', COURSE_TITLE,
                        'title', 'LPKC: ' || topics[1], 'status', 'changes_requested'),
     pg_temp.at(-5, '11:20'), null);

  -- Everybody else's: the academy's queue. (student, part, status, days ago, checker)
  for r in
    select * from (values
      (1, 'summary', 'approved', 30, I1), (1, 'report', 'in_review', 1, I1),
      (2, 'summary', 'in_review', 1, I2),
      (3, 'summary', 'in_review', 2, I1),
      (4, 'report', 'in_review', 3, I2),
      (5, 'summary', 'changes_requested', 4, I2),
      (6, 'summary', 'approved', 35, I1), (6, 'report', 'approved', 12, I1), (6, 'slide', 'in_review', 0, I1),
      (7, 'summary', 'in_review', 0, I2),
      (8, 'report', 'changes_requested', 6, I2)
    ) x(i, stage, status, ago, ins)
  loop
    v_at := pg_temp.at(-r.ago, (8 + (r.i * 3 + r.ago) % 13) || ':' || lpad(((r.i * 17) % 60)::text, 2, '0'));
    insert into public.report_submissions
      (academy_id, student_id, course_id, instructor_id, lpkc_stage, title,
       introduction, objectives, problem_statement, status, version, auto_assigned,
       submitted_at, reviewed_at, approved_at)
    values (
      A, ('de3a0000-0000-4000-8000-0000000002' || lpad(to_hex(r.i), 2, '0'))::uuid, C, r.ins,
      r.stage::public.lpkc_stage,
      case r.stage when 'summary' then topics[r.i + 1]
                   when 'report' then 'LPKC: ' || topics[r.i + 1]
                   else 'Slaid pembentangan: ' || topics[r.i + 1] end,
      case when r.stage = 'summary' then 'Projek ini meneliti ' || lower(topics[r.i + 1]) || ' di ' || orgs[1 + r.i % 6] || '.' end,
      case when r.stage = 'summary' then '1. Mengenal pasti tahap semasa murid. 2. Melaksanakan aktiviti selama empat minggu. 3. Menilai perubahan selepas aktiviti.' end,
      case when r.stage = 'summary' then 'Murid memerlukan lebih banyak peluang belajar melalui aktiviti yang terancang.' end,
      r.status::public.report_status, 1, true, v_at,
      case when r.status <> 'in_review' then v_at + interval '1 day' end,
      case when r.status = 'approved' then v_at + interval '1 day' end)
    returning id into v_rep;

    insert into public.report_events (academy_id, report_id, kind, to_status, version, actor_name, actor_role, created_at)
    values (A, v_rep, 'submitted', 'in_review', 1, names[r.i], 'student', v_at)
    returning id into v_ev;

    if r.stage <> 'summary' then
      insert into public.report_files (academy_id, report_id, event_id, version, file_path, file_name, mime_type, size_bytes)
      values (A, v_rep, v_ev, 1,
              A || '/samples/' || case when r.stage = 'report' then 'report.pdf' else 'slides.pdf' end,
              case when r.stage = 'report' then 'LPKC_' else 'Slaid_' end
                || replace(split_part(names[r.i], ' ', 1), '/', '') || '.pdf',
              'application/pdf', case when r.stage = 'report' then 1583 else 1255 end);
    end if;

    if r.status <> 'in_review' then
      insert into public.report_events (academy_id, report_id, kind, body, to_status, version, actor_name, actor_role, created_at)
      values (A, v_rep, 'comment',
              case when r.status = 'approved' then 'Bagus, semua bahagian lengkap. Diluluskan.'
                   else 'Sila kemas kini objektif supaya boleh diukur dan tambah satu contoh aktiviti.' end,
              r.status::public.report_status, 1,
              case when r.ins = I1 then I1_NAME else I2_NAME end, 'instructor', v_at + interval '1 day');
    else
      -- What lands on the admin's bell when a report comes in.
      insert into public.notifications (academy_id, user_id, kind, data, created_at, read_at)
      values (A, v_staff, 'report_submitted',
              jsonb_build_object('report_id', v_rep, 'role', 'instructor', 'with_name', names[r.i],
                                 'course', COURSE_TITLE,
                                 'title', case r.stage when 'summary' then topics[r.i + 1]
                                               when 'report' then 'LPKC: ' || topics[r.i + 1]
                                               else 'Slaid pembentangan: ' || topics[r.i + 1] end,
                                 'status', 'in_review'),
              v_at, case when r.ago > 1 then v_at + interval '3 hours' end);
    end if;
  end loop;

  -- -------------------------------------------------------- announcements --
  insert into public.announcements (id, academy_id, course_id, title, body, author_name, created_at)
  values
    ('de3a0000-0000-4000-8000-000000000701', A, null, 'Selamat datang ke Hawary Demo Academy',
     'Semua kelas, nota dan janji temu anda ada dalam aplikasi ini. Hubungi kami melalui WhatsApp jika memerlukan bantuan.',
     'Demo Admin', (v_start + time '09:00') at time zone TZ),
    ('de3a0000-0000-4000-8000-000000000702', A, C, 'Bimbingan LPKC minggu ini',
     'Sesi bimbingan LPKC dibuka Isnin hingga Jumaat, 9 pagi hingga 5 petang. Tempah slot anda di tab Appointments.',
     'Demo Admin', pg_temp.at(-2, '09:30'));

  insert into public.notifications (academy_id, user_id, kind, data, created_at, read_at)
  values (A, v_stu, 'announcement',
          jsonb_build_object('announcement_id', 'de3a0000-0000-4000-8000-000000000702', 'title', 'Bimbingan LPKC minggu ini',
                             'preview', 'Sesi bimbingan LPKC dibuka Isnin hingga Jumaat, 9 pagi hingga 5 petang. Tempah slot anda di tab Appointments.',
                             'course', COURSE_TITLE, 'author', 'Demo Admin'),
          pg_temp.at(-2, '09:30'), null);
end $$;

-- What was built.
select
  (select count(*) from public.students where academy_id = 'de3a0000-0000-4000-8000-000000000001') as students,
  (select count(*) from public.invoices where academy_id = 'de3a0000-0000-4000-8000-000000000001') as invoices,
  (select count(*) from public.payments where academy_id = 'de3a0000-0000-4000-8000-000000000001') as payments,
  (select count(*) from public.appointments where academy_id = 'de3a0000-0000-4000-8000-000000000001') as appointments,
  (select count(*) from public.report_submissions where academy_id = 'de3a0000-0000-4000-8000-000000000001') as reports,
  (select count(*) from public.notifications where academy_id = 'de3a0000-0000-4000-8000-000000000001') as notifications;
