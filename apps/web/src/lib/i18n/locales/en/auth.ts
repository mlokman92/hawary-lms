/** Signed-out surfaces: sign in/up, password reset, the no-membership page, invites. */
export const auth = {
  // Shared across the signed-out pages
  'auth.back_to_sign_in': 'Back to sign in',
  'auth.check_email.title': 'Check your email',
  'auth.password_reset': 'Password reset',
  // Shown on /signin after a screen sent someone back here because their token
  // had stopped verifying. Without it the return is unexplained — see
  // `isAuthError`.
  'auth.session_expired': 'Your session expired — please sign in again.',
  // The person signing up — mandatory, because the academy has to be able to
  // reach them.
  'auth.field.phone': 'Phone',

  // Sign in
  'auth.signin.title': 'Sign in',
  'auth.signin.subtitle': 'Welcome back to Hawary Academy',
  'auth.signin.busy': 'Signing in…',
  'auth.signin.forgot': 'Forgot password?',
  'auth.signin.new_here': 'New here?',
  'auth.signin.create_account': 'Create an account',

  // Sign up
  'auth.signup.title': 'Create your account',
  'auth.signup.subtitle': 'For Hawary Academy students and staff',
  'auth.signup.submit': 'Create account',
  'auth.signup.have_account': 'Already have an account?',
  'auth.signup.email_exists':
    'That email already has an account — sign in instead.',
  'auth.signup.phone_invalid':
    'Enter a phone number your academy can reach you on — e.g. 012-345 6789.',
  'auth.signup.confirm.subtitle': 'One more step',
  // Wraps the address in <strong>, so the sentence is split around it. Both
  // languages read "<lead> name@example.com <tail>" in this order.
  'auth.signup.confirm.body_before': 'We sent a confirmation link to',
  'auth.signup.confirm.body_after':
    '. Click it to activate your account, then sign in.',

  // Forgot password
  'auth.forgot.title': 'Reset password',
  'auth.forgot.subtitle': 'We’ll email you a link',
  'auth.forgot.submit': 'Send reset link',
  'auth.forgot.sent.body_before': 'If an account exists for',
  'auth.forgot.sent.body_after': ', a reset link is on its way.',

  // Reset password (the emailed link's landing page)
  'auth.reset.checking': 'Checking your link…',
  'auth.reset.done.title': 'Password updated',
  'auth.reset.done.subtitle': 'You’re all set',
  'auth.reset.done.body':
    'You’re signed in with your new password. Use it the next time you sign in.',
  'auth.reset.invalid.title': 'Link no longer valid',
  'auth.reset.invalid.body':
    'Open the most recent reset link from your email — each link works once and expires after a short while.',
  'auth.reset.link_expired': 'This reset link is no longer valid.',
  'auth.reset.link_unverified': 'This reset link could not be verified.',
  'auth.reset.request_new': 'Request a new link',
  'auth.reset.title': 'Choose a new password',
  'auth.reset.new_password': 'New password',
  'auth.reset.show_password': 'Show password',
  'auth.reset.hide_password': 'Hide password',
  'auth.reset.min_length': 'At least {count} characters.',
  'auth.reset.confirm_password': 'Confirm password',
  'auth.reset.mismatch': 'The two passwords don’t match.',
  'auth.reset.submit': 'Update password',

  // Email-confirmation callback
  'auth.callback.working': 'Signing you in…',

  // /onboarding — a signed-in account with no membership. Almost always an
  // invitee who signed up with a different address than the one Hawary
  // Academy holds. The address is split around a <strong> like auth.signup.confirm.*,
  // because it is the thing to check.
  'auth.onboarding.none.title': 'Hawary Academy has no record of this address',
  'auth.onboarding.none.body_before': 'You’re signed in as',
  'auth.onboarding.none.body_after':
    '. If you were invited with a different address, sign out and sign in with that one — or ask Hawary Academy to add this address.',
  'auth.onboarding.none.other_email': 'Sign out and use a different email',

  // Invitation acceptance
  'auth.invite.subtitle': 'Accept invitation',
  'auth.invite.invalid.title': 'Invalid link',
  'auth.invite.missing_token': 'This invitation link is missing its token.',
  'auth.invite.title': 'Accept your invitation',
  'auth.invite.join_subtitle': 'Join Hawary Academy',
  'auth.invite.have_account': 'I already have an account',
  'auth.invite.hint':
    'Use the email address Hawary Academy invited. If you already have a Hawary account with that email, choose “I already have an account”.',
  'auth.invite.joining': 'Joining…',
  'auth.invite.error.title': 'Couldn’t accept',
  'auth.invite.error.subtitle': 'Invitation',
  'auth.invite.error.generic': 'Could not accept the invitation.',
  'auth.invite.error.retryable':
    'Your invitation is still valid — this looks like a connection problem.',
  'auth.invite.other_email': 'Sign in with a different email',
  'auth.invite.done.title': 'You’re in!',
  'auth.invite.done.subtitle': 'Invitation accepted',
  'auth.invite.done.body': 'Your account is now linked to the academy.',
} as const

export type AuthDict = Record<keyof typeof auth, string>
