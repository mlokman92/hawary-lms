import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/site'

export const metadata: Metadata = {
  title: 'The apps — Hawary LMS',
  description:
    'Hawary Student LMS and Hawary Academy LMS: the phone apps for Hawary Academy’s Diploma Kemahiran Malaysia students, trainers and staff.',
}

const APPS = [
  {
    name: 'Hawary Student LMS',
    for: 'For students',
    image: '/img/student.png',
    alt: 'The Home screen of Hawary Student LMS',
    points: [
      'Send each part of your LPKC for checking and read your trainer’s comments',
      'Book a session with a trainer and add it to your calendar',
      'See your invoices and pay online by FPX',
      'Sign your offer letter, upload your IC copy and apply for your KWSP letter',
      'Course notes, announcements and notifications in one place',
    ],
  },
  {
    name: 'Hawary Academy LMS',
    for: 'For trainers and academy staff',
    image: '/img/academy.png',
    alt: 'The Today screen of Hawary Academy LMS',
    points: [
      'Today’s sessions, marking and reports to check on one screen',
      'Check LPKC reports, comment and approve from your phone',
      'Look up students, their enrolment, documents and invoices',
      'Record payments and attach bank transfer receipts',
      'Post announcements to a course or the whole academy',
    ],
  },
]

export default function AppsPage() {
  return (
    <Page>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Hawary Academy, in your pocket
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-[1.0625rem] leading-relaxed">
        Two apps for the Diploma Kemahiran Malaysia (DKM) in Pengasuhan dan Pendidikan Awal
        Kanak-Kanak at Hawary Academy. Sign in with the account the academy gave you — the same one
        you use at app.hawary.my.
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {APPS.map((app) => (
          <section key={app.name} className="flex flex-col rounded-xl border p-6">
            <p className="text-primary text-sm font-medium">{app.for}</p>
            <h2 className="mt-1 text-xl font-semibold">{app.name}</h2>
            <img
              src={app.image}
              alt={app.alt}
              width={390}
              height={844}
              className="bg-muted mx-auto mt-6 w-56 rounded-[1.75rem] border shadow-sm"
            />
            <ul className="text-muted-foreground mt-6 list-disc space-y-2 pl-5 leading-relaxed">
              {app.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-6 text-sm">
              Search for <strong className="text-foreground">{app.name}</strong> on the App Store.
            </p>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <a href="https://app.hawary.my/signin">Open on the web</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/support">Get help</a>
        </Button>
      </div>
    </Page>
  )
}
