// Malaysian bank identifiers for Billplz Payment Order `bank_code` — SWIFT/BIC.
// Billplz's own SWIFT reference is authoritative; this list is the subset we
// offer. In sandbox no real code settles: only BILLPLZ_SANDBOX_BANK_CODE does.

export type MalaysianBank = { code: string; name: string }

/** Sorted by name, case-insensitively — this list is rendered as-is in a Select. */
export const MALAYSIAN_BANKS: readonly MalaysianBank[] = [
  { code: 'PHBMMYKL', name: 'Affin Bank' },
  { code: 'AGOBMYKL', name: 'Agrobank' },
  { code: 'RJHIMYKL', name: 'Al Rajhi Bank' },
  { code: 'MFBBMYKL', name: 'Alliance Bank' },
  { code: 'ARBKMYKL', name: 'AmBank' },
  { code: 'BIMBMYKL', name: 'Bank Islam' },
  { code: 'BMMBMYKL', name: 'Bank Muamalat' },
  { code: 'BKRMMYKL', name: 'Bank Rakyat' },
  { code: 'BSNAMYK1', name: 'Bank Simpanan Nasional' },
  { code: 'CIBBMYKL', name: 'CIMB Bank' },
  { code: 'CITIMYKL', name: 'Citibank' },
  { code: 'HLBBMYKL', name: 'Hong Leong Bank' },
  { code: 'HBMBMYKL', name: 'HSBC Bank' },
  { code: 'KFHOMYKL', name: 'Kuwait Finance House' },
  { code: 'MBBEMYKL', name: 'Maybank' },
  { code: 'AFBQMYKL', name: 'MBSB Bank' },
  { code: 'OCBCMYKL', name: 'OCBC Bank' },
  { code: 'PBBEMYKL', name: 'Public Bank' },
  { code: 'RHBBMYKL', name: 'RHB Bank' },
  { code: 'SCBLMYKX', name: 'Standard Chartered' },
  { code: 'UOVBMYKL', name: 'UOB Bank' },
]

/** The only bank_code the Billplz sandbox will settle. */
export const BILLPLZ_SANDBOX_BANK_CODE = 'DUMMYBANKVERIFIED'

const BY_CODE = new Map(MALAYSIAN_BANKS.map((b) => [b.code, b.name]))

/** Display name for a stored code; unknown codes show as themselves. */
export function bankName(code: string): string {
  return BY_CODE.get(code) ?? code
}

/** "1234-5678 9012" -> "123456789012" (what Billplz and the DB check expect). */
export function normalizeAccountNumber(raw: string): string {
  return (raw ?? '').replace(/\D/g, '')
}

/** 123456789012 -> "••••9012"; anything shorter than 4 digits shows no digits. */
export function maskAccountNumber(raw: string): string {
  const digits = normalizeAccountNumber(raw)
  return '••••' + (digits.length >= 4 ? digits.slice(-4) : '')
}
