# Building a scene

The film is a web page: one 1920x1080 stage whose whole state is a function of
time. A renderer seeks it frame by frame (with real motion blur) and encodes
video. A scene is one TypeScript module that lays out elements and puts motion
on a timeline. Read `src/kit.ts` (the toolbox, every function documented) and
`src/scenes/courses.ts` (the reference scene) before writing anything.

## The film

A 93-second feature film for **Hawary LMS** — the learning platform of Hawary
Academy, a Malaysian TVET academy (web back-office, learner web, a Student app
and an Academy app). Light, clean, confident. It must look like a studio made
it, not like a screen recording.

**The idea: "through the arch".** The logo is a teal arch with an amber dot
under it. The film opens by walking through the arch, and the amber dot is the
guide: amber is used for the dot and for at most ONE thing per scene that the
eye must find. Teal is the brand's working colour (accents, chips, rings).
Everything else is ink on paper.

**Real UI.** Every screen in the film is a screenshot of the real product,
rendered by its own code with fictional data (`cast.json`), captured with the
rect of every element (`public/shots/<surface>/<id>.png` + `.json`). We do not
redraw the product. We *direct* it: frame it, push in on it, lift real pieces
out of it, click it, change its state by cutting between pixel-aligned shots.
Motion-graphics elements we add (type, chips, lines, the dot) must look like
film graphics, never like fake UI. The one exception is OS chrome the product
does not own (a phone's lock screen, a native notification banner), which we
draw ourselves in the platform's style.

**Rules from the owner:** real UI, real course name (`DKM Prasekolah Siri
3/2026`), made-up people and messages only (use the cast), light mode.

## Music and time

The track is 120 BPM: a beat is 0.5 s, a bar is 2 s, and every scene starts on a
bar line. Your scene gets `B(n)`: the timeline position `n` beats after your
scene's downbeat. **Every event sits on the grid**: big moves and cuts on beats
(0, 1, 2…), accents on half-beats, flurries on quarter-beats (`B(4.25)`). A hit
"on the beat" means its *arrival* is on the beat: a 0.4 s entrance that should
land on beat 4 starts at `B(4) - 0.4`; a click lands exactly at its `at`. The
kick is on every beat and the clap on beats 2 and 4 of each bar (in your scene's
beat numbering: 1, 3, 5, 7… are the claps) from bar 9 on. `ctx.music` gives the
track's envelopes if you want something to breathe with it (`music.pulse(t)`,
`music.low(t)`), used with restraint.

The voiceover for your scene is in your brief with the beat each phrase starts
on. Show the thing as she says it — not before, not a beat late.

## Anatomy

```ts
import type { SceneCtx } from '../engine'
import { add, browser, chip, gsap, put, rise, shot, text } from '../kit'

export default async function myScene({ root, tl, B, sfx, onFrame }: SceneCtx) {
  const s = await shot('web/students')            // a captured screen + its rects
  const dev = browser(s, { url: 'app.hawary.my/students' })
  add(root, dev.el)
  place(dev.el, dev, 1300, 600, { scale: 0.9, rotationY: -12 })   // devices: centre + transform

  const head = text('t-h1', 'One link\nto *join*.')               // \n = line, *teal*, _amber_
  add(root, put(head.el, 116, 420))                               // everything else: put(el, left, top)
  rise(tl, head.words, B(0.5), { stagger: 0.07 })                 // words slide up into their masks

  tl.to(dev.el, { ...focus(dev, s.tag('firstRow'), { cx: 800, cy: 540, width: 1200 }), duration: 1, ease: 'glide' }, B(4))
  sfx('whoosh', B(4), 0.6)
}
```

- `root` is your scene's layer: absolute, 1920x1080, `perspective: 2400px`.
- **Lay out with `put(el, x, y)` (left/top); animate with transforms** (`x`,
  `y`, `scale`, `rotation*`, `opacity`). Devices are the exception: `place()`
  positions them with `x`/`y`, and `focus()` returns `x`/`y`/`scale` to move
  them so a rect of the screen fills a part of the stage.
- A device is laid out at the screenshot's own CSS-pixel size (browser view
  1440x900 under a 52px bar; phone screen 390x844 with the shot's 390x763 under
  a 47px status bar). So a rect from the shot's JSON is directly a position in
  `dev.ov`. `shot.tag('name')` is a rect the photographer named;
  `shot.find({ text, kind, tag, slot })` searches every captured element. Print
  the JSON's `tags` and `els` to see what you have — do not guess coordinates.
- `lift(dev, rect)` puts a live copy of that piece of the screenshot exactly
  over the original; `liftUp` / `liftDown` raise and lower it with a shadow.
  This is the film's signature move: real cards and rows step out of the page.
- `dev.layer(otherShot)` stacks a pixel-aligned second screenshot to fade or
  wipe in (a state change: a new timeline entry, a status flip).
  `scrollPane(dev, fullShot)` scrolls the page's content under the fixed
  sidebar/header.
- `cursor(dev, at)` / `touch(dev, at)`, `moveTo`, `click`, `hidePointer` for
  the pointer. Clicks land on beats.
