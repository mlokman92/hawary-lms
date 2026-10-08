import type { SceneCtx } from './engine'
import { wrapOf } from './engine'
import { bar } from './music'
import { cut, iris, whip, zoomThrough } from './transitions'

// The edit decision list. The track is 120 BPM, so one bar is two seconds and
// every cut below sits on a bar line of the music:
//
//   bars  1- 8   0-16s   quiet pads, no drums; a fill in bar 8
//   bars  9-16  16-32s   the groove arrives (kick, clap on 2 and 4)
//   bars 17-24  32-48s   the groove with hats: fuller, busier
//   bars 25-26  48-52s   thinning out
//   bars 27-31  52-62s   breakdown: pads only
//   bar  32     62-64s   riser
//   bars 33-44  64-88s   the big section
//   bar  45     88s      final hit, ringing out to ~92s

export const DURATION = 93

export interface FilmScene {
  id: string
  start: number
  end: number
  lead?: number
  tail?: number
  load: () => Promise<{ default: (ctx: SceneCtx) => void | Promise<void> }>
}

export const FILM: FilmScene[] = [
  { id: 'open', start: bar(1), end: bar(9), load: () => import('./scenes/open') },
  { id: 'courses', start: bar(9), end: bar(13), load: () => import('./scenes/courses') },
  { id: 'students', start: bar(13), end: bar(17), load: () => import('./scenes/students') },
  { id: 'learn', start: bar(17), end: bar(21), load: () => import('./scenes/learn') },
  { id: 'payments', start: bar(21), end: bar(25), load: () => import('./scenes/payments') },
  { id: 'appointments', start: bar(25), end: bar(27), load: () => import('./scenes/appointments') },
  { id: 'lpkc', start: bar(27), end: bar(33), load: () => import('./scenes/lpkc') },
  { id: 'ai', start: bar(33), end: bar(37), load: () => import('./scenes/ai') },
  { id: 'mobile', start: bar(37), end: bar(43), load: () => import('./scenes/mobile') },
  { id: 'montage', start: bar(43), end: bar(45), load: () => import('./scenes/montage') },
  { id: 'outro', start: bar(45), end: DURATION, tail: 0, load: () => import('./scenes/outro') },
]

// The voiceover (ElevenLabs, "Bella"). `at` is when the clip starts; `words`
// are the phrase onsets inside it (seconds from the clip's start), measured
// from the recordings, so pictures can land on the words.
export const VO = [
  { file: '01', at: 4.55, text: 'This is Hawary LMS. | One platform that runs the whole academy | on the web, | and in your pocket.', words: [0, 2.17, 4.81, 5.84], end: 6.71 },
  { file: '02', at: 16.45, text: 'Every intake is a course. | Build it in modules | notes, quizzes, assignments | and publish with a switch.', words: [0, 1.77, 3.11, 5.24], end: 6.55 },
  { file: '03', at: 24.45, text: "Students join through a single link. | Approve the request, and they're enrolled.", words: [0, 1.98], end: 3.84 },
  { file: '04', at: 32.45, text: 'Quizzes mark themselves. | Assignments land in one grading queue.', words: [0, 1.76], end: 3.97 },
  { file: '05', at: 40.4, text: 'Fees are invoiced, | paid online by FPX, and receipted automatically. | Student incentives go out in one batch.', words: [0, 1.39, 4.95], end: 6.98 },
  { file: '06', at: 48.45, text: 'Need time with a trainer? | Book it in a few taps.', words: [0, 1.43], end: 2.54 },
  { file: '07', at: 52.6, text: 'And the LPKC report? | No more waiting for a meeting. | Students simply upload it.', words: [0, 2.1, 3.65], end: 4.96 },
  { file: '08', at: 64.5, text: 'AI checks it at once, and sends feedback in seconds. | Trainers just monitor, and approve.', words: [0, 3.41], end: 5.36 },
  { file: '09', at: 72.4, text: 'It all lives in two mobile apps | one for students, | one for the academy | with instant notifications.', words: [0, 2.27, 3.36, 4.84], end: 6.38 },
  { file: '10', at: 84.35, text: 'Bilingual. Secure. | Built for Malaysian skills training.', words: [0, 1.79], end: 3.42 },
  { file: '11', at: 88.6, text: 'Hawary LMS. Your whole academy, in one place.', words: [0], end: 2.96 },
]

/** How each scene hands over to the next, on the bar line. */
export function addTransitions(master: gsap.core.Timeline, mounted: string[]) {
  const has = (...ids: string[]) => ids.every((id) => mounted.includes(id))
  const w = wrapOf
  if (has('open', 'courses')) whip(master, w('open'), w('courses'), bar(9), 'left')
  if (has('courses', 'students')) whip(master, w('courses'), w('students'), bar(13), 'up')
  if (has('students', 'learn')) iris(master, w('learn'), bar(17), { x: 960, y: 540 })
  if (has('learn', 'payments')) whip(master, w('learn'), w('payments'), bar(21), 'left')
  if (has('payments', 'appointments')) zoomThrough(master, w('payments'), w('appointments'), bar(25))
  if (has('appointments', 'lpkc')) cut(master, w('appointments'), w('lpkc'), bar(27))
  if (has('lpkc', 'ai')) cut(master, w('lpkc'), w('ai'), bar(33))
  if (has('ai', 'mobile')) whip(master, w('ai'), w('mobile'), bar(37), 'left')
  if (has('mobile', 'montage')) whip(master, w('mobile'), w('montage'), bar(43), 'up')
  if (has('montage', 'outro')) iris(master, w('outro'), bar(45), { x: 960, y: 540 })
}
