import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Page, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from '@/components/site'

export const metadata: Metadata = {
  title: 'Privacy Policy — Hawary LMS',
  description:
    'How Hawary Academy collects, uses and protects personal data in Hawary LMS, Hawary Student LMS and Hawary Academy LMS.',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground mt-3 space-y-3 leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <Page>
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground mt-3">Effective 18 October 2026</p>
      <p className="text-muted-foreground mt-6 max-w-2xl leading-relaxed">
        This policy explains how Hawary Academy handles personal data in Hawary LMS — the website
        at app.hawary.my and the Hawary Student LMS and Hawary Academy LMS apps. We handle personal
        data in line with Malaysia’s Personal Data Protection Act 2010.
      </p>

      <Section title="Who we are">
        <p>
          Hawary Academy, No. 15, Jalan Perjiranan 4/4, Bandar Dato Onn, 81100 Johor Bahru, Johor,
          Malaysia, runs the Diploma Kemahiran Malaysia (DKM) in Pengasuhan dan Pendidikan Awal
          Kanak-Kanak and is responsible for the personal data in Hawary LMS.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Your account:</strong> email address and password
            (stored only in encrypted form).
          </li>
          <li>
            <strong className="text-foreground">Your student or staff record:</strong> name, IC
            number, date of birth, gender, phone number, addresses, workplace and profile photo.
          </li>
          <li>
            <strong className="text-foreground">Your studies:</strong> enrolment, sessions booked,
            coursework and LPKC documents you send, marks, and comments from trainers.
          </li>
          <li>
            <strong className="text-foreground">Documents:</strong> files you upload (such as your
            IC copy and employment letter), your signature on the offer letter, and your KWSP
            letter application.
          </li>
          <li>
            <strong className="text-foreground">Payments:</strong> invoices, payments and receipts.
            Online payments are made on our payment provider’s page; we never receive your online
            banking login or card details.
          </li>
          <li>
            <strong className="text-foreground">Bank account for payouts:</strong> account holder
            name, bank and account number, if you give them so the academy can pay you an
            incentive.
          </li>
          <li>
            <strong className="text-foreground">Device and usage:</strong> a notification token for
            your device, the app version, and the times you sign in and use Hawary LMS.
          </li>
        </ul>
        <p>
          The apps use your camera, photos or files only to attach something you choose, and your
          calendar only when you tap “Add to calendar”. We do not collect your location, and we do
          not use advertising or third-party tracking.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          To run your course: enrolment, classes and sessions, checking your work and LPKC,
          certification records, offer and KWSP letters, invoices, payments and receipts, incentive
          payouts, notifications and reminders, support, and keeping accounts secure. We also keep
          records where the law or our accreditation requires it.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          We do not sell personal data. Inside the academy, staff see only what their role needs.
          We share data with service providers who run parts of Hawary LMS for us and may only use
          it to do so:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Supabase — database, file storage and sign-in</li>
          <li>Netlify — website hosting</li>
          <li>Resend — email</li>
          <li>Expo, Apple and Google — app notifications and updates</li>
          <li>ToyyibPay — online payments (FPX)</li>
          <li>Billplz — incentive payouts</li>
        </ul>
        <p>
          We also disclose data to government bodies such as Jabatan Pembangunan Kemahiran where
          the law or the programme requires it. Some providers store data on servers outside
          Malaysia.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          While you study or work with us, and afterwards for as long as certification, accounting
          and legal requirements need.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can ask to see or correct your personal data, or withdraw consent, by contacting us.
          Students can delete their account in Hawary Student LMS under Home → My profile → Delete
          my account. This removes your sign-in account; the academy keeps the enrolment and payment
          records it is required to hold. Staff can ask us to remove their account.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit, and access to each record is restricted by role in the
          database itself.
        </p>
      </Section>

      <Section title="Changes">
        <p>We will post any change to this policy on this page with a new effective date.</p>
      </Section>

      <Section title="Contact">
        <p>
          WhatsApp{' '}
          <a href={SUPPORT_WHATSAPP_URL} className="text-primary underline">
            {SUPPORT_PHONE_DISPLAY}
          </a>
          , or write to us at the address above.
        </p>
      </Section>
    </Page>
  )
}
