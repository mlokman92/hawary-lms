'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { SUPPORT_WHATSAPP_URL } from '@/components/site'

const GMAIL = /^[^\s@]+@(gmail|googlemail)\.com$/

export function GmailForm() {
  const [error, setError] = useState(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Read the field itself, not React state: on a slow phone the address can be
    // typed or autofilled before hydration, and state would still be empty.
    const address = String(new FormData(e.currentTarget).get('email') ?? '')
      .trim()
      .toLowerCase()
    if (!GMAIL.test(address)) {
      setError(true)
      return
    }
    const text = `Hi my email is ${address} please give me access to the LMS android app`
    // Same tab: on an Android phone wa.me hands off to the WhatsApp app.
    window.location.href = `${SUPPORT_WHATSAPP_URL}?text=${encodeURIComponent(text)}`
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex max-w-md flex-col gap-3">
      <label htmlFor="email" className="font-medium">
        Gmail address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@gmail.com"
          onChange={() => setError(false)}
          aria-invalid={error || undefined}
          aria-describedby={error ? 'email-error' : undefined}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive h-10 w-full min-w-0 rounded-4xl border px-4 text-base outline-none focus-visible:ring-3"
        />
        <Button type="submit" size="lg">
          Send
        </Button>
      </div>
      {error && (
        <p id="email-error" className="text-destructive text-sm">
          Enter a Gmail address, ending in @gmail.com.
        </p>
      )}
    </form>
  )
}
