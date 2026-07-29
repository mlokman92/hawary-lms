import type { InvitationsDict } from '../en/invitations'

export const invitations: InvitationsDict = {
  // Senarai jemputan
  'invite.pending.title': 'Jemputan belum diterima',
  'invite.row.expires': '{email} · tamat tempoh pada {date}',
  'invite.row.expired': '{email} · tamat tempoh',
  'invite.status.pending': 'Menunggu',
  'invite.status.expired': 'Tamat tempoh',
  'invite.actions': 'Tindakan jemputan',
  'invite.action.resend': 'Hantar semula (pautan baharu)',
  'invite.action.revoke': 'Batalkan',
  'invite.error.resend': 'Gagal menghantar semula.',

  // Pautkan akaun sedia ada (pentadbir sahaja)
  'invite.link.title': 'Pautkan akaun sedia ada',
  'invite.link.description.student':
    'Individu ini mesti sudah mendaftar akaun. Memautkan akaun memberi akses pelajar kepada akademi ini.',
  'invite.link.description.instructor':
    'Individu ini mesti sudah mendaftar akaun. Memautkan akaun memberi akses jurulatih kepada akademi ini.',
  'invite.link.email_label': 'E-mel akaun',
  'invite.link.email_placeholder': 'nama@example.com',
  'invite.link.error.email_required': 'E-mel diperlukan.',
  'invite.link.error.failed': 'Gagal memautkan akaun.',
  'invite.link.linking': 'Memautkan…',
  'invite.link.submit': 'Pautkan akaun',
}
