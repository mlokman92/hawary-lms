-- The LPKC report takes one document per send.
--
-- Students were sending the report together with their slides (exported to
-- PDF) or their summary, so a report version held two or three files and the
-- checker had to work out which was the report. One file per send leaves no
-- room for that. A send that carries a file is a version of its own, so this is
-- one document per version. The kinds are unchanged: the report still takes a
-- PDF or Word document only, never a PowerPoint.
--
-- Checked in app.assert_lpkc_files, so it holds on every door a student's file
-- comes through (the three submit_report overloads and comment_on_report),
-- including the mobile builds already installed. Staff are not limited.
--
-- Full note: docs/report-checks.md -> "What each part takes".

create or replace function app.assert_lpkc_files(_stage public.lpkc_stage, _files jsonb)
returns void
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_ext text;
begin
  if _files is null
     or jsonb_typeof(_files) <> 'array'
     or jsonb_array_length(_files) = 0 then
    return;
  end if;

  if _stage = 'summary' then
    raise exception 'The LPKC summary takes no documents';
  end if;

  if _stage = 'report' and jsonb_array_length(_files) > 1 then
    raise exception 'The LPKC report takes one document';
  end if;

  -- By the name's extension: it is what the checker downloads and opens. The
  -- browser's mime type for a .docx or .pptx varies by machine, the name does
  -- not.
  for v_ext in
    select coalesce(
             lower(substring(btrim(f ->> 'name') from '\.([A-Za-z0-9]+)$')),
             ''
           )
    from jsonb_array_elements(_files) f
  loop
    if _stage = 'report' and v_ext not in ('pdf', 'doc', 'docx') then
      raise exception 'The LPKC report takes a PDF or Word document';
    end if;
    if _stage = 'slide' and v_ext not in ('pdf', 'ppt', 'pptx') then
      raise exception 'The LPKC slides take a PowerPoint or PDF file';
    end if;
  end loop;
end;
$$;
