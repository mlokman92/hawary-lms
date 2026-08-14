import type { SettingsDict } from '../en/settings'

export const settings: SettingsDict = {
  // Halaman tetapan
  'settings.title': 'Tetapan',
  'settings.subtitle':
    'Konfigurasikan butiran dan integrasi akademi anda.',
  'settings.admin_only': 'Hanya pentadbir akademi boleh mengurus tetapan.',

  // Profil akademi — maklumat yang dicetak pada invois dan resit
  'settings.academy.title': 'Butiran akademi',
  'settings.academy.description':
    'Maklumat ini dipaparkan pada invois dan resit yang dimuat turun oleh pelajar anda.',
  'settings.academy.name_label': 'Nama akademi',
  'settings.academy.name_placeholder': 'Nama berdaftar akademi anda',
  'settings.academy.logo_label': 'Logo',
  'settings.academy.logo_hint':
    'PNG, JPEG atau WebP. Dipaparkan di bahagian atas setiap invois dan resit.',
  'settings.academy.no_logo': 'Tiada logo',
  'settings.academy.change_logo': 'Tukar logo',
  'settings.academy.remove_logo': 'Buang logo',
  'settings.academy.address_label': 'Alamat',
  'settings.academy.address_placeholder':
    'Jalan, poskod, bandar dan negeri — satu baris setiap satu',
  'settings.academy.phone_label': 'Nombor telefon',
  'settings.academy.phone_placeholder': '03-1234 5678',
  'settings.academy.sst_label': 'Nombor SST',
  'settings.academy.sst_placeholder': 'W10-1808-31000000',
  'settings.academy.optional_hint':
    'Hanya nama akademi diwajibkan. Ruangan yang dibiarkan kosong tidak akan dipaparkan pada dokumen.',
  'settings.academy.save': 'Simpan butiran',
  'settings.academy.saved': 'Telah disimpan',
  'settings.academy.preview': 'Pratonton invois',
  'settings.academy.error.name_required': 'Masukkan nama akademi anda.',

  // Invoice / receipt preview dialog
  'settings.preview.title': 'Pratonton dokumen',
  'settings.preview.description':
    'Rupa invois dan resit anda dengan butiran di atas.',
  'settings.preview.tab_invoice': 'Invois',
  'settings.preview.tab_receipt': 'Resit',
  'settings.preview.sample_note':
    'Angka contoh — hanya butiran akademi milik anda. Perubahan di sini dipratonton sebelum anda menyimpannya.',

  // Kad gerbang pembayaran ToyyibPay. "Sandbox" dan "Live" ialah nama mod
  // ToyyibPay sendiri, jadi ia dikekalkan.
  'settings.toyyibpay.title': 'Pembayaran dalam talian · ToyyibPay',
  'settings.toyyibpay.description':
    'Tambah kunci rahsia ToyyibPay akademi anda supaya pelajar boleh membayar invois dalam talian melalui FPX — dana masuk terus ke akaun ToyyibPay anda.',
  'settings.toyyibpay.connected': 'Kunci telah disambungkan',
  'settings.toyyibpay.mode.sandbox': 'Sandbox',
  'settings.toyyibpay.mode.live': 'Live',
  'settings.toyyibpay.secret_masked': 'Kunci rahsia ••••{last4}',
  'settings.toyyibpay.secret_masked_category':
    'Kunci rahsia ••••{last4} · Kategori {code}',
  'settings.toyyibpay.replace_key': 'Ganti kunci',
  'settings.toyyibpay.remove_key': 'Buang kunci',
  'settings.toyyibpay.removing': 'Membuang…',
  'settings.toyyibpay.remove_confirm.title': 'Buang kunci ToyyibPay?',
  'settings.toyyibpay.remove_confirm.body':
    'Tindakan ini memadam kunci rahsia yang tersimpan dan mematikan pembayaran dalam talian. Invois sedia ada dan bayaran yang telah direkodkan akan dikekalkan. Anda boleh menambah kunci semula pada bila-bila masa.',

  'settings.toyyibpay.accept_online': 'Terima pembayaran dalam talian',
  'settings.toyyibpay.accept_online.hint':
    'Paparkan butang “Bayar dalam talian” pada pautan bayaran invois.',

  'settings.toyyibpay.charge_to_payor': 'Pembayar menanggung caj ToyyibPay',
  'settings.toyyibpay.charge_to_payor.hint':
    'ToyyibPay menambah caj FPX {amount} pada jumlah bil, jadi pelajar yang menanggungnya dan anda menerima jumlah invois penuh. Jika dimatikan, anda yang menanggungnya. Ini ialah tetapan lalai untuk invois baharu — anda boleh mengubahnya pada setiap invois.',

  'settings.toyyibpay.secret_label': 'Kunci rahsia ToyyibPay',
  'settings.toyyibpay.secret_placeholder': 'userSecretKey anda',
  'settings.toyyibpay.secret_hint':
    'Dapatkannya di papan pemuka ToyyibPay anda, di bawah Settings → Secret Key. Kami akan mengesahkannya dan mencipta kategori bil untuk anda.',
  'settings.toyyibpay.sandbox_label': 'Mod sandbox',
  'settings.toyyibpay.sandbox_hint':
    'Gunakan dev.toyyibpay.com untuk ujian. Biarkan dimatikan untuk pembayaran sebenar.',
  'settings.toyyibpay.category_label': 'Kod kategori (pilihan)',
  'settings.toyyibpay.category_placeholder':
    'Biarkan kosong untuk cipta automatik',
  'settings.toyyibpay.advanced': 'Pilihan lanjutan',

  'settings.toyyibpay.verifying': 'Mengesahkan…',
  'settings.toyyibpay.save_new_key': 'Simpan kunci baharu',
  'settings.toyyibpay.connect': 'Sambung ToyyibPay',

  'settings.toyyibpay.error.key_required':
    'Masukkan kunci rahsia ToyyibPay anda.',
  'settings.toyyibpay.error.verify_failed':
    'Kunci tidak dapat disahkan dengan ToyyibPay.',
  'settings.toyyibpay.error.save_failed': 'Kunci tidak dapat disimpan.',
  'settings.toyyibpay.error.no_response': 'Tiada respons daripada pelayan.',

  // Kad Billplz. Pasangan kepada kad ToyyibPay di atas, tetapi arah wang yang
  // bertentangan: ToyyibPay mengutip daripada pelajar, Payment Order Billplz
  // membayar mereka. "Sandbox", "Live" dan "Payment Order" ialah nama Billplz
  // sendiri, jadi ia dikekalkan.
  'settings.billplz.title': 'Pindahan kepada pelajar · Billplz',
  'settings.billplz.description':
    'Tambah kunci Billplz Payment Order akademi anda supaya anda boleh memindahkan insentif terus ke akaun bank pelajar anda sendiri.',
  'settings.billplz.connected': 'Kunci telah disambungkan',
  'settings.billplz.mode.sandbox': 'Sandbox',
  'settings.billplz.mode.live': 'Live',
  'settings.billplz.secret_masked': 'Kunci rahsia ••••{last4}',
  'settings.billplz.limit': 'Had Payment Order {amount}',
  'settings.billplz.replace_key': 'Ganti kunci',
  'settings.billplz.remove_key': 'Buang kunci',
  'settings.billplz.removing': 'Membuang…',
  'settings.billplz.remove_confirm.title': 'Buang kunci Billplz?',
  'settings.billplz.remove_confirm.body':
    'Tindakan ini memadam kunci yang tersimpan, jadi tiada pindahan lain boleh dihantar. Pindahan yang telah dihantar akan dikekalkan berserta statusnya. Anda boleh menambah kunci semula pada bila-bila masa.',

  'settings.billplz.secret_label': 'Kunci rahsia API Billplz',
  'settings.billplz.secret_placeholder': 'Kunci rahsia API anda',
  'settings.billplz.secret_hint':
    'Dapatkannya di papan pemuka Billplz anda, di bawah Settings → Account Settings.',
  'settings.billplz.xsign_label': 'X Signature Key',
  'settings.billplz.xsign_placeholder': 'X Signature Key anda',
  'settings.billplz.xsign_hint':
    'Billplz menandatangani setiap arahan pembayaran dengan kunci ini. Dapatkannya di papan pemuka Billplz anda, di bawah Settings → X Signature Key, bahagian Payment Order.',
  'settings.billplz.sandbox_label': 'Mod sandbox',
  'settings.billplz.sandbox_hint':
    'Gunakan billplz-sandbox.com untuk ujian. Biarkan dimatikan untuk pindahan sebenar.',
  'settings.billplz.advanced': 'Pilihan lanjutan',

  'settings.billplz.verifying': 'Mengesahkan…',
  'settings.billplz.save_new_key': 'Simpan kunci baharu',
  'settings.billplz.connect': 'Sambung Billplz',

  'settings.billplz.error.secret_required':
    'Masukkan kunci rahsia API Billplz anda.',
  'settings.billplz.error.xsign_required':
    'Masukkan X Signature Key Billplz anda.',
  'settings.billplz.error.verify_failed':
    'Kunci tidak dapat disahkan dengan Billplz.',
  'settings.billplz.error.save_failed': 'Kunci tidak dapat disimpan.',
  'settings.billplz.error.no_response': 'Tiada respons daripada pelayan.',

  // Halaman ahli kini mempunyai ruang namanya sendiri — lihat
  // `locales/ms/members.ts`.
}
