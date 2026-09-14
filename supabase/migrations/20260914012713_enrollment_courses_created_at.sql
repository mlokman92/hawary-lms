-- `/enroll/:slug` preselects the newest open course — the current intake is what
-- almost everyone arriving on the link has come for, and a radio group with
-- nothing chosen makes them pick before the button does anything.
--
-- "Newest" has to be a real fact, not a guess from the list order: the courses
-- come back `order by c.title`, and DKM1/DKM2/DKM3 only happen to sort into
-- intake order. A 2027 intake titled differently would break that silently and
-- preselect the wrong course, which is worse than preselecting none.
--
-- Display order stays by title. Only the field is new.
create or replace function public.get_academy_enrollment(_slug text)
 returns json
 language sql
 stable security definer
 set search_path to ''
as $function$
  select json_build_object(
    'academy', json_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug, 'logo_url', a.logo_url
    ),
    'is_open', coalesce(s.is_open, false),
    'intro', s.intro,
    'courses', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'code', c.code,
        'description', c.description, 'price_sen', c.price_sen,
        'currency', c.currency, 'capacity', cs.capacity,
        'seats_taken', app.course_seats_taken(c.id), 'closes_at', cs.closes_at,
        'created_at', c.created_at
      ) order by c.title)
      from public.courses c
      join public.course_enrollment_settings cs on cs.course_id = c.id
      where c.academy_id = a.id and app.enrollment_open(c.id)
    ), '[]'::json)
  )
  from public.academies a
  left join public.academy_enrollment_settings s on s.academy_id = a.id
  where lower(a.slug) = lower(btrim(_slug)) and a.status = 'active';
$function$;
