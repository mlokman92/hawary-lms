import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TablesInsert } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { slugify } from '@/lib/slug'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor',
  'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
]

export function Onboarding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh } = useAcademy()

  const [name, setName] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const derivedSlug = useMemo(
    () => (slugEdited ? slug : slugify(name)),
    [slug, slugEdited, name],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const finalSlug = slugify(derivedSlug)
    if (!finalSlug) {
      setError('Please enter a valid academy name / URL.')
      return
    }
    setBusy(true)
    setError(null)

    const payload: TablesInsert<'academies'> = {
      name: name.trim(),
      slug: finalSlug,
      created_by: user.id,
      phone: phone.trim() || null,
      state: state || null,
    }
    const { error } = await supabase.from('academies').insert(payload)
    setBusy(false)

    if (error) {
      setError(
        error.code === '23505'
          ? 'That URL is already taken — try a different one.'
          : error.message,
      )
      return
    }
    await refresh()
    navigate('/', { replace: true })
  }

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create your academy</CardTitle>
            <CardDescription>
              You’ll be the admin. Invite trainers and students next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="name">Academy name</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cemerlang Skills Academy"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">URL (slug)</Label>
                <Input
                  id="slug"
                  required
                  value={derivedSlug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(e.target.value)
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  hawary.app/{derivedSlug || 'your-academy'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>State (optional)</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {MY_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Creating…' : 'Create academy'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
