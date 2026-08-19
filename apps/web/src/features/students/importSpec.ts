import {
  parseDate,
  parseEmail,
  parseEnum,
  parseGender,
  type ImportSpec,
} from '@/features/import/spec'
import { STUDENT_STATUSES } from './api'

/**
 * The CSV shape for bulk student creation.
 *
 * Name and email are required, the same two the form insists on. The email is
 * what later lets the person claim the record — `my_pending_invitations` finds
 * a waiting student by matching it against the caller's confirmed auth email —
 * so a roster imported without one is a roster nobody can be invited into, and
 * a file missing the column altogether is rejected before any row is read.
 *
 * Gender is the one deliberate difference: the form makes it mandatory, this
 * does not. Requiring it would turn a 200-row roster from an existing system
 * into 200 rows of manual data entry over a field the column is nullable for
 * anyway — and a name with no gender is still a usable student record.
 * Everything else the form can set (bar the avatar, which has no sensible text
 * representation) is accepted.
 */
export const studentImportSpec: ImportSpec = {
  templateName: 'hawary-students-template.csv',
  dedupeKeys: ['email', 'ic_number'],
  fields: [
    {
      key: 'full_name',
      column: 'full_name',
      labelKey: 'common.full_name',
      required: true,
      aliases: ['name', 'nama', 'nama penuh', 'student name', 'nama pelajar'],
      sample: 'Nurul Aina binti Rahman',
    },
    {
      key: 'email',
      column: 'email',
      labelKey: 'common.email',
      required: true,
      aliases: ['e-mail', 'emel', 'e-mel', 'email address', 'alamat emel'],
      parse: parseEmail,
      sample: 'nurul.aina@example.com',
    },
    {
      key: 'phone',
      column: 'phone',
      labelKey: 'common.phone',
      aliases: ['phone number', 'mobile', 'telefon', 'no telefon', 'no. telefon'],
      sample: '012-345 6789',
    },
    {
      key: 'ic_number',
      column: 'ic_number',
      labelKey: 'students.field.ic',
      aliases: ['ic', 'nric', 'ic no', 'no kp', 'no. kad pengenalan', 'kad pengenalan'],
      sample: '050203-14-1234',
    },
    {
      key: 'gender',
      column: 'gender',
      labelKey: 'students.field.gender',
      aliases: ['jantina', 'sex'],
      parse: parseGender,
      sample: 'female',
    },
    {
      key: 'date_of_birth',
      column: 'date_of_birth',
      labelKey: 'students.field.dob',
      aliases: ['dob', 'birth date', 'tarikh lahir', 'tarikh dilahirkan'],
      parse: parseDate,
      sample: '2005-02-03',
    },
    {
      key: 'organization',
      column: 'organization',
      labelKey: 'students.field.organization',
      aliases: [
        'organisation',
        'company',
        'employer',
        'organisasi',
        'syarikat',
        'majikan',
      ],
      sample: 'Klinik Mesra Sdn Bhd',
    },
    {
      key: 'address',
      column: 'address',
      labelKey: 'students.field.address',
      aliases: ['alamat'],
      sample: '12 Jalan Melati, 43000 Kajang, Selangor',
    },
    {
      key: 'status',
      column: 'status',
      labelKey: 'common.status',
      aliases: ['taraf', 'status pelajar'],
      parse: parseEnum(STUDENT_STATUSES, 'import.error.student_status'),
      sample: 'active',
    },
  ],
}
