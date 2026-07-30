import {
  parseDate,
  parseEmail,
  parseEnum,
  parseGender,
  type ImportSpec,
} from '@/features/import/spec'
import { INSTRUCTOR_STATUSES } from './api'

/**
 * The CSV shape for bulk instructor creation — the student spec plus the two
 * fields only an instructor has (specialization, bio). See the note there on
 * why gender is optional here but required in the form.
 *
 * Importing an instructor creates the *record*, not an account: linking it to a
 * login is a separate, deliberate step (invite, or link from the record page),
 * because that is what grants back-office access.
 */
export const instructorImportSpec: ImportSpec = {
  templateName: 'hawary-instructors-template.csv',
  dedupeKeys: ['email', 'ic_number'],
  fields: [
    {
      key: 'full_name',
      column: 'full_name',
      labelKey: 'common.full_name',
      required: true,
      aliases: ['name', 'nama', 'nama penuh', 'instructor name', 'nama pengajar'],
      sample: 'Encik Ahmad bin Ismail',
    },
    {
      key: 'email',
      column: 'email',
      labelKey: 'common.email',
      aliases: ['e-mail', 'emel', 'e-mel', 'email address', 'alamat emel'],
      parse: parseEmail,
      sample: 'ahmad.ismail@example.com',
    },
    {
      key: 'phone',
      column: 'phone',
      labelKey: 'common.phone',
      aliases: ['phone number', 'mobile', 'telefon', 'no telefon', 'no. telefon'],
      sample: '019-876 5432',
    },
    {
      key: 'specialization',
      column: 'specialization',
      labelKey: 'instructors.field.specialization',
      aliases: ['subject', 'subjek', 'pengkhususan', 'bidang'],
      sample: 'Tahfiz',
    },
    {
      key: 'ic_number',
      column: 'ic_number',
      labelKey: 'instructors.field.ic',
      aliases: ['ic', 'nric', 'ic no', 'no kp', 'no. kad pengenalan', 'kad pengenalan'],
      sample: '880712-10-5544',
    },
    {
      key: 'gender',
      column: 'gender',
      labelKey: 'instructors.field.gender',
      aliases: ['jantina', 'sex'],
      parse: parseGender,
      sample: 'male',
    },
    {
      key: 'date_of_birth',
      column: 'date_of_birth',
      labelKey: 'instructors.field.dob',
      aliases: ['dob', 'birth date', 'tarikh lahir', 'tarikh dilahirkan'],
      parse: parseDate,
      sample: '1988-07-12',
    },
    {
      key: 'bio',
      column: 'bio',
      labelKey: 'instructors.field.bio',
      aliases: ['biography', 'biodata', 'latar belakang'],
      sample: '10 years teaching tahfiz and tajwid.',
    },
    {
      key: 'address',
      column: 'address',
      labelKey: 'instructors.field.address',
      aliases: ['alamat'],
      sample: '8 Jalan Cempaka, 68000 Ampang, Selangor',
    },
    {
      key: 'status',
      column: 'status',
      labelKey: 'common.status',
      aliases: ['taraf'],
      parse: parseEnum(INSTRUCTOR_STATUSES, 'import.error.instructor_status'),
      sample: 'active',
    },
  ],
}
