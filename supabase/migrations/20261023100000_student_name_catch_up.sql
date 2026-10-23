-- Catch up the renames that happened before the profile name followed through.
--
-- `20261014150000_student_name_follows_profile` moves a student's own rename
-- onto their record, but only from the moment of the change. A student who had
-- already corrected their profile name before that kept the old name on their
-- record — and on their offer letter — and saving the profile again did not
-- help, because an unchanged name is not a change.
--
-- This applies the rule once to those renames: a record still carrying exactly
-- the name its account signed up with (so the student typed it, not staff)
-- takes the profile's name when the two now differ. A record staff renamed is
-- left alone, as the trigger would have left it.

update public.students s
  set full_name = btrim(p.full_name)
from public.profiles p, auth.users u
where p.id = s.user_id
  and u.id = s.user_id
  and coalesce(btrim(p.full_name), '') <> ''
  and btrim(p.full_name) is distinct from btrim(s.full_name)
  and btrim(s.full_name) = btrim(u.raw_user_meta_data->>'full_name');
