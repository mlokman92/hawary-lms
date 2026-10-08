# Hawary LMS — feature film

A 93-second feature-highlight film of Hawary LMS (web + the two mobile apps),
built as a web page whose whole state is a function of time and rendered to
video frame by frame with real motion blur. Not part of the pnpm workspace:
it has its own `node_modules` (`pnpm --ignore-workspace install`).

The finished film is in `out/`.

## What is real and what is not

- **Every app screen is the real product**, rendered by its own code with a
  fictional academy's worth of data (`cast.json`) and photographed with the
  rect of each element. Course titles, module titles, the academy name and slug
  are real; every person, amount and message is invented.
- **The AI-checked LPKC report is shown as specified by the owner, not as
  shipped.** The film uses the real report thread with "Hawary AI" seeded as the
  reviewer, plus two capture-only touches (an "AI check" badge on its timeline
  entries and an "AI check" column on the `/lpkc` queue) that live in
  `tools/capture/web/variants/`, not in `apps/web`. The product still has a
  human checker.
- The phone lock screen and notification banners are drawn by the film
  (`src/os.ts`) in the platform's style, with the real app icons and the
  product's own notification wording.
- Music and voice are ElevenLabs (track B of four generated; voice "Bella").
  Sound effects are synthesised by `tools/audio/sfx.mjs`.

## Look at it, change it, render it

```bash
pnpm --ignore-workspace dev          # http://127.0.0.1:5330 — scrub and play with sound
node tools/audio/mix.mjs             # rebuild the soundtrack (needs the dev server)
node tools/render.mjs --audio audio/mix.wav --out out/film.mp4   # needs the dev server
node tools/still.mjs --from 0 --to 92.9 --every 1 --sheet film --cols 10 --thumb 384
```

- `src/film.ts` is the edit: scene order, bar-accurate timings, voiceover
  placement, transitions. The track is 120 BPM; one bar is two seconds.
- `src/scenes/*.ts` are the scenes; `src/kit.ts` is the toolbox they share;
  `SCENES.md` is the brief they were built to.
- `audio/` holds the music, the eleven voice lines (`vo/01..11.mp3`), the
  synthesised effects and the mixes. `mix.mjs --no-sfx` gives music + voice only.

## Re-shooting a screen

`tools/capture/` is the film set: a fake Supabase backend (`fake/`), a harness
that serves the real web app with only its Supabase client swapped
(`web/`), and one for the two Expo apps (`mobile/`). `tools/capture/README.md`
has the commands. Nothing in it touches the network or the database.

The mobile harness needs one guarded hook in `apps/mobile/src/lib/supabase.ts`
while an export is being made: `git apply tools/capture/mobile/harness.patch`
(from the repo root, path `video/tools/...`), and `git apply -R` the same patch
when done. It must never be committed.
