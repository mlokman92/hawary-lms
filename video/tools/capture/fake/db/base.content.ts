// The teaching content every DKM Prasekolah intake carries. Course and module
// titles are the real ones (cast.json); the wording inside is invented.
// Kept apart from base.ts only because it is long.

export type QuizQuestion =
  | { type: 'single_choice'; prompt: string; choices: string[]; answer: number }
  | { type: 'true_false'; prompt: string; answer: boolean }

export const NOTE_HTML: Record<string, string> = {
  'Perkembangan Kanak-Kanak 0–4 Tahun':
    '<h2>Empat domain perkembangan</h2>' +
    '<p>Perkembangan kanak-kanak berlaku serentak dalam empat domain: <strong>fizikal</strong>, <strong>kognitif</strong>, <strong>bahasa</strong> dan <strong>sosioemosi</strong>. Pengasuh perlu memerhati keempat-empatnya, bukan satu sahaja.</p>' +
    '<h3>Peringkat utama</h3>' +
    '<ul><li><strong>0–12 bulan:</strong> mengangkat kepala, meniarap, duduk tanpa sokongan, mula merangkak.</li>' +
    '<li><strong>1–2 tahun:</strong> berjalan sendiri, menyebut 10–50 patah perkataan, menconteng.</li>' +
    '<li><strong>2–3 tahun:</strong> berlari, memanjat, membina ayat dua hingga tiga perkataan.</li>' +
    '<li><strong>3–4 tahun:</strong> melompat sebelah kaki, bermain secara berkumpulan, bertanya “kenapa”.</li></ul>' +
    '<p>Setiap kanak-kanak berkembang pada kadar tersendiri. Peringkat di atas ialah panduan, bukan ukuran lulus atau gagal.</p>',
  'Keselamatan & Kesihatan di TASKA':
    '<h2>Persekitaran yang selamat</h2>' +
    '<p>Keselamatan bermula sebelum kanak-kanak tiba. Lakukan semakan harian pada pintu pagar, soket elektrik, alat permainan dan kawasan tidur.</p>' +
    '<h3>Rutin kebersihan</h3>' +
    '<ol><li>Cuci tangan dengan sabun sebelum dan selepas menukar lampin.</li><li>Sanitasi permukaan dan alat permainan setiap hari.</li><li>Asingkan kanak-kanak yang demam dan maklumkan ibu bapa dengan segera.</li></ol>' +
    '<p>Semua kejadian — walaupun kecil — direkodkan dalam Buku Log Kejadian pada hari yang sama.</p>',
  'Pemakanan Seimbang untuk Kanak-Kanak':
    '<h2>Pinggan Sihat Malaysia</h2>' +
    '<p>Gunakan konsep <strong>suku-suku separuh</strong>: suku pinggan karbohidrat, suku pinggan protein, dan separuh pinggan sayur serta buah.</p>' +
    '<h3>Jadual makan di TASKA</h3>' +
    '<ul><li>3 hidangan utama dan 2 snek sihat sehari.</li><li>Air kosong sepanjang hari; hadkan minuman bergula.</li><li>Semak rekod alahan sebelum menyediakan setiap hidangan.</li></ul>',
  'Bermain Sambil Belajar':
    '<h2>Mengapa bermain?</h2>' +
    '<p>Bermain ialah cara kanak-kanak belajar. Melalui permainan, mereka menguji idea, berunding dengan rakan dan mengawal emosi.</p>' +
    '<h3>Jenis permainan</h3>' +
    '<ul><li><strong>Permainan sensori:</strong> pasir, air, doh.</li><li><strong>Permainan simbolik:</strong> main masak-masak, main peranan.</li><li><strong>Permainan binaan:</strong> blok, lego, kotak.</li></ul>' +
    '<p>Peranan pengasuh ialah menyediakan bahan, memerhati dan bertanya soalan terbuka — bukan mengarah.</p>',
}

