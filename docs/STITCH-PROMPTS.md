# Budget Tracker — Prompt pack buat Google Stitch

Pendamping `DESIGN-BRIEF.md`. Isinya **prompt siap tempel**, satu per layar, buat
[Google Stitch](https://stitch.withgoogle.com).

Dokumen ini beda tujuan dengan brief-nya:

| | `DESIGN-BRIEF.md` | `STITCH-PROMPTS.md` (file ini) |
|---|---|---|
| Buat siapa | manusia (temen lo yang ngedesain) | mesin (Stitch) |
| Bentuknya | naratif + alasan + screenshot | instruksi imperatif, satu layar satu blok |
| Panjang | 600+ baris, dibaca sekali penuh | tiap blok < 2.000 karakter, ditempel satu-satu |
| "Kenapa"-nya | penting, itu inti dokumennya | dibuang — Stitch nggak butuh alasan, cuma butuh isi layar |

**Stitch nggak makan file.** Nggak ada slot upload `design.md`. Yang dia terima cuma teks
prompt di kolom chat (plus gambar referensi). Jadi markdown-nya perlu dipecah jadi
potongan-potongan sebesar prompt, bukan satu dokumen panjang.

---

## Cara pakai

1. **Bikin project baru**, pilih **Mobile**.
2. **Tempel blok "Style" di bawah dulu** sebagai prompt pertama, digabung dengan prompt
   layar pertama. Ini yang ngunci bahasa visualnya.
3. Lanjut **satu layar satu prompt**. Jangan minta semua layar sekaligus — hasilnya
   berantakan dan boros credit.
4. Mau ubah warna/font belakangan: **shift-click beberapa layar sekaligus**, lalu kasih
   satu prompt perubahan. Ini cara jaga konsistensi antar layar.
5. Ekspor: **Standard mode (Gemini 2.5 Flash)** buat layout cepat + ekspor ke Figma;
   **Experimental (Gemini 2.5 Pro)** buat hasil lebih rapi + input gambar, tapi ekspornya
   cuma kode.

### Tiga hal yang bikin hasilnya jauh lebih bagus

- **Tulis instruksi dalam bahasa Inggris, tapi kunci teks UI-nya dalam bahasa Indonesia
  pakai tanda kutip.** Model-nya paling ngerti instruksi Inggris, dan string dalam kutip
  cenderung dipakai apa adanya. Semua prompt di bawah udah begini.
- **Upload screenshot dari `docs/screenshots/` sebagai referensi** (butuh Experimental
  mode). Jauh lebih cepat nyampe daripada dijelasin pakai kata-kata.
- **Jangan lewat 5.000 karakter per prompt.** Lewat dari situ Stitch mulai ngedrop
  komponen. Prompt di bawah semuanya aman.

---

## Style — tempel bareng prompt pertama

```
Design system for all screens in this project.

Fonts: headings and all money amounts use "Fraunces" (serif, tabular numerals).
Body and UI text use "Public Sans". Small uppercase labels, receipt lines and
eyebrow text use "IBM Plex Mono" with wide letter-spacing.

Light theme colours: page background #F5F6FB, card surface #FFFFFF, sunken
surface #EDEEF7, border #E1E3F0, primary text #262838, secondary text #5D6079,
muted text #8A8DA6, accent periwinkle #5C63C4, accent tint #E9EAFA, warm amber
#E0B65C with tint #FBF2DE, positive green #3E8C74, negative red #C2536A with
tint #FBE7EA.

Dark theme colours: background #24262E, surface #2C2F39, sunken #343845,
border #3A3E4B, primary text #EDEEF4, secondary #B0B4C4, muted #868B9E,
accent #A3A9F0, accent tint #343A5A, amber #E7C583, positive #7CC0A7,
negative #EC8FA0.

Corner radius: 10px small buttons, 14px inputs and primary buttons, 20px cards,
28px bottom sheets. Shadows are very soft and low-contrast.

Layout: mobile only, 390px wide, single column, 20px side padding. Generous
vertical spacing. Calm and quiet, not dense. Every tappable target at least 44px.

Tone: a personal finance app for one person, warm and human, not corporate.
All UI copy is casual Indonesian.
```

---

## 1 · Home (dompet harian)

```
A mobile home screen for a personal budget app.

Header row: small uppercase mono label "KAMIS, 17 SEPTEMBER 2026", below it a
large serif title "Hari ini". On the right of the header, a small wallet chip
showing a wallet icon and the name "Kencan" with a tiny up/down chevron, then a
moon icon, then a gear icon.

Hero block, sitting directly on the page background with NO card, no border and
no shadow: a small mono uppercase label "SISA HARI INI", then a very large serif
amount "Rp 95.363" in green, then a thin progress bar about 30% filled, then one
small line of text: "dari Rp 136.363 jatah harian" on the left and "terpakai
Rp 41.000" on the right.

Below it, a rounded card with a warm amber tint background and amber border:
mono uppercase label "PROYEKSI WEEKEND", then the sentence "Kalau ga jajan lagi
hari ini, weekend nanti dapet", then a large serif amount "Rp 428.096", then a
small muted line "Masih ada 2 hari kerja di minggu ini."

Then a section header: mono uppercase "MINGGU INI · W3" on the left, a small
accent-coloured text link "Lihat rincian" on the right. Under it a row of 7 small
rounded day cards: SEN 92, SEL 93, RAB 75, KAM 41, JUM —, SAB —, MIN —. Each card
has the weekday abbreviation in small mono on top, the number in bold below, and a
thin progress bar at the bottom. The KAM card is highlighted with an accent
border. The SAB and MIN cards use the warm amber tint background.

Then a section header "TERAKHIR DICATAT" with a "Semua" link on the right, and a
list of 5 rows separated by hairlines. Each row: a small coloured dot, the place
name in regular weight, a muted sub-line "17 Sep · Ngopi · E-wallet", and the
amount right-aligned in mono. Examples: Kopi Tuku Rp 41.000, Bakmi GM Rp 48.000,
Gojek Rp 35.000.

Fixed bottom bar: 4 tabs labelled Home, Minggu, Bulan, Riwayat with simple
line icons, Home active in accent colour, plus a solid accent square button with
a "+" icon at the right end, inside the same bar (not floating).
```

## 2 · Minggu (struk mingguan)

```
A mobile weekly breakdown screen for a budget app.

Header: mono uppercase "RINCIAN MINGGUAN", large serif title "Minggu", wallet
chip + moon icon + gear icon on the right.

Below the header, a period stepper row: a square outlined button with "‹" on the
left, a centred label "W3 · 14–20 Sep" in semibold with a small muted sub-line
"5 hari weekday · 2 hari weekend", and a square "›" button on the right. A small
pill badge reading "Berjalan".

The main element is a RECEIPT CARD — a white card styled like a paper till
receipt. Every line is monospace with a label on the left, a row of dots leading
across, and a right-aligned amount. The lines, in order:

"Budget minggu (5 × 136rb)"  Rp 681.815
"Terpakai di weekday"        − Rp 395.000
"Rollover dari minggu lalu"  + Rp 47.281
then a dashed horizontal rule,
"Budget weekend"             Rp 428.096
"Terpakai di weekend"        − Rp 0
then a double horizontal rule,
"Sisa"                       Rp 428.096   (bold, larger, in green)

Negative amounts are red, positive additions are green. Below the card, one small
muted sentence: "Sisanya masuk ke minggu depan."

Then a section "PER HARI" with a small two-option segmented toggle on the right
labelled "Sisa" and "Terpakai", with "Sisa" selected. Under it, 7 rows. Each row
is three columns: the weekday label on the left in mono, a thin horizontal
progress bar in the middle, and an amount right-aligned in mono. Weekend rows use
a warm amber tint.

Same fixed bottom bar as the other screens: Home, Minggu, Bulan, Riwayat plus an
accent "+" button. Minggu is the active tab.
```

## 3 · Bulan (dashboard)

```
A mobile monthly dashboard screen for a budget app. It is a long scrolling page.

Header: mono uppercase "RINCIAN BULANAN", large serif title "Bulan", wallet chip
and icons on the right. Then a month stepper: "‹" button, centred "September 2026"
with a small muted sub-line "22 hari weekday · Rp 136.363/hari", "›" button
(disabled/greyed).

Section 1 — a summary card: small mono label "SISA BULAN INI" with a large serif
amount "Rp 1.519.000", and on the right a mono label "TERPAKAI" with "Rp 1.306.000".
A thin progress bar underneath with a small marker showing today's position. Below
it two small lines: "42% budget terpakai di hari ke-17" on the left and "Lebih
hemat 15,1% dari pace" in green on the right. A hairline, then a footer row:
"Budget Rp 3 jt" on the left and "Carry-in +Rp 145 rb" in green on the right.

Section 2 — "PER MINGGU": a compact data table that scrolls horizontally, with a
soft gradient fade on the right edge to show there is more. Columns: W, BUDGET,
WEEKDAY, ROLLOVER, WEEKEND, SISA. Five rows W1 to W5. The W3 row is highlighted
with a tinted background. All numbers are mono and right-aligned. Below the table,
a tiny muted caption: "Kolom Sisa: merah = lewat dari budget minggu itu."

Section 3 — "UANGNYA LARI KE MANA" with "Rp 1,31 jt" on the right. A donut chart
on the left with thin gaps between segments, and a legend on the right listing:
Makan Rp 521 rb 40%, Nonton Rp 236 rb 18%, Aktivitas Rp 198 rb 15%, Ngopi
Rp 183 rb 14%, Transport Rp 162 rb 12%. Each legend row has a coloured dot, the
name, the amount and the percentage. Below, a full-width outlined button "Lihat
semua (6) · +Rp 6.000".

Section 4 — "HARI KERJA VS WEEKEND": two horizontal bars, "Hari kerja" in accent
purple at Rp 1,01 jt and "Weekend" in amber at Rp 300 rb.

Section 5 — "TEMPAT PALING NGURAS" with a small segmented toggle on the right
reading "TOTAL" / "RATA-RATA", TOTAL selected. A list of rows: place name bold,
muted sub-line "5× · Makan", amount right-aligned with a tiny mono sub-line
"Rp 53.600/kunjungan".

Section 6 — "PENGELUARAN TERBESAR": simple list rows with place, date sub-line,
and amount.

Section 7 — "METODE BAYAR": rows with method name, a small muted count like "11×",
and the amount.

Fixed bottom bar with Bulan active.
```

## 4 · Budget

```
A mobile screen for setting a monthly budget.

Header: mono uppercase "JATAH HARIAN DIHITUNG DARI SINI", large serif title
"Budget". Month stepper row: "‹", centred "September 2026", "›".

A card containing one big amount input: a small mono label "BUDGET SEPTEMBER
2026" with a red required asterisk, then a row with a small mono "Rp" prefix and
a very large serif number "3.000.000", sitting on a thick accent-coloured bottom
border (an underline-style field, not a boxed input).

Directly under it, a sunken tinted strip with rounded corners showing live
feedback: "22 hari weekday · Rp 136.363/hari · carry-in dari Agt: Rp 145.000".
The daily rate is bold.

A full-width solid accent button "Perbarui budget".

Then a section "RIWAYAT BUDGET" listing previous months. Each row: the month name
bold on the left with a muted sub-line, and on the right three small stacked mono
figures for Budget, Terpakai and Sisa. Sisa is green when positive, red when
negative.

Fixed bottom bar.
```

## 5 · Riwayat (daftar transaksi)

```
A mobile transaction history screen.

Header: mono uppercase "SEMUA PENGELUARAN", large serif title "Riwayat", wallet
chip and icons on the right.

Month stepper: "‹", centred "September 2026" with a muted sub-line "23 transaksi
· Rp 1.306.000", "›".

A search field with a magnifier icon and placeholder "Cari tempat atau catatan",
fully rounded, on a white surface.

A horizontally scrolling row of filter chips that runs off the right edge:
"Hari kerja", "Weekend", then category chips each with a small coloured dot —
"Makan", "Nonton", "Transport", "Ngopi". One chip is selected with an accent
border and tinted background.

Then the list, grouped by date. A small mono uppercase date header like
"17 SEPTEMBER" then rows under it. Each row: a small coloured category dot, the
place name in regular weight, a muted sub-line "17 Sep · Ngopi · E-wallet", and
the amount right-aligned in mono. Rows separated by hairlines.

Fixed bottom bar with Riwayat active.
```

## 6 · Home tabungan

```
A mobile savings-goal home screen.

Header: mono uppercase "TABUNGAN", large serif title "Liburan Jepang", muted
sub-line "Tenggat 2027-06-30 · sisa 9 bulan". On the right, a small outlined
button "Ubah", then a wallet chip, a moon icon and a gear icon. Make sure these
header controls never overlap the title, even when the title wraps to two lines.

Hero block sitting directly on the background with NO card: mono label "SALDO
TABUNGAN", a very large serif amount "Rp 8.450.000", a thin progress bar about
34% filled in green, and one line: "Rp 8.450.000 dari Rp 25.000.000 · 34%".

Card 1 — mono label "PACE", then "Harusnya udah Rp 8.900.000 · lo ketinggalan
Rp 450.000" where the second half is red and bold. Then a second line: "Buat
ngejar tenggat, mulai sekarang harus Rp 1.838.889/bulan" with the amount bold.
Then a small muted line: "Naik dari rencana awal Rp 1.769.230/bulan."

Card 2 — a card with a soft red tint background, NOT alarming: "Lo masih ngutang
Rp 600.000 ke tabungan lo sendiri." with the amount bold, then a smaller muted
line "Saldonya udah kepotong — ini catatan buat balikin, bukan tambahan." On the
right side of the card, a small white outlined button with a back-arrow icon
labelled "Balikin".

Card 3 — mono label "PROYEKSI": "Dengan laju 3 bulan terakhir, target kekejar
Agustus 2027 — telat 2 bulan dari tenggat." then a muted line "Laju sekarang
Rp 1.620.000/bulan."

Section "TERAKHIR" — a list of 5 rows. Each row has a small circular icon badge
on the left: a green-tinted circle with a down-left arrow for deposits, a grey
circle with an up-right arrow for withdrawals. Then a headline and a muted date
sub-line, then the amount right-aligned — deposits in green like "Rp 2.000.000",
withdrawals in dark text with a minus like "-Rp 450.000". Examples: "gajian",
"Kado nikahan sepupu", "sisa budget minggu ini", "Servis motor mendadak".

Fixed bottom bar, but different from the other screens: only 3 tabs — Home,
Riwayat, Bulan — then TWO action buttons at the right end inside the bar: a solid
green square with a download-arrow icon, and an outlined square with an
upload-arrow icon.
```

## 7 · Bulan tabungan

```
A mobile monthly savings summary screen.

Header: mono uppercase "RINCIAN BULANAN", large serif title "Bulan". Month
stepper: "‹", "September 2026", "›".

A RECEIPT CARD styled like a paper till receipt, monospace, with dotted leader
lines between each label and its right-aligned amount:

"Saldo awal"                            Rp 6.880.000
"Setoran"                             + Rp 2.320.000
"— termasuk masuk dari dompet lain"     Rp 320.000   (indented, smaller, muted)
"Dipakai nutup utang"                 − Rp 300.000
"Setoran baru"                          Rp 2.020.000  (emphasised)
"Penarikan"                           − Rp 750.000
then a double rule,
"Saldo akhir"                           Rp 8.450.000  (bold, larger)
"Dibanding rencana"                   + Rp 250.770   (green)

Then a section "PENARIKAN" — the most important list on this screen. Each row
leads with the REASON as the headline in regular weight, e.g. "Kado nikahan
sepupu", with a muted sub-line "9 Sep · Keluarga" and the amount right-aligned.
One row has a small pill badge reading "Lunas" in green; another would read
"Utang" in red.

Only after that list, a small section "PER KATEGORI" with two simple rows: a
coloured dot, the category name, a thin proportional bar, and the amount.
Keluarga Rp 450.000 60%, Impulsif Rp 300.000 40%.

Fixed bottom bar, savings variant: Home, Riwayat, Bulan plus the green deposit
button and the outlined withdraw button.
```

## 8 · Sheet "Catat pengeluaran"

```
A mobile bottom sheet overlaying a blurred screen behind it.

The sheet has a 28px top corner radius, a small centred grab handle bar at the
top, a serif title "Catat pengeluaran" on the left and an X close button on the
right.

Fields in this exact order:

1. Mono uppercase label "NOMINAL" with a red asterisk. A very large serif number
   input showing a grey placeholder "0" with a small mono "Rp" prefix, sitting on
   a thick accent underline. This field is focused.
2. Label "TEMPAT". A rounded text input with placeholder "Bakmi GM". Under it, a
   horizontal row of suggestion chips: "Bakmi GM", "Kopi Tuku".
3. Label "KATEGORI" with a muted "opsional" on the right. A horizontally
   scrolling row of chips, each with a small coloured dot: "Makan", "Nonton",
   "Transport", "Ngopi". Plus a dashed outlined chip "+ Baru" at the end.
4. Label "METODE BAYAR". A row of chips: "Tunai", "QRIS", "Debit", "Kartu
   kredit". "QRIS" is selected with an accent border.
5. Label "TANGGAL" with a red asterisk. Two quick chips "Hari ini" (selected) and
   "Kemarin", next to a compact date input.
6. Label "CATATAN" with muted "opsional". A small rounded textarea with
   placeholder "makan malam".
7. Label "FOTO STRUK". A dashed-border square tile with a camera icon.

At the bottom, a full-width solid accent button "Simpan".
```

## 9 · Sheet "Tarik" (penarikan tabungan)

```
A mobile bottom sheet for withdrawing from a savings wallet, over a blurred
background screen. 28px top radius, grab handle, serif title "Tarik", X button.

The field ORDER MATTERS and must be exactly this — the reason comes FIRST,
before the amount:

1. Mono uppercase label "ALASAN" with a red asterisk, and a muted "0/200"
   character counter on the right. A rounded text input with an accent focus ring
   and placeholder "Kado nikahan sepupu". This field is focused. Under it, a
   horizontal row of recent-reason suggestion chips: "Kado nikahan sepupu",
   "Servis motor mendadak".
2. Label "KATEGORI" with "wajib" in muted text on the right. A horizontally
   scrolling row of chips with coloured dots: "Darurat", "Kesehatan", "Keluarga",
   "Servis & perbaikan", "Impulsif".
3. Label "NOMINAL" with a red asterisk. A very large serif "0" placeholder with a
   small mono "Rp" prefix, sitting on a red underline.
4. Label "TANGGAL". Chips "Hari ini" (selected) and "Kemarin" plus a date input.
5. An unchecked checkbox with the label "Bakal gw balikin".
6. Label "CATATAN" with muted "opsional". A textarea with placeholder "transfer
   ke rekening utama".

At the bottom, a full-width button "Tarik", shown in a disabled/faded accent
state because the form is empty.
```

## 10 · Dialog friksi penarikan

```
A mobile confirmation dialog, centred over a dimmed and blurred background.

A white rounded card, 20px radius, fairly compact.

At the top, a small mono uppercase label "SEBELUM LANJUT".

Then the main content, calm and factual, not alarming:
"Narik Rp 1.500.000 bikin target lo mundur sekitar 1 bulan."
with "mundur sekitar 1 bulan" in bold.

Below it, a sunken tinted block with two small rows, each a label on the left and
a value right-aligned in mono:
"Target kekejar"   "Agu 2027 → Sep 2027"
"Saldo setelah ini"  "Rp 6.950.000"

At the bottom, two buttons side by side. On the LEFT a quiet ghost/text button
"Batal" with no fill and no border. On the RIGHT a solid accent button "Lanjut
tarik". The right button must look completely normal and reachable — this is
friction, not a block, so do not make the confirm button scary, tiny, or
disabled-looking.
```

## 11 · Wallet switcher

```
A mobile bottom sheet listing wallets, over a blurred screen.

28px top radius, grab handle, serif title "Dompet" with a muted sub-line "Pilih
dompet yang mau dibuka", X close button on the right.

Two wallet rows, each a rounded card:

Row 1 is selected: an accent-tinted background with an accent border. On the left
a small rounded square badge with a wallet icon in accent colour. Then the name
"Kencan" in bold serif with a tiny mono uppercase badge "UTAMA" beside it, and a
muted sub-line "Sisa hari ini Rp 95.363 · weekend Rp 428.096". On the right a
check mark and a small pencil icon button.

Row 2: plain white with a hairline border. A green-tinted circular badge with a
piggy-bank icon, the name "Tabungan" in bold serif, a muted sub-line "Liburan
Jepang · Rp 8,45 jt · 34%", and a pencil icon button on the right.

At the bottom, two equal-width outlined buttons side by side: "+ Dompet baru" and
"⇆ Pindah uang".
```

## 12 · Login

```
A minimal mobile login screen for a personal finance app.

Vertically centred, lots of breathing room, page background #F5F6FB.

A serif app title and one short muted line of supporting copy.

Two stacked fields, each with a small mono uppercase label above a rounded input:
"EMAIL" and "PASSWORD".

Below them, a full-width solid accent button "Masuk".

There is NO sign-up link, NO "forgot password" link, and NO social login buttons.
This app is single-user and accounts are created outside the app. Keep the screen
genuinely empty below the button.
```

---

## Yang jangan diharap dari Stitch

Realistis aja, biar nggak buang-buang waktu:

- **Struk dan tabel mingguan nggak bakal akurat.** Dotted leader, aritmetika yang nyambung
  antar baris, tabel 6 kolom yang scroll horizontal — ini bagian yang paling khas dari
  aplikasi lo dan paling sering diberesin Stitch jadi "kartu statistik" biasa. Anggap
  hasilnya draft, terus rapihin manual di Figma.
- **Chart cuma dekoratif.** Donut dan bar yang dia bikin nggak kebaca sebagai data beneran.
  Aturan kontras kategori di §6 brief (3:1 di dua tema, ΔE ≥ 19) harus divalidasi sendiri.
- **Kode ekspornya bukan buat ditempel.** Keluarannya HTML/Tailwind generik — nggak nyambung
  ke token CSS variable, Tailwind v4, dan komponen React yang udah ada. Pakai buat ambil
  arah visual, bukan buat nyalin.
- **Dua varian bottom bar gampang ketuker.** Tiap prompt layar tabungan di atas udah
  nyebut ulang bar 3-tab + 2 tombol; jangan dihapus, soalnya Stitch cenderung balik ke
  pola 4-tab + FAB.

## Alur yang gw saranin

1. Generate layar **1, 6, dan 3** dulu (Home harian, Home tabungan, Bulan). Tiga ini yang
   paling nentuin bahasa visualnya.
2. Kalau arahnya udah kena, shift-select ketiganya dan minta **varian dark mode** pakai
   palet gelap di blok Style.
3. Baru lanjut layar sisanya.
4. Ekspor ke Figma, terus kasih file itu **plus `DESIGN-BRIEF.md`** ke temen lo — Stitch
   ngasih titik berangkat, brief-nya yang ngasih tau mana yang nggak boleh diubah.
