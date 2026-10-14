-- A private copy of what the 15 Oct 2026 thread reset removed.
--
-- The owner reset every LPKC thread to its first submission: each thread keeps
-- only its earliest `submitted` entry (and that entry's files), goes back to
-- version 1, in_review, and reads as moderating — as if the student had just
-- sent it. Every later entry (replies, staff-only entries, resends) and its
-- file rows were removed. They are kept here, unreadable by any client, so any
-- of it can be put back. The storage objects themselves were not touched.
--
-- The reset itself is data, run once alongside this file; see
-- docs/report-checks.md -> "The reset of 15 Oct 2026".

create table app.report_events_reset_20261015 (
  like public.report_events including defaults,
  reset_at timestamptz not null default now()
);

create table app.report_files_reset_20261015 (
  like public.report_files including defaults,
  reset_at timestamptz not null default now()
);

-- What each thread looked like before it was put back to version 1.
create table app.report_submissions_reset_20261015 (
  like public.report_submissions including defaults,
  reset_at timestamptz not null default now()
);

alter table app.report_events_reset_20261015 enable row level security;
alter table app.report_files_reset_20261015 enable row level security;
alter table app.report_submissions_reset_20261015 enable row level security;

revoke all on app.report_events_reset_20261015 from public, anon, authenticated;
revoke all on app.report_files_reset_20261015 from public, anon, authenticated;
revoke all on app.report_submissions_reset_20261015 from public, anon, authenticated;
