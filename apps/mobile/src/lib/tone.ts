/**
 * The stat-colour vocabulary, shared with the web app's `lib/tone.ts`:
 * positive = in good standing, warning = provisional, danger = ended/at risk,
 * accent = a derived gap, muted = dormant, info = neutral count.
 *
 * The colours themselves live in the theme (`ui/theme.ts` → `tone`).
 */
export type Tone = 'info' | 'positive' | 'warning' | 'danger' | 'accent' | 'muted'
