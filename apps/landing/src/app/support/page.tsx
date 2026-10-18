import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Page, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from '@/components/site'

export const metadata: Metadata = {
  title: 'Support — Hawary LMS',
  description:
    'Help with the Hawary Student LMS and Hawary Academy LMS apps: signing in, LPKC, appointments, payments and your account.',
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Which app should I use?',
    a: (
      <>
        Students use <strong>Hawary Student LMS</strong>. Trainers and academy staff use{' '}
        <strong>Hawary Academy LMS</strong>. Both sign in with the same email and password as{' '}
        <a href="https://app.hawary.my" className="text-primary underline">
          app.hawary.my
        </a>
        .
      </>
    ),
  },
  {
    q: 'I cannot sign in',
    a: (
      <>
        Use the email address the academy registered you with. If you have forgotten your password,
        reset it at{' '}
        <a href="https://app.hawary.my/forgot" className="text-primary underline">
          app.hawary.my/forgot
        </a>
        , then sign in to the app again. If the app says it has no record of you, message us on
        WhatsApp and we will check your record.
      </>
    ),
  },
  {
    q: 'How do I send my LPKC for checking?',
    a: 'Open the LPKC tab, pick the part (summary, report or slides) and tap Send for checking. Your trainer’s comments appear on the same page, and you send a new version from there when you have made the changes.',
  },
  {
    q: 'How do I book or cancel a session?',
    a: 'Open the Appointments tab, choose a day and a time, and tap Book. Your sessions are listed under My sessions, where you can also cancel one.',
  },
  {
    q: 'How do I pay my fees?',
    a: 'Open Billing and tap Pay online on an invoice. Payment is made by FPX online banking on a secure payment page. Your receipt appears in Billing once the payment is confirmed.',
  },
  {
    q: 'I am not getting notifications',
    a: 'Allow notifications for the app in your phone’s Settings. Everything is also listed in the Notifications tab inside the app.',
  },
  {
    q: 'How do I delete my account?',
    a: 'In Hawary Student LMS, open Home → My profile → Delete my account. This deletes your sign-in account; your academy keeps the enrolment and payment records it is required to hold. Staff accounts are removed by the academy’s Director — message us if you need yours removed.',
  },
]

export default function SupportPage() {
  return (
    <Page>
      <h1 className="text-3xl font-bold tracking-tight">Support</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-[1.0625rem] leading-relaxed">
        Help with the Hawary Student LMS and Hawary Academy LMS apps, and with app.hawary.my.
      </p>

      <section className="bg-muted mt-8 rounded-xl p-6">
        <h2 className="text-lg font-semibold">Contact us</h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          WhatsApp {SUPPORT_PHONE_DISPLAY}. Tell us your name, the email you sign in with, and
          what happened.
        </p>
        <Button asChild size="lg" className="mt-4">
          <a href={SUPPORT_WHATSAPP_URL}>Chat on WhatsApp</a>
        </Button>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Common questions</h2>
        <dl className="mt-4 divide-y border-y">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="py-5">
              <dt className="font-medium">{q}</dt>
              <dd className="text-muted-foreground mt-2 leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Page>
  )
}
