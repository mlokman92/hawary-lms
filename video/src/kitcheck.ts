// A static sheet of the kit's pieces, to judge them by eye: /kitcheck.html
import './styles.css'
import { mountBackground } from './background'
import { seek } from './engine'
import { add, browser, chip, cursor, gsap, lift, mark, phone, place, put, ring, shot, text, touch } from './kit'
import { deliver, lockScreen, note, statusLight } from './os'

const root = document.getElementById('root')!
await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
mountBackground()
await seek(0)

const web = await shot('web/courses')
const b = browser(web, { url: 'app.hawary.my/courses' })
add(root, b.el)
place(b.el, b, 1240, 420, { scale: 0.62, rotationY: -12, rotationX: 4 })
const l = lift(b, web.tag('siri3'))
gsap.set(l, { scale: 1.07, y: -8, boxShadow: '0 2px 4px 0px rgba(17,17,19,0.06), 0 14px 28px -6px rgba(17,17,19,0.16), 0 40px 70px -18px rgba(15,118,110,0.34)' })
gsap.set(ring(b, web.tag('newCourse')), { opacity: 1 })
gsap.set(cursor(b, { x: 620, y: 300 }).el, { opacity: 1 })

// the phone frame, with a stand-in screen cut from a web shot until the app shots land
const key = new URLSearchParams(location.search).get('phone')
const ps = key ? await shot(key) : { ...web, w: 390, h: 763 }
const ps2 = await shot('academy/home').catch(() => ps)
const p = phone(ps as typeof web)
add(root, p.el)
place(p.el, p, 380, 600, { scale: 1.05, rotationY: 14, rotationZ: -2 })
gsap.set(touch(p, { x: 200, y: 400 }).el, { opacity: 1 })
const p2 = phone(ps2 as typeof web)
add(root, p2.el)
place(p2.el, p2, 760, 700, { scale: 0.72 })
const over = note({ app: 'academy', title: 'Nur Aisyah Razak sent a report for checking', body: 'LPKC, slide dan portfolio · DKM Prasekolah Siri 3/2026', overApp: true })
;(p2.el.querySelector('.phone-screen') as HTMLElement).append(over)
gsap.set(over, { x: 12, y: 54, zIndex: 5 })

const lock = lockScreen(p)
const tl = gsap.timeline({ paused: true })
statusLight(tl, p, true, 0)
deliver(tl, lock.list, [
  { app: 'student', title: 'Hawary AI commented on your report', body: 'LPKC, slide dan portfolio · 3 points to fix before approval', at: 1 },
  { app: 'student', title: 'Session booked with Siti Hajar Ismail', body: 'Tue 13 Oct, 10:00 am · Bincang pembentangan akhir', at: 2 },
  { app: 'student', title: 'Payment received for INV-2026-0412', body: 'RM 900.00 · FPX', at: 3 },
])
gsap.set(lock.el, { opacity: 1 })
tl.time(4)

const k = text('t-kicker', 'Kit check')
const hd = text('t-h1', 'Every piece,\n*by eye*.')
add(root, put(k.el, 980, 700), put(hd.el, 976, 744))
;[chip('Published', { icon: 'check', tone: 'teal' }), chip('Notes', { icon: 'file-text' }), chip('RM 900.00', { tone: 'amber' }), chip('AI check', { icon: 'sparkles', tone: 'ink' }), chip('Small', { icon: 'bell', sm: true })].forEach((c, i) => add(root, put(c, 980 + i * 190, 990)))
const m = mark(120)
add(root, put(m.el, 1740, 60))
;(window as any).__ready = true
