import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TablesInsert } from '@hawary/shared'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useAcademy } from '../lib/academy'
import { slugify } from '../lib/slug'

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

  const derivedSlug = useMemo(() => (slugEdited ? slug : slugify(name)), [slug, slugEdited, name])

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
    await refresh() // the trigger made you admin; reload memberships
    navigate('/', { replace: true })
  }

  return (
    <div className="page-narrow">
      <div className="card">
        <h1>Create your academy</h1>
        <p className="muted">
          You’ll be the admin. You can invite trainers and students next.
        </p>
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Academy name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cemerlang Skills Academy"
            />
          </label>
          <label className="field">
            <span>URL (slug)</span>
            <input
              type="text"
              required
              value={derivedSlug}
              onChange={(e) => {
                setSlugEdited(true)
                setSlug(e.target.value)
              }}
            />
            <small className="muted">hawary.app/{derivedSlug || 'your-academy'}</small>
          </label>
          <div className="row">
            <label className="field">
              <span>Phone (optional)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="field">
              <span>State (optional)</span>
              <select value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">—</option>
                {MY_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create academy'}
          </button>
        </form>
      </div>
    </div>
  )
}