- `text()`, `rise`, `leave` for type; `chip()` + `popIn`/`popOut` for labels;
  `counter()` + `countTo` for numbers (`rm(sen)` formats MYR); `ring`, `dim`,
  `connector` + `draw`; `mark()`, `lockup()`, `dot()` for the brand; `icon()`
  for any lucide icon; `stageBox(el)` to measure real text at build time.
- `../os` is the phone's own chrome, for the notification demo only:
  `lockScreen(phoneDev)` (a native lock screen inside a phone, hidden until you
  fade it in), `deliver(tl, lock.list, [{ app, title, body, at }])` (banners
  land newest-on-top and push the others down), `note({ … overApp: true })` (a
  banner dropping over an open app), `statusLight(tl, dev, true, at)` (white
  status bar over the dark wallpaper), `buzz(tl, dev, at)` (the jolt when one
  lands). They already look native — do not restyle them.
- `bg` (from `../background`) is the room: `tl.to(bg, { ink: 1 }, …)` takes the
  lights down to a deep teal-black room, `ink: 0` brings the paper back.
- Scene-specific CSS: create `src/scenes/<id>.css`, import it from your scene,
  and prefix every class with your scene id. Use the tokens in `styles.css`
  (`--teal`, `--ink`, `--shadow-lift`…) and the type classes (`t-display`,
  `t-h1`, `t-h2`, `t-h3`, `t-body`, `t-kicker`).

## Determinism (the renderer seeks to arbitrary times, in parallel)

- The ONLY clocks are `tl` and `onFrame((t, beat) => …)`. No CSS
  animations or transitions, no `setTimeout`, `requestAnimationFrame`,
  `Date`, `Math.random` (use `rng(seed)` from `../engine`), no GSAP timelines
  or tweens of your own outside `tl`.
- Set the starting state with `gsap.set` (or `put`) at build time, then use
  `tl.to(...)`. Avoid `tl.from()`. If you use `tl.fromTo()` anywhere but the
  very start, pass `immediateRender: false`.
- Do not animate one property of one element from both a tween and `onFrame`
  at the same moment.
- Something that changes without any element's box moving (clip-path, canvas,
  SVG path data) needs `forceBlur(t0, t1)` from `../engine` to be motion-blurred
  (absolute times: `ctx.start + n * 0.5`).
- Every `<img>` you create yourself needs `decoding = 'sync'`. (`shot.img()`
  and the kit's devices already do this.)
- Hidden things should be `opacity: 0` (the blur sampler skips them), and a
  scene's first composition must already be in place half a second BEFORE beat 0:
  the incoming transition flies your whole layer in, so beat 0 is the landing,
  not the first appearance. Likewise keep the last composition alive half a
  second past your end.

## Craft bar

- **Never dead.** While your scene is up, something is always moving: a device
  drifts a few pixels or sways a degree (`onFrame`), a number counts, the next
  thing arrives. But one main idea per beat-group; do not make it busy.
- **Camera first.** Each scene has two or three *compositions* joined by
  decisive camera moves on bar lines (`ease: 'glide'`, 0.8-1.1 s), not ten
  small adjustments. An angled establishing view (rotationY ±10-17°, UI too
  small to read) is fine for a bar; then commit: straight on, pushed in until
  the UI text is at least ~18 px tall on the 1080p frame (a 14 px UI label
  needs scale ≥ 1.3).
- **Eases by name** (`engine.ts`): `swift` entrances, `swiftIn` exits, `glide`
  camera and A-to-B, `whip`, `pop` for chips and badges. Durations: type
  0.5-0.8 s, chips 0.4 s, lifts 0.35-0.5 s, camera 0.8-1.1 s. Exits are faster
  than entrances.
- **Type.** Headlines are short (2-5 words a line, max 2 lines), `t-h1` or
  `t-h2`, set left at x≈116 or in a clear column beside the device. One
  headline on screen at a time: the old one `leave`s before the new one
  `rise`s. Keep 100 px safe margins. Never put type over busy UI.
- **Honest copy.** Say only what the product does (your brief lists it).
  Amounts, names, counts on screen must match the screenshots.
- **Sound.** Cue `sfx()` for what the viewer sees: `click`/`tap` on presses,
  `pop` on chips, `whoosh` on fast camera moves, `success` on approvals and
  payments, `ding` on notifications, `tick` on small steps. Sparingly — a
  handful per scene, each on its beat.

## Look at your work

The dev server is already running on port 5330 (do not start or stop it, do not
edit shared files). From `video/`:

```bash
node tools/still.mjs --bars 13-17 --per 4 --sheet students --only students --cols 4 --thumb 720   # one frame per beat
node tools/still.mjs --from 26 --to 27 --every 0.1 --sheet students-fast --only students          # inspect a fast move
node tools/still.mjs --t 25.5,28 --only students --out .stills/students                           # full-size frames
```

Then **open the PNGs with the Read tool and look**. Iterate until: nothing
overlaps or is clipped by accident; every word is readable; each event sits on
its beat; compositions are balanced; the scene would not embarrass a motion
designer's reel. Also read the console errors `still.mjs` prints. `--only`
mounts just your scene, so other people's unfinished scenes cannot break yours
(and yours cannot break theirs: edit only `src/scenes/<your id>.ts|css`).
A typo in a tag name fails loudly with the list of tags that exist.
