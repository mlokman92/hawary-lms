import type { AuthDict } from '../en/auth'

export const auth: AuthDict = {
  // Dikongsi merentas halaman sebelum log masuk
  'auth.back_to_sign_in': 'Kembali ke log masuk',
  'auth.check_email.title': 'Semak e-mel anda',
  'auth.password_reset': 'Set semula kata laluan',
  'auth.session_expired': 'Sesi anda telah tamat — sila log masuk semula.',
  'auth.field.phone': 'Telefon',

  // Log masuk
  'auth.signin.title': 'Log masuk',
  'auth.signin.subtitle': 'Selamat kembali ke Hawary Academy',
  'auth.signin.busy': 'Sedang log masuk…',
  'auth.signin.forgot': 'Lupa kata laluan?',
  'auth.signin.new_here': 'Baharu di sini?',
  'auth.signin.create_account': 'Cipta akaun',

  // Daftar akaun
  'auth.signup.title': 'Cipta akaun anda',
  'auth.signup.subtitle': 'Untuk pelajar dan kakitangan Hawary Academy',
  'auth.signup.submit': 'Cipta akaun',
  'auth.signup.have_account': 'Sudah mempunyai akaun?',
  'auth.signup.email_exists':
    'E-mel itu sudah mempunyai akaun — sila log masuk.',
  'auth.signup.phone_invalid':
    'Masukkan nombor telefon yang boleh dihubungi oleh akademi anda — cth. 012-345 6789.',
  'auth.signup.confirm.subtitle': 'Satu langkah lagi',
  'auth.signup.confirm.body_before': 'Kami telah menghantar pautan pengesahan ke',
  'auth.signup.confirm.body_after':
    '. Klik pautan itu untuk mengaktifkan akaun anda, kemudian log masuk.',

  // Lupa kata laluan
  'auth.forgot.title': 'Set semula kata laluan',
  'auth.forgot.subtitle': 'Kami akan e-melkan pautan kepada anda',
  'auth.forgot.submit': 'Hantar pautan set semula',
  'auth.forgot.sent.body_before': 'Jika akaun wujud untuk',
  'auth.forgot.sent.body_after': ', pautan set semula sedang dihantar.',

  // Set semula kata laluan (halaman pautan e-mel)
  'auth.reset.checking': 'Menyemak pautan anda…',
  'auth.reset.done.title': 'Kata laluan dikemas kini',
  'auth.reset.done.subtitle': 'Semuanya selesai',
  'auth.reset.done.body':
    'Anda kini log masuk dengan kata laluan baharu anda. Gunakannya pada kali seterusnya anda log masuk.',
  'auth.reset.invalid.title': 'Pautan sudah tidak sah',
  'auth.reset.invalid.body':
    'Buka pautan set semula terkini daripada e-mel anda — setiap pautan hanya boleh digunakan sekali dan tamat tempoh selepas seketika.',
  'auth.reset.link_expired': 'Pautan set semula ini sudah tidak sah.',
  'auth.reset.link_unverified': 'Pautan set semula ini tidak dapat disahkan.',
  'auth.reset.request_new': 'Minta pautan baharu',
  'auth.reset.title': 'Pilih kata laluan baharu',
  'auth.reset.new_password': 'Kata laluan baharu',
  'auth.reset.show_password': 'Tunjukkan kata laluan',
  'auth.reset.hide_password': 'Sembunyikan kata laluan',
  'auth.reset.min_length': 'Sekurang-kurangnya {count} aksara.',
  'auth.reset.confirm_password': 'Sahkan kata laluan',
  'auth.reset.mismatch': 'Kedua-dua kata laluan tidak sepadan.',
  'auth.reset.submit': 'Kemas kini kata laluan',

  // Panggilan balik pengesahan e-mel
  'auth.callback.working': 'Sedang log masuk anda…',

  // Akaun tanpa keahlian
  'auth.onboarding.none.title': 'Hawary Academy tiada rekod bagi alamat ini',
  'auth.onboarding.none.body_before': 'Anda log masuk sebagai',
  'auth.onboarding.none.body_after':
    '. Jika anda dijemput dengan alamat e-mel yang berbeza, log keluar dan log masuk dengan alamat tersebut — atau minta Hawary Academy menambah alamat ini.',
  'auth.onboarding.none.other_email': 'Log keluar dan guna e-mel lain',

  // Menerima jemputan
  'auth.invite.subtitle': 'Terima jemputan',
  'auth.invite.invalid.title': 'Pautan tidak sah',
  'auth.invite.missing_token': 'Pautan jemputan ini tiada tokennya.',
  'auth.invite.title': 'Terima jemputan anda',
  'auth.invite.join_subtitle': 'Sertai Hawary Academy',
  'auth.invite.have_account': 'Saya sudah mempunyai akaun',
  'auth.invite.hint':
    'Gunakan alamat e-mel yang dijemput oleh Hawary Academy. Jika anda sudah mempunyai akaun Hawary dengan e-mel tersebut, pilih “Saya sudah mempunyai akaun”.',
  'auth.invite.joining': 'Sedang menyertai…',
  'auth.invite.error.title': 'Tidak dapat menerima',
  'auth.invite.error.subtitle': 'Jemputan',
  'auth.invite.error.generic': 'Tidak dapat menerima jemputan ini.',
  'auth.invite.error.retryable':
    'Jemputan anda masih sah — ini nampaknya masalah sambungan.',
  'auth.invite.other_email': 'Log masuk dengan e-mel lain',
  'auth.invite.done.title': 'Anda telah menyertai!',
  'auth.invite.done.subtitle': 'Jemputan diterima',
  'auth.invite.done.body': 'Akaun anda kini dipautkan dengan akademi.',
}
