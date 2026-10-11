/**
 * The declaration a student accepts with their offer letter — shown above the
 * signature box on their page and printed on the letter's last page.
 *
 * Malay, whatever language the app is in, for the reason the letter is: it is
 * the academy's wording of a document, not a screen label, so it is not in the
 * i18n dictionary and has no English twin to drift from it. One text, two
 * readers (the page and the letter), so it lives here and nowhere else.
 */
export const OFFER_TERMS = {
  title: 'PENGAKUAN PENERIMAAN TAWARAN DAN PERSETUJUAN TERMA & SYARAT',
  paragraphs: [
    'Dengan ini, saya mengesahkan bahawa saya telah membaca, memahami dan bersetuju untuk menerima tawaran menyertai Program Diploma Kemahiran Malaysia (DKM) Tahap 4 Bidang Pengajaran Prasekolah (P851-002-4:2025) yang dikendalikan oleh Hawary Academy.',
    'Saya juga bersetuju untuk mematuhi segala terma, syarat, peraturan dan ketetapan yang telah ditetapkan oleh pihak Hawary Academy sepanjang tempoh mengikuti program ini.',
  ],
} as const
