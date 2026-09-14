-- Phone joins name in the identity triggers -- for blanks only.
--
-- docs/account-claiming.md said "name only", and the reason it gave still
-- holds for every case it was about: 338 linked student/profile pairs in this
-- database disagree about phone, and `create-bill` sets ToyyibPay's
-- `billPayorInfo` when name + email + phone are all present, which LOCKS those
-- fields on the FPX page. Backfilling a stale self-service number over one
-- staff typed would quietly take the payer's correction away.
--
-- None of that applies to a BLANK. An empty phone locks nothing (billPayorInfo
-- needs all three present, so it was never being set), overwrites nothing, and
-- contradicts no value staff chose. It is the doc's own first rule -- "fill
-- blanks, never rename" -- applied to the other column.
--
-- What forced this: a student who adds their phone on /learn/profile writes
-- `profiles` only, and the academy reads `students`. One real student did
-- exactly that and her number sat invisible to the admin for three weeks. The
-- trigger below could not have caught it even in spirit: it was `AFTER UPDATE
-- OF full_name` with a WHEN clause on the name changing, so a phone-only save
-- did not fire it at all.
create or replace function app.sync_profile_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- One statement per table, CASE per column: the two columns are filled
  -- independently, so a profile that supplies a phone must not blank or
  -- rewrite a name that is already there (and the reverse).
  update public.students
    set full_name = case
          when coalesce(btrim(full_name), '') = ''
          then nullif(btrim(new.full_name), '')
          else full_name end,
        phone = case
          when coalesce(btrim(phone), '') = ''
          then nullif(btrim(new.phone), '')
          else phone end
    where user_id = new.id
      and (coalesce(btrim(full_name), '') = '' or coalesce(btrim(phone), '') = '');

  update public.instructors
    set full_name = case
          when coalesce(btrim(full_name), '') = ''
          then nullif(btrim(new.full_name), '')
          else full_name end,
        phone = case
          when coalesce(btrim(phone), '') = ''
          then nullif(btrim(new.phone), '')
          else phone end
    where user_id = new.id
      and (coalesce(btrim(full_name), '') = '' or coalesce(btrim(phone), '') = '');

  return null;
end;
$function$;

-- `UPDATE OF full_name, phone` and a WHEN clause that accepts EITHER column
-- moving. Still guarded on a real change to a non-blank value, for the reason
-- the original gave: `UPDATE OF` fires on assignment, not on change, and
-- useUpdateMyProfile writes both columns on every save.
drop trigger if exists sync_profile_identity on public.profiles;
create trigger sync_profile_identity
  after update of full_name, phone on public.profiles
  for each row
  when (
    (new.full_name is distinct from old.full_name
     and coalesce(btrim(new.full_name), '') <> '')
    or
    (new.phone is distinct from old.phone
     and coalesce(btrim(new.phone), '') <> '')
  )
  execute function app.sync_profile_identity();

-- Link time, same rule. This is the arm that covers an adopted record: staff
-- create a student with no phone, the person claims it by confirmed email, and
-- `app.link_claimed_record` writes `user_id` without touching anything else.
create or replace function app.fill_record_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name  text;
  v_phone text;
begin
  if new.user_id is not null
     and (coalesce(btrim(new.full_name), '') = '' or coalesce(btrim(new.phone), '') = '')
  then
    select nullif(btrim(p.full_name), ''), nullif(btrim(p.phone), '')
      into v_name, v_phone
      from public.profiles p
      where p.id = new.user_id;

    if coalesce(btrim(new.full_name), '') = '' and v_name is not null then
      new.full_name := v_name;
    end if;
    if coalesce(btrim(new.phone), '') = '' and v_phone is not null then
      new.phone := v_phone;
    end if;
  end if;
  return new;
end;
$function$;

-- One-time backfill of what the gap already stranded. Blank record + non-blank
-- profile only, so none of the 338 disagreeing pairs is touched.
update public.students s
set phone = nullif(btrim(p.phone), '')
from public.profiles p
where p.id = s.user_id
  and coalesce(btrim(s.phone), '') = ''
  and coalesce(btrim(p.phone), '') <> '';

update public.instructors i
set phone = nullif(btrim(p.phone), '')
from public.profiles p
where p.id = i.user_id
  and coalesce(btrim(i.phone), '') = ''
  and coalesce(btrim(p.phone), '') <> '';
