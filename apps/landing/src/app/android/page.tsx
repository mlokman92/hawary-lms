import type { Metadata } from 'next'
import { Page } from '@/components/site'
import { GmailForm } from './gmail-form'

export const metadata: Metadata = {
  title: 'Hawary Student LMS for Android — Hawary LMS',
  description:
    'The Android app of Hawary Student LMS is open to testers. Send us the Gmail address your phone’s Play Store uses and we will give you access.',
}

export default function AndroidPage() {
  return (
    <Page>
      <h1 className="text-3xl font-bold tracking-tight">Hawary Student LMS for Android</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-[1.0625rem] leading-relaxed">
        Enter the Gmail address your phone’s Play Store uses. Send opens WhatsApp with a message
        to the academy asking for access.
      </p>
      <GmailForm />
    </Page>
  )
}
