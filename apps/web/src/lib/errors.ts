/**
 * Reading a failure that came back from Supabase.
 *
 * supabase-js only constructs a real `PostgrestError` — which does extend
 * `Error` — when the call opted into `.throwOnError()`. The `{ data, error }`
 * form, which is what this app uses everywhere, hands back the parsed response
 * body instead (`error = JSON.parse(body)` in postgrest-js's
 * `PostgrestBuilder.processResponse`). That is a PLAIN OBJECT, so
 * `e instanceof Error` is false for every error the database raises, and the
 * familiar `e instanceof Error ? e.message : fallback` quietly throws the
 * server's reason away and shows the fallback instead.
 */

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown }

const asErrorLike = (e: unknown): ErrorLike =>
  typeof e === 'object' && e !== null ? (e as ErrorLike) : {}

/**
 * PostgREST's `code`: a Postgres SQLSTATE (`P0001` for a plpgsql `raise`,
 * `42501` for RLS) or a `PGRST…` code of its own. Empty when PostgREST did not
 * answer in its own voice — postgrest-js leaves it blank on a transport
 * failure, and omits it entirely when an error body would not parse as JSON
 * (a proxy's HTML 502, a plain-text gateway rejection). Branch on this rather
 * than on the message text, which is prose and is not part of anybody's
 * contract.
 */
export function errorCode(e: unknown): string {
  const code = asErrorLike(e).code
  return typeof code === 'string' ? code : ''
}

/**
 * PostgREST talking about the request it was handed rather than about the
 * data: a filter it could not parse, a row count that did not match
 * `.single()`. Notes to a developer, never a reason to put in front of someone.
 */
const isInternalCode = (code: string) => code.startsWith('PGRST1')

/**
 * The call never reached the caller's own identity — the session is the
 * problem, not the request.
 *
 * When a JWT is missing, expired or unverifiable, PostgREST answers **401**
 * and never runs `set local role authenticated`, so the statement executes as
 * `authenticator`, the pooler's login role, which deliberately holds no
 * grants. Postgres therefore fails it as `42501 permission denied for function
 * …` — naming one of our own functions, which reads to the person on the other
 * end as a broken app rather than as "sign in again".
 *
 * It happened: a student who had just signed up pressed Join four times and
 * was shown `permission denied for function accept_pending_invitation`. Her
 * invitation list had loaded seconds earlier on the same token, so nothing
 * about her records was wrong — the token simply stopped verifying.
 *
 * Branch on the HTTP status, not on `42501`: that SQLSTATE is also what an
 * ordinary RLS refusal raises, and those are a different problem with a
 * different answer.
 */
export function isAuthError(e: unknown): boolean {
  const { status } = asErrorLike(e)
  if (status === 401) return true
  const code = errorCode(e)
  // PostgREST's own names for an unusable or absent token.
  return code === 'PGRST301' || code === 'PGRST302'
}

/**
 * The reason the server gave, or `fallback` when it did not give one.
 *
 * A real `Error` is something this app or an SDK built deliberately, so its
 * message is meant to be read. A plain object is postgrest-js handing back a
 * parsed response body, and that is only worth showing when PostgREST actually
 * answered — which is exactly when it carries a `code`. Without one the
 * "message" is a synthesised transport string (`TypeError: Failed to fetch`)
 * or a whole HTML error page, neither of which is anyone's copy.
 */
export function errorMessage(e: unknown, fallback: string): string {
  const message = asErrorLike(e).message
  if (typeof message !== 'string' || message.trim() === '') return fallback
  if (e instanceof Error) return message
  const code = errorCode(e)
  return code === '' || isInternalCode(code) ? fallback : message
}