export const QUIZ: Record<string, QuizQuestion[]> = {
  'Kuiz 1: Perkembangan Fizikal': [
    { type: 'single_choice', prompt: 'Pada usia berapakah kebanyakan bayi mula duduk tanpa sokongan?', choices: ['2–3 bulan', '6–8 bulan', '12–14 bulan', '18 bulan'], answer: 1 },
    { type: 'single_choice', prompt: 'Kemahiran motor kasar merujuk kepada…', choices: ['pergerakan jari dan tangan', 'pergerakan otot besar seperti berjalan dan melompat', 'kebolehan bertutur', 'kebolehan mengenal warna'], answer: 1 },
    { type: 'single_choice', prompt: 'Manakah antara berikut contoh kemahiran motor halus?', choices: ['Berlari di padang', 'Memanjat tangga', 'Memegang krayon untuk menconteng', 'Menendang bola'], answer: 2 },
    { type: 'single_choice', prompt: 'Kebanyakan kanak-kanak mula berjalan sendiri pada usia…', choices: ['6–8 bulan', '9–10 bulan', '12–15 bulan', '24 bulan'], answer: 2 },
    { type: 'true_false', prompt: 'Setiap kanak-kanak mencapai peringkat perkembangan pada usia yang sama.', answer: false },
    { type: 'single_choice', prompt: 'Aktiviti manakah paling sesuai untuk merangsang motor kasar kanak-kanak berumur 3 tahun?', choices: ['Mewarna gambar', 'Berlari dan memanjat di taman permainan', 'Menyusun manik', 'Mendengar cerita'], answer: 1 },
    { type: 'single_choice', prompt: 'Refleks genggaman biasanya dapat dilihat pada…', choices: ['bayi baru lahir', 'kanak-kanak 2 tahun', 'kanak-kanak 4 tahun', 'kanak-kanak 6 tahun'], answer: 0 },
    { type: 'single_choice', prompt: 'Apakah tujuan utama “tummy time” untuk bayi?', choices: ['Membantu bayi tidur', 'Menguatkan otot leher dan bahu', 'Melatih pertuturan', 'Mengurangkan selera makan'], answer: 1 },
    { type: 'true_false', prompt: 'Pemakanan yang seimbang mempengaruhi perkembangan fizikal kanak-kanak.', answer: true },
    { type: 'single_choice', prompt: 'Pada usia 4 tahun, kebanyakan kanak-kanak sudah boleh…', choices: ['menulis karangan pendek', 'melompat sebelah kaki dan menangkap bola besar', 'mengikat tali kasut sendiri', 'menunggang basikal dua roda'], answer: 1 },
  ],
  'Kuiz 2: Pemakanan & Kesihatan': [
    { type: 'single_choice', prompt: 'Kumpulan makanan manakah sumber utama tenaga?', choices: ['Protein', 'Karbohidrat', 'Vitamin', 'Mineral'], answer: 1 },
    { type: 'single_choice', prompt: 'Berapa kali snek sihat disarankan untuk kanak-kanak di TASKA dalam sehari?', choices: ['Tiada', '2 kali', '5 kali', '6 kali'], answer: 1 },
    { type: 'single_choice', prompt: 'Manakah snek yang paling sesuai disediakan di TASKA?', choices: ['Keropok dan air bergas', 'Gula-gula', 'Buah potong dan susu', 'Coklat'], answer: 2 },
    { type: 'single_choice', prompt: 'Apakah langkah pertama sebelum menyediakan makanan kanak-kanak?', choices: ['Memanaskan makanan', 'Mencuci tangan dengan sabun', 'Menyusun pinggan', 'Memanggil kanak-kanak'], answer: 1 },
    { type: 'true_false', prompt: 'Minuman bergula sesuai diberikan setiap hari kepada kanak-kanak.', answer: false },
    { type: 'single_choice', prompt: 'Alahan makanan yang biasa dalam kalangan kanak-kanak termasuk…', choices: ['nasi dan roti', 'kacang, telur dan susu', 'sayur hijau', 'air kosong'], answer: 1 },
    { type: 'single_choice', prompt: 'Suhu badan kanak-kanak dianggap demam apabila melebihi…', choices: ['35.0°C', '36.5°C', '37.5°C', '40.5°C'], answer: 2 },
    { type: 'single_choice', prompt: 'Konsep “suku-suku separuh” bermaksud separuh pinggan diisi dengan…', choices: ['nasi', 'lauk berprotein', 'sayur dan buah', 'makanan bergoreng'], answer: 2 },
    { type: 'true_false', prompt: 'Rekod alahan setiap kanak-kanak perlu disimpan dan dirujuk oleh pengasuh.', answer: true },
    { type: 'single_choice', prompt: 'Apakah tindakan pertama jika kanak-kanak kelihatan tercekik makanan?', choices: ['Beri air minum', 'Biarkan dia berehat', 'Lakukan bantuan tercekik dan panggil bantuan', 'Baringkan kanak-kanak'], answer: 2 },
  ],
}

export const ASSIGNMENT_BRIEF: Record<string, string[]> = {
  'Tugasan 1: Rancangan Aktiviti Harian': [
    'Sediakan satu rancangan aktiviti harian untuk kumpulan kanak-kanak berumur 3–4 tahun di TASKA anda.',
    'Rancangan mesti merangkumi:\n• objektif pembelajaran bagi setiap slot\n• bahan dan persediaan\n• aktiviti motor kasar, motor halus dan bahasa\n• langkah keselamatan',
    'Muat naik dalam format PDF. Panjang: 2–3 muka surat.',
  ],
  'Tugasan 2: Pemerhatian Kanak-Kanak': [
    'Jalankan pemerhatian ke atas seorang kanak-kanak selama 30 minit semasa waktu bermain bebas.',
    'Rekodkan pemerhatian anda menggunakan borang rekod anekdot, kemudian tulis refleksi ringkas tentang domain perkembangan yang anda lihat.',
    'Jangan dedahkan nama sebenar kanak-kanak. Gunakan nama samaran.',
  ],
}

export const MODULE_BLURB: Record<string, string> = {
  'Week 1': 'Perkembangan kanak-kanak dan keselamatan di TASKA',
  'Week 2': 'Pemakanan, kesihatan dan pembelajaran melalui bermain',
}
