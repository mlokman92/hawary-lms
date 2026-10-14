-- A student's own rename reaches their record.
--
-- `/learn/profile` (and the Student app) writes `profiles.full_name`; the
-- offer letter, invoices and every staff screen read `students.full_name`.
-- Until now the profile trigger only filled a *blank* record name, so a
-- student who corrected their name saw it change on their page and nowhere
-- else — and their offer letter kept printing the old one.
--
-- Now: when the profile's name changes to something non-blank, every student
-- record linked to that account takes it. Only a change moves it (the trigger's
-- WHEN already requires one column to move, and the CASE below checks the name
-- itself), so a phone-only save never overwrites a name staff typed since.
--
-- Unchanged: instructors are still fill-blank only, and phone is still
-- fill-blank only on both tables. See docs/account-claiming.md.

create or replace function app.sync_profile_identity()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  renamed boolean := new.full_name is distinct from old.full_name
                     and coalesce(btrim(new.full_name), '') <> '';
begin
  update public.students
    set full_name = case
          when renamed or coalesce(btrim(full_name), '') = ''
          then nullif(btrim(new.full_name), '')
          else full_name end,
        phone = case
          when coalesce(btrim(phone), '') = ''
          then nullif(btrim(new.phone), '')
          else phone end
    where user_id = new.id
      and (renamed
           or coalesce(btrim(full_name), '') = ''
           or coalesce(btrim(phone), '') = '');

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
