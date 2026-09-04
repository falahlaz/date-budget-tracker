# PRD — Date Budget Tracker

**Codename:** `datebud`
**Versi dokumen:** 1.1
**Tanggal:** 2026-08-25
**Perubahan v1.1:** field `merchant` (nama tempat) masuk ke scope v1 — beserta normalisasi `merchant_key` (§7.3), endpoint autocomplete (§8.4), agregasi `byMerchant` (§8.6), dan section "tempat paling nguras" di dashboard bulanan (§9.5).
**Owner:** Falah
**Status:** Ready for implementation
**Bahasa dokumen:** Indonesia (prose) + English (identifier, schema, API, code)

---

## 0. Cara baca dokumen ini (untuk coding agent)

Dokumen ini dipakai sebagai satu-satunya sumber kebenaran untuk implementasi.

- Bagian **§4 (Business Rules & Calculation Engine)** bersifat **NORMATIF**. Kalau ada konflik antara bagian lain dan §4, §4 yang menang.
- Bagian **§7 (Data Model)** DDL SQL bersifat **NORMATIF**. ORM schema adalah turunan darinya.
- Bagian **§8 (API Contract)** bersifat **NORMATIF** untuk nama endpoint, shape request/response, dan HTTP status.
- Kata **HARUS / WAJIB** = MUST. **SEBAIKNYA** = SHOULD. **BOLEH** = MAY.
- Semua nominal uang adalah **integer rupiah tanpa desimal**. Tidak ada floating point di mana pun dalam jalur perhitungan uang.
- Semua tanggal dievaluasi di timezone **Asia/Jakarta (UTC+7)**.
- Fitur yang ditandai `[v1.1]` **JANGAN** diimplementasikan di v1.

---

## 1. Konteks & Masalah

Falah punya budget bulanan khusus untuk kencan. Masalahnya budget itu sering habis lebih cepat dari yang diharapkan dan tidak jelas penyebabnya. Dugaan utama: pengeluaran makan yang tidak terkontrol (sering pilih tempat mahal), tapi tidak ada data untuk konfirmasi.

Kebutuhan intinya bukan sekadar "catat pengeluaran", tapi **membuat pengeluaran weekend secara eksplisit bergantung pada disiplin weekday**. Konsepnya: weekday punya jatah harian tetap, dan **apa pun yang tersisa dari jatah weekday itulah yang jadi budget weekend**. Hemat di hari kerja = weekend lebih longgar. Boros di hari kerja = weekend otomatis mengetat.

## 2. Goals

| # | Goal | Ukuran keberhasilan |
|---|---|---|
| G1 | Tahu ke mana larinya uang date | Setiap pengeluaran tercatat dengan kategori dan nama tempat; dashboard bulanan menampilkan breakdown per kategori **dan** ranking tempat paling nguras |
| G2 | Budget weekend otomatis terikat ke sisa weekday | Angka "budget weekend minggu ini" selalu terlihat dan ter-update real-time setelah input |
| G3 | Input pengeluaran cepat (< 20 detik dari HP) | Form quick-add: nominal → tempat (autocomplete, auto-isi kategori) → simpan. Field lain opsional |
| G4 | Bukti pembayaran tidak tercecer | Setiap pengeluaran boleh punya 1+ foto struk, tersimpan dan bisa dibuka lagi |
| G5 | Sisa budget tidak hangus | Sisa akhir bulan otomatis jadi carry-over ke bulan berikutnya |

## 3. Non-Goals (v1)

Berikut **TIDAK** dikerjakan di v1 dan JANGAN diimplementasikan tanpa diminta:

- Multi-user / sharing budget dengan pasangan. Aplikasi ini **single-user**.
- Registrasi publik / signup flow / reset password lewat email.
- Kalender hari libur nasional. Tanggal merah diperlakukan sebagai weekday biasa.
- Integrasi bank, e-wallet, OCR struk, atau import mutasi rekening.
- Budget untuk kategori non-date (belanja bulanan, tagihan, dll).
- Multi-currency. Hanya IDR.
- Notifikasi push / reminder harian.
- Export PDF/Excel.

---

## 4. Business Rules & Calculation Engine (NORMATIF)

### 4.1 Glossary

| Istilah | Definisi |
|---|---|
| **Budget Period** | Satu bulan kalender, diidentifikasi sebagai `YYYY-MM` (contoh `2026-09`) |
| **Weekday** | Senin–Jumat |
| **Weekend** | Sabtu–Minggu |
| **Week segment (Wn)** | Potongan minggu kalender Senin–Minggu yang **di-clip** ke batas bulan |
| **`monthly_budget`** | Nominal yang di-input user di awal bulan |
| **`carry_in`** | Sisa dari bulan sebelumnya (bisa negatif) |
| **`daily_weekday_rate`** | Jatah harian untuk setiap hari weekday di bulan tersebut |
| **`week_budget`** | Total jatah weekday untuk satu week segment |
| **`weekend_budget`** | Jatah weekend, dihitung dari sisa weekday + rollover minggu sebelumnya |
| **`week_remaining`** | Sisa akhir satu week segment (bisa negatif), jadi rollover ke minggu berikutnya |
| **`carry_out`** | `week_remaining` dari week segment terakhir; jadi `carry_in` bulan berikutnya |

### 4.2 Aturan pembentukan Week Segment

Minggu kalender adalah **Senin–Minggu** (ISO 8601: Senin = hari pertama).

Algoritma pembentukan week segment untuk bulan `M`:

```
segments = []
cursor = tanggal 1 bulan M
WHILE cursor masih di dalam bulan M:
    days_to_sunday = 6 - isoWeekdayIndex(cursor)   // Senin=0 ... Minggu=6
    segment_end = MIN(cursor + days_to_sunday hari, hari terakhir bulan M)
    segments.push({ start: cursor, end: segment_end })
    cursor = segment_end + 1 hari
```

Konsekuensi:
- Week segment pertama dan terakhir **boleh lebih pendek dari 7 hari**.
- Satu bulan bisa punya **4 sampai 6** week segment.
- Week segment **tidak pernah melintasi batas bulan**. Sisa hari di minggu yang terpotong menjadi milik bulan sebelahnya.
- Penomoran `week_index` dimulai dari `1`.

**Contoh:** September 2026 (1 Sep = Selasa, 30 hari) menghasilkan 5 segment:

| Wn | Rentang | Weekday | Weekend |
|---|---|---|---|
| W1 | 01–06 Sep | 4 | 2 |
| W2 | 07–13 Sep | 5 | 2 |
| W3 | 14–20 Sep | 5 | 2 |
| W4 | 21–27 Sep | 5 | 2 |
| W5 | 28–30 Sep | 3 | 0 |

### 4.3 Formula

Diberikan satu Budget Period `M`:

```
weekday_count(M)      = jumlah hari Senin–Jumat dalam bulan M
daily_weekday_rate    = FLOOR(monthly_budget / weekday_count)
rounding_remainder    = monthly_budget - (daily_weekday_rate * weekday_count)
```

Untuk setiap week segment `w` (urut dari 1..n):

```
week_budget[w]        = daily_weekday_rate * weekday_days_in_segment[w]
weekday_spent[w]      = SUM(amount pengeluaran yang date-nya Senin–Jumat di dalam segment w)
weekend_spent[w]      = SUM(amount pengeluaran yang date-nya Sabtu–Minggu di dalam segment w)

rollover_in[1]        = carry_in(M) + rounding_remainder
rollover_in[w>1]      = week_remaining[w-1]

weekend_budget[w]     = week_budget[w] - weekday_spent[w] + rollover_in[w]
week_remaining[w]     = weekend_budget[w] - weekend_spent[w]

carry_out(M)          = week_remaining[n]      // n = segment terakhir
carry_in(M+1)         = carry_out(M)
```

Untuk tampilan harian di weekday:

```
day_budget(d)         = daily_weekday_rate           // hanya untuk hari Senin–Jumat
day_spent(d)          = SUM(amount pengeluaran pada tanggal d)
day_remaining(d)      = day_budget(d) - day_spent(d) // informatif saja
```

> **Catatan penting:** `day_remaining` bersifat **informatif**, bukan mekanisme akumulasi. Kelebihan/kekurangan harian di weekday **tidak** di-rollover per hari; semuanya diserap di level minggu lewat `weekend_budget`. Ini disengaja — supaya user cuma perlu ingat satu angka per hari.

### 4.4 Aturan overspend

- Pengeluaran **TIDAK PERNAH ditolak** karena melebihi budget. Data akurat lebih penting dari pemblokiran.
- `weekend_budget[w]`, `week_remaining[w]`, `carry_out`, dan `carry_in` **BOLEH bernilai negatif**.
- Nilai negatif di-rollover apa adanya ke minggu berikutnya, dan dari `carry_out` ke bulan berikutnya.
- UI **HARUS** menandai nilai negatif secara visual (warna merah + label `OVER`).

### 4.5 Aturan carry-over antar bulan

- `carry_in(M)` **TIDAK** menaikkan `daily_weekday_rate`. `daily_weekday_rate` selalu dihitung murni dari `monthly_budget` yang di-input user.
- `carry_in(M)` masuk sebagai `rollover_in[1]`, artinya langsung tersedia di budget weekend W1.
- Alasan desain: angka jatah harian harus **stabil dan gampang diingat** (misal "100 ribu/hari"), tidak berubah-ubah tiap bulan gara-gara carry-over.
- **Base case:** untuk Budget Period paling awal yang ada di database, `carry_in = 0`.
- Kalau ada **gap bulan** (user tidak pernah set budget untuk bulan X, tapi set untuk bulan X-1 dan X+1): `carry_in(X+1) = carry_out(X-1)`. Bulan tanpa budget diabaikan dalam rantai carry-over, tapi pengeluaran di bulan tersebut tetap tercatat dan tampil sebagai pengeluaran tanpa budget (lihat §6.5).

### 4.6 Invariant (WAJIB dipakai sebagai assertion di test)

```
carry_out(M) == monthly_budget(M) + carry_in(M) - total_spent(M)
```

di mana `total_spent(M)` = jumlah seluruh `amount` pengeluaran (weekday + weekend) dalam bulan M.

Invariant ini berlaku **selalu**, tanpa peduli distribusi pengeluaran. Kalau tidak berlaku, implementasi salah.

### 4.7 Determinisme & recompute

- **TIDAK ADA** angka turunan yang jadi sumber kebenaran. Semua angka di §4.3 **HARUS** dihitung ulang dari `expenses` + `monthly_budgets`.
- Engine perhitungan **HARUS** diimplementasikan sebagai **pure function**:
  `computeMonth(monthlyBudget, carryIn, expenses[]) -> MonthReport`
  Tanpa akses DB, tanpa `Date.now()`, tanpa efek samping. Ini yang di-unit-test.
- `carry_out` **BOLEH** di-cache di kolom `monthly_budgets.carry_out_cached` untuk menghindari rekursi panjang, tapi cache **HARUS** di-invalidate (di-null-kan) untuk bulan tersebut **dan semua bulan sesudahnya** setiap kali ada create/update/delete expense atau perubahan `monthly_budget`.
- Edit atau hapus pengeluaran tanggal lama **HARUS** membuat semua angka bulan itu dan bulan-bulan sesudahnya ikut berubah.

---

## 5. Golden Fixtures (WAJIB jadi test case)

### 5.1 Fixture A — bulan ideal (contoh dari user)

Input: `monthly_budget = 2.000.000`, bulan dengan `weekday_count = 20`, `carry_in = 0`, semua week segment punya 5 weekday.

`daily_weekday_rate = 100.000`, `week_budget = 500.000` per minggu.

| Wn | week_budget | weekday_spent | rollover_in | weekend_budget | weekend_spent | week_remaining |
|---|---|---|---|---|---|---|
| W1 | 500.000 | 150.000 | 0 | 350.000 | 250.000 | **100.000** |
| W2 | 500.000 | 150.000 | 100.000 | 450.000 | 250.000 | **200.000** |

Sesuai persis dengan contoh yang diberikan user.

### 5.2 Fixture B — bulan nyata dengan minggu terpotong + overspend

Input: `period = 2026-09`, `monthly_budget = 2.200.000`, `carry_in = 0`.
`weekday_count = 22` → `daily_weekday_rate = 100.000`, `rounding_remainder = 0`.

| Wn | weekday_days | week_budget | weekday_spent | rollover_in | weekend_budget | weekend_spent | week_remaining |
|---|---|---|---|---|---|---|---|
| W1 | 4 | 400.000 | 150.000 | 0 | 250.000 | 250.000 | **0** |
| W2 | 5 | 500.000 | 150.000 | 0 | 350.000 | 250.000 | **100.000** |
| W3 | 5 | 500.000 | 200.000 | 100.000 | 400.000 | 400.000 | **0** |
| W4 | 5 | 500.000 | 100.000 | 0 | 400.000 | 500.000 | **-100.000** |
| W5 | 3 | 300.000 | 120.000 | -100.000 | 80.000 | 0 | **80.000** |

`total_spent = 2.120.000` → `carry_out(2026-09) = 80.000`
Cek invariant: `2.200.000 + 0 - 2.120.000 = 80.000` ✅

Perhatikan W4: weekend overspend 100rb, dan defisitnya langsung memotong budget W5.

### 5.3 Fixture C — pembulatan tidak habis dibagi

Input: `monthly_budget = 2.000.000`, `weekday_count = 21`.
`daily_weekday_rate = FLOOR(2.000.000 / 21) = 95.238`
`rounding_remainder = 2.000.000 - (95.238 × 21) = 2`

Sisa 2 rupiah masuk ke `rollover_in[1]`. Invariant tetap harus terpenuhi.

> **SEBAIKNYA** UI membulatkan tampilan `daily_weekday_rate` ke ribuan terdekat untuk keterbacaan, tapi perhitungan internal tetap pakai nilai eksak.

---

## 6. Edge Cases (WAJIB ditangani eksplisit)

| # | Kasus | Perilaku yang WAJIB |
|---|---|---|
| 6.1 | Bulan dimulai hari Sabtu/Minggu (contoh Agustus 2026: W1 = 1–2 Agu, weekday=0) | `week_budget[1] = 0`, jadi `weekend_budget[1] = carry_in`. Kalau `carry_in = 0`, weekend pertama praktis tanpa jatah dan langsung minus. Ini **perilaku yang diterima**, tapi UI **HARUS** menampilkan banner penjelasan di W1: *"Minggu ini belum ada jatah weekday, budget weekend-nya minus dulu dan ketutup minggu depan."* |
| 6.2 | Bulan berakhir hari Jumat (W terakhir tanpa weekend) | `weekend_spent = 0`, `week_remaining = weekend_budget`. Seluruhnya jadi `carry_out`. Tidak ada penanganan khusus. |
| 6.3 | User belum set budget bulan berjalan | Dashboard menampilkan empty state + CTA "Set budget bulan ini". Input pengeluaran **tetap diizinkan**. |
| 6.4 | User set budget di tengah bulan (bukan tanggal 1) | Diizinkan. Perhitungan tetap berlaku untuk **seluruh bulan**, termasuk pengeluaran yang sudah tercatat sebelum budget di-set. |
| 6.5 | Ada pengeluaran di bulan yang tidak punya `monthly_budget` | Pengeluaran tetap tersimpan dan tampil di list. Bulan itu diperlakukan sebagai `monthly_budget = 0` untuk tampilan (semua angka minus), **tetapi dikeluarkan dari rantai carry-over** sesuai §4.5. |
| 6.6 | Expense diedit ke tanggal di bulan lain | Kedua bulan (asal & tujuan) dan semua bulan sesudah yang paling awal **HARUS** ter-recompute. Cache carry_out di-invalidate. |
| 6.7 | `monthly_budget` diubah setelah ada pengeluaran | Diizinkan. Semua angka bulan itu dan sesudahnya ter-recompute. |
| 6.8 | Expense dengan `amount = 0` | Ditolak. `amount` **HARUS** `>= 1`. |
| 6.9 | Expense dengan tanggal di masa depan | Ditolak jika `> today` (Asia/Jakarta). Response `422`. |
| 6.10 | `monthly_budget <= 0` | Ditolak. **HARUS** `>= 1`. |
| 6.11 | Upload foto gagal setelah expense tersimpan | Expense tetap tersimpan tanpa foto. Client menampilkan opsi retry upload. Upload foto **TIDAK** boleh membatalkan penyimpanan expense. |
| 6.12 | Hapus kategori yang masih dipakai expense | Kategori di-soft-delete (`is_archived = true`). Expense lama tetap merujuk ke kategori tersebut. Kategori yang di-archive tidak muncul di dropdown input baru. |
| 6.13 | Timezone | Server **HARUS** menentukan "hari ini" pakai Asia/Jakarta, bukan UTC. Pengeluaran jam 23:30 WIB tanggal 5 tetap masuk tanggal 5. |
| 6.14 | Bulan tanpa weekday sama sekali | Tidak mungkin terjadi di kalender Gregorian. Tetap tambahkan guard `weekday_count > 0` sebelum pembagian untuk mencegah division-by-zero. |
| 6.15 | `merchant` diisi hanya spasi / emoji / tanda baca | `normalizeMerchant()` menghasilkan string kosong → simpan `NULL` di `merchant` **dan** `merchant_key`. Jangan simpan string kosong. |
| 6.16 | Dua ejaan berbeda untuk tempat yang sama ("Bakmi GM" vs "Bakmi-GM") | Keduanya menghasilkan `merchant_key` yang sama, jadi otomatis tergabung di laporan. `displayName` mengikuti ejaan yang **terakhir** dipakai. |
| 6.17 | User mengubah ejaan `merchant` di satu expense lama | Hanya baris itu yang berubah. **JANGAN** rename massal semua expense dengan `merchant_key` sama — fitur merge/rename adalah `[v1.1]` (§14). |
| 6.18 | Expense tanpa `merchant` (mayoritas di awal pemakaian) | Tetap valid. Di `byMerchant` masuk ke entri `merchantKey: null` / `"Tanpa tempat"` yang selalu diurutkan paling bawah. Di list, baris utama fallback ke nama kategori. |

---

## 7. Data Model (NORMATIF)

### 7.1 Prinsip

- Money disimpan sebagai **`INT` (signed, rupiah bulat)**. Batas atas ±2.147.483.647 — jauh di atas kebutuhan. **JANGAN** pakai `DECIMAL`, `FLOAT`, atau `BIGINT`.
- Tanggal pengeluaran disimpan sebagai **`DATE`** (tanpa jam), bukan `DATETIME`. Ini menghindari seluruh kelas bug timezone.
- `created_at` / `updated_at` disimpan sebagai `DATETIME` dalam **UTC**.
- Soft delete pakai kolom `deleted_at DATETIME NULL`. Semua query **HARUS** memfilter `deleted_at IS NULL`.

### 7.2 DDL (MySQL 8.0)

```sql
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE refresh_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,          -- sha256 hex dari refresh token
  expires_at  DATETIME NOT NULL,
  revoked_at  DATETIME NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(50) NOT NULL,
  color       CHAR(7) NOT NULL DEFAULT '#64748B',   -- hex, dipakai di chart
  icon        VARCHAR(40) NULL,                     -- nama icon lucide-react
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_category_user_name (user_id, name),
  CONSTRAINT fk_category_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE monthly_budgets (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  period            CHAR(7) NOT NULL,       -- format 'YYYY-MM'
  amount            INT NOT NULL,           -- rupiah, >= 1
  carry_out_cached  INT NULL,               -- cache, NULL = perlu recompute
  note              VARCHAR(255) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_budget_user_period (user_id, period),
  CONSTRAINT fk_budget_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE expenses (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  category_id     INT UNSIGNED NULL,
  spent_on        DATE NOT NULL,            -- tanggal WIB, tanpa jam
  amount          INT NOT NULL,             -- rupiah, >= 1
  merchant        VARCHAR(120) NULL,        -- nama tempat, apa adanya seperti diketik user
  merchant_key    VARCHAR(120) NULL,        -- hasil normalisasi `merchant`, dipakai untuk grouping
  payment_method  ENUM('CASH','QRIS','DEBIT','CREDIT','TRANSFER','EWALLET','OTHER')
                  NOT NULL DEFAULT 'CASH',
  note            VARCHAR(500) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_expense_user_date (user_id, spent_on, deleted_at),
  KEY idx_expense_category (category_id),
  KEY idx_expense_merchant (user_id, merchant_key, deleted_at),
  CONSTRAINT fk_expense_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_expense_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  expense_id    INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  storage_key   VARCHAR(255) NOT NULL,   -- path relatif, contoh 'receipts/2026/09/uuid.webp'
  thumb_key     VARCHAR(255) NULL,
  mime_type     VARCHAR(60) NOT NULL,
  size_bytes    INT UNSIGNED NOT NULL,
  width         SMALLINT UNSIGNED NULL,
  height        SMALLINT UNSIGNED NULL,
  original_name VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_receipt_expense (expense_id),
  CONSTRAINT fk_receipt_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7.3 Normalisasi `merchant` (NORMATIF)

Tanpa normalisasi, "Bakmi GM", "bakmi gm ", dan "Bakmi-GM" jadi tiga tempat berbeda dan laporan "tempat paling nguras" langsung ga berguna. Karena itu:

- `merchant` menyimpan teks **apa adanya** seperti diketik user — ini yang ditampilkan di UI.
- `merchant_key` adalah hasil normalisasi dan **satu-satunya** kolom yang boleh dipakai untuk `GROUP BY`, dedupe, dan pencocokan autocomplete.
- Server **HARUS** menghitung ulang `merchant_key` setiap kali `merchant` di-set atau di-update. Client **DILARANG** mengirim `merchantKey`.

Fungsi normalisasi (deterministik, wajib dipakai persis seperti ini):

```ts
export function normalizeMerchant(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const key = raw
    .normalize('NFKD')                  // pisahkan diakritik
    .replace(/[\u0300-\u036f]/g, '')    // buang diakritik  ("Café" -> "Cafe")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');         // buang SEMUA spasi, tanda baca, dan simbol
  return key.length === 0 ? null : key;
}
```

Hasil yang dijamin (jadi test case T11/T12):

| Input | `merchant_key` |
|---|---|
| `"Bakmi GM"` | `"bakmigm"` |
| `" bakmi  gm "` | `"bakmigm"` |
| `"Bakmi G.M."` | `"bakmigm"` |
| `"BAKMI GM!"` | `"bakmigm"` |
| `"Bakmi-GM"` | `"bakmigm"` |
| `"Café Batavia"` | `"cafebatavia"` |
| `"Cafe Batavia"` | `"cafebatavia"` |
| `""` / `"   "` / `"!!!"` / `"🍜"` / `null` | `null` |

Spasi sengaja ikut dibuang, bukan cuma dirapatkan. Alasannya: yang mau digabung itu ejaan yang berbeda-beda untuk tempat yang sama, dan spasi adalah salah satu sumber variasi terbesar (`"Bakmi GM"` vs `"BakmiGM"` vs `"Bakmi-GM"`). Urutan kata tetap berpengaruh, jadi tempat yang benar-benar berbeda tidak akan tertukar.

`merchant_key` **tidak pernah ditampilkan ke user** — ini murni kunci grouping. Yang tampil selalu `merchant`.

Aturan tambahan:
- Kalau `normalizeMerchant(merchant)` menghasilkan `null`, simpan `NULL` di **kedua** kolom — jangan pernah menyimpan string kosong.
- Panjang maksimal `merchant` **120 karakter**; lebih dari itu → `422`.
- `merchant` bersifat **opsional**. Ga ada auto-create tabel master merchant di v1 — daftar tempat diturunkan dari `SELECT DISTINCT` pada `expenses`. Tabel master `[v1.1]` kalau nanti butuh alias/merge manual.

### 7.4 Seed data

Saat migration pertama kali jalan, seed kategori default untuk user:

| name | color | icon |
|---|---|---|
| Makan | `#9D6DE4` | `utensils` |
| Nonton | `#5B9432` | `clapperboard` |
| Transport | `#C557D9` | `car` |
| Ngopi | `#B17C00` | `coffee` |
| Aktivitas | `#E24D98` | `ticket` |
| Gift | `#E25662` | `gift` |
| Lain-lain | `#858499` | `ellipsis` |

Warna di atas bukan pilihan bebas. Warna kategori disimpan sebagai satu hex per row dan
dipakai di light **dan** dark, jadi satu nilai harus jalan di dua-duanya: tiap warna wajib
lolos rasio kontras 3:1 terhadap `#FFFFFF` dan `#2C2F39` sekaligus, dan jarak antar warna
minimal ΔE 19 di CIE Lab supaya potongan donut tetap kebedain buat mata color-blind. Dua
syarat itu dikunci sebagai property test di `default-categories.spec.ts`.

`#858499` adalah warna "Tanpa kategori" (`UNCATEGORISED_COLOR`), jadi dia **tidak** ikut
`CATEGORY_PALETTE` — kategori beneran yang kebagian warna itu bakal ketuker sama
pengeluaran tanpa kategori di donut.

Kategori yang sudah terlanjur pakai palet lama dipindah lewat:

```bash
npm run cli -- categories:recolour [--email=<email>] [--dry-run]
```

User seed dibuat lewat CLI command, **bukan** lewat endpoint publik:

```bash
npm run cli -- user:create --email=<email> --password=<password> --name=<name>
```

Kalau env `SEED_USER_EMAIL` dan `SEED_USER_PASSWORD` di-set, bootstrap otomatis membuat user tersebut **hanya jika tabel `users` masih kosong**.

---

## 8. API Contract (NORMATIF)

Base path: `/api`. Semua response JSON. Semua endpoint kecuali `/api/auth/login` dan `/api/auth/refresh` **WAJIB** terautentikasi.

### 8.1 Konvensi

**Format error (seragam untuk semua error):**

```json
{
  "statusCode": 422,
  "error": "VALIDATION_ERROR",
  "message": "amount must be at least 1",
  "details": [{ "field": "amount", "constraint": "min" }],
  "timestamp": "2026-09-05T10:12:33.000Z",
  "path": "/api/expenses"
}
```

Kode error yang dipakai: `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `INTERNAL_ERROR` (500).

**Format tanggal:** `YYYY-MM-DD` (string). **Format period:** `YYYY-MM` (string). **Format uang:** integer JSON number.

### 8.2 Auth

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` | `200 { accessToken, expiresIn, user: { id, email, displayName } }` + set cookie `refresh_token` (httpOnly, sameSite=lax, secure di prod, maxAge 30d) |
| `POST` | `/api/auth/refresh` | — (baca cookie) | `200 { accessToken, expiresIn }` + rotasi cookie refresh |
| `POST` | `/api/auth/logout` | — | `204`, revoke refresh token + clear cookie |
| `GET` | `/api/auth/me` | — | `200 { id, email, displayName }` |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` | `204`, revoke semua refresh token |

Aturan:
- Access token: JWT HS256, TTL **15 menit**, payload `{ sub, email, iat, exp }`.
- Refresh token: random 32 byte hex, disimpan **hash SHA-256**-nya di DB, TTL **30 hari**, **rotasi setiap refresh** (token lama langsung di-revoke).
- Password hash: **argon2id** (fallback bcrypt cost 12 kalau argon2 bermasalah di environment).
- Rate limit `/api/auth/login`: **5 percobaan / 15 menit / IP**, response `429`.

### 8.3 Budget

| Method | Path | Deskripsi |
|---|---|---|
| `PUT` | `/api/budgets/:period` | Upsert budget bulan. Body `{ amount: number, note?: string }`. Response `200 <MonthlyBudget>`. Meng-invalidate cache period ini dan sesudahnya. |
| `GET` | `/api/budgets/:period` | Ambil budget satu bulan. `404` kalau belum di-set. |
| `GET` | `/api/budgets` | List semua budget, urut `period DESC`. Query: `?limit=&offset=`. |
| `DELETE` | `/api/budgets/:period` | Hapus budget bulan (bukan expense-nya). `204`. |

### 8.4 Expenses

| Method | Path | Deskripsi |
|---|---|---|
| `POST` | `/api/expenses` | Create. Body: `{ spentOn: "YYYY-MM-DD", amount: number, categoryId?: number, merchant?: string, paymentMethod?: enum, note?: string }`. Response `201 <Expense>`. |
| `GET` | `/api/expenses` | List. Query: `period` (`YYYY-MM`), `from`, `to`, `categoryId`, `merchantKey`, `q` (cari di `merchant` + `note`), `dayType` (`WEEKDAY`\|`WEEKEND`), `weekIndex`, `limit` (default 50, max 200), `offset`, `sort` (default `spentOn:desc,id:desc`). Response `200 { items: Expense[], total: number, sumAmount: number }`. |
| `GET` | `/api/expenses/:id` | Detail termasuk receipts. |
| `PATCH` | `/api/expenses/:id` | Update parsial. Field yang sama dengan create. Mengubah `merchant` **HARUS** ikut menghitung ulang `merchant_key` (§7.3). |
| `DELETE` | `/api/expenses/:id` | Soft delete. `204`. |
| `GET` | `/api/expenses/merchants` | Daftar tempat untuk autocomplete. Query: `q` (server menjalankan `normalizeMerchant(q)` dulu, lalu cocokkan `LIKE %key%` ke `merchant_key`), `limit` (default 10, max 50). Response `200 { items: MerchantSuggestion[] }`. |

**Shape `MerchantSuggestion`:**

```json
{
  "merchantKey": "bakmigm",
  "displayName": "Bakmi GM",
  "lastCategoryId": 1,
  "lastPaymentMethod": "QRIS",
  "usageCount": 7,
  "lastSpentOn": "2026-09-19"
}
```

Aturan:
- `displayName` = nilai `merchant` dari expense **terbaru** yang punya `merchant_key` tersebut (jadi ejaan terakhir yang dipakai user yang menang).
- Urutan hasil: `usageCount DESC, lastSpentOn DESC`.
- `lastCategoryId` dan `lastPaymentMethod` dipakai client untuk **auto-isi** kategori & metode bayar begitu user memilih sebuah tempat. Ini yang bikin input jadi lebih cepat, bukan lebih lambat, meski ada field tambahan.
- Endpoint ini hanya membaca `expenses` milik user, `deleted_at IS NULL`.

**Shape `Expense`:**

```json
{
  "id": 12,
  "spentOn": "2026-09-05",
  "amount": 125000,
  "dayType": "WEEKDAY",
  "weekIndex": 1,
  "merchant": "Bakmi GM",
  "merchantKey": "bakmigm",
  "paymentMethod": "QRIS",
  "note": "makan malam",
  "category": { "id": 1, "name": "Makan", "color": "#EF4444", "icon": "utensils" },
  "receipts": [
    { "id": 3, "url": "/api/receipts/3/file", "thumbUrl": "/api/receipts/3/file?variant=thumb", "mimeType": "image/webp", "sizeBytes": 84213 }
  ],
  "createdAt": "2026-09-05T13:20:10.000Z",
  "updatedAt": "2026-09-05T13:20:10.000Z"
}
```

`dayType` dan `weekIndex` adalah field **turunan** yang dihitung server, tidak disimpan di DB. `merchantKey` bersifat **read-only** di API — dihitung server, diabaikan kalau dikirim client.

### 8.5 Receipts

| Method | Path | Deskripsi |
|---|---|---|
| `POST` | `/api/expenses/:id/receipts` | `multipart/form-data`, field `files` (boleh multiple, max 5 per request). Response `201 { items: Receipt[] }`. |
| `GET` | `/api/receipts/:id/file` | Stream file. Query `?variant=thumb` untuk thumbnail. **WAJIB** cek `receipt.user_id == req.user.id` sebelum stream. |
| `DELETE` | `/api/receipts/:id` | Soft delete + hapus file dari disk. `204`. |

Aturan upload:
- MIME yang diterima: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`. Selain itu → `415`.
- Max ukuran per file: **10 MB** → lebih dari itu `413`.
- Max **5 receipt per expense**. Lebih dari itu → `409`.
- Server **HARUS** memvalidasi magic bytes file, bukan cuma `Content-Type` header.
- Setelah diterima, gambar dinormalisasi dengan `sharp`: konversi ke **WebP quality 80**, resize sisi terpanjang max **1600px**, strip EXIF. Thumbnail **320px** juga di-generate.
- Nama file di disk: `receipts/<YYYY>/<MM>/<uuidv4>.webp`. Nama asli **JANGAN** dipakai sebagai path.
- File **TIDAK** boleh disajikan lewat static middleware. Harus lewat endpoint terautentikasi.

### 8.6 Reports (inti dashboard)

| Method | Path | Deskripsi |
|---|---|---|
| `GET` | `/api/reports/month/:period` | Laporan bulanan lengkap |
| `GET` | `/api/reports/week/current` | Laporan minggu berjalan (berdasarkan today WIB) |
| `GET` | `/api/reports/week/:period/:weekIndex` | Laporan satu week segment |
| `GET` | `/api/reports/today` | Ringkasan hari ini untuk widget atas |

**Response `GET /api/reports/month/:period`:**

```json
{
  "period": "2026-09",
  "hasBudget": true,
  "monthlyBudget": 2200000,
  "carryIn": 0,
  "roundingRemainder": 0,
  "weekdayCount": 22,
  "weekendCount": 8,
  "dailyWeekdayRate": 100000,
  "totalSpent": 2120000,
  "weekdaySpent": 720000,
  "weekendSpent": 1400000,
  "carryOut": 80000,
  "isOverspent": false,
  "spendableRemaining": 80000,
  "daysElapsed": 30,
  "daysTotal": 30,
  "weeks": [
    {
      "weekIndex": 1,
      "startDate": "2026-09-01",
      "endDate": "2026-09-06",
      "weekdayDays": 4,
      "weekendDays": 2,
      "weekBudget": 400000,
      "weekdaySpent": 150000,
      "rolloverIn": 0,
      "weekendBudget": 250000,
      "weekendSpent": 250000,
      "weekRemaining": 0,
      "isCurrent": false
    }
  ],
  "byCategory": [
    { "categoryId": 1, "name": "Makan", "color": "#EF4444", "amount": 1350000, "share": 0.6368, "count": 18 }
  ],
  "byPaymentMethod": [
    { "paymentMethod": "QRIS", "amount": 1500000, "count": 20 }
  ],
  "byMerchant": [
    {
      "merchantKey": "bakmigm",
      "displayName": "Bakmi GM",
      "amount": 420000,
      "count": 4,
      "avgAmount": 105000,
      "share": 0.1981,
      "categoryName": "Makan"
    }
  ],
  "topExpenses": [
    { "id": 41, "spentOn": "2026-09-19", "amount": 350000, "merchant": "Loewy", "categoryName": "Makan", "note": "anniversary dinner" }
  ]
}
```

`topExpenses` = 5 pengeluaran terbesar bulan itu.

`byMerchant` = agregasi per `merchant_key`, urut `amount DESC`, **maksimal 10 entri**. Aturan:
- Expense tanpa `merchant` dikelompokkan jadi satu entri dengan `merchantKey: null` dan `displayName: "Tanpa tempat"`, dan entri ini **selalu ditaruh paling bawah** apa pun nominalnya.
- `avgAmount = FLOOR(amount / count)` — ini kolom yang paling menjawab pertanyaan "tempat mana yang mahal", beda dari `amount` yang bisa besar cuma gara-gara sering ke sana.
- `categoryName` = kategori yang paling sering dipakai untuk tempat itu (modus); `null` kalau seri atau tidak ada.
`spendableRemaining` = `carryOut` (alias yang lebih ramah untuk UI).

**Response `GET /api/reports/week/current`:**

```json
{
  "period": "2026-09",
  "weekIndex": 2,
  "startDate": "2026-09-07",
  "endDate": "2026-09-13",
  "weekdayDays": 5,
  "weekendDays": 2,
  "weekBudget": 500000,
  "weekdaySpent": 150000,
  "rolloverIn": 0,
  "weekendBudget": 350000,
  "weekendSpent": 250000,
  "weekRemaining": 100000,
  "dailyWeekdayRate": 100000,
  "days": [
    {
      "date": "2026-09-07",
      "dayType": "WEEKDAY",
      "dayBudget": 100000,
      "spent": 50000,
      "remaining": 50000,
      "isToday": false,
      "expenseCount": 1
    }
  ],
  "projection": {
    "weekendBudgetIfNoMoreWeekdaySpend": 350000,
    "remainingWeekdayDays": 3
  }
}
```

**Response `GET /api/reports/today`:**

```json
{
  "date": "2026-09-09",
  "dayType": "WEEKDAY",
  "dayBudget": 100000,
  "spent": 45000,
  "remaining": 55000,
  "weekIndex": 2,
  "weekendBudgetProjected": 305000,
  "monthRemaining": 1180000
}
```

### 8.7 Categories

| Method | Path | Deskripsi |
|---|---|---|
| `GET` | `/api/categories` | List. Query `?includeArchived=true`. |
| `POST` | `/api/categories` | `{ name, color?, icon? }`. `409` kalau nama duplikat. |
| `PATCH` | `/api/categories/:id` | Update `name`, `color`, `icon`, `sortOrder`, `isArchived`. |
| `DELETE` | `/api/categories/:id` | Set `is_archived = true` (bukan hard delete). `204`. |

---

## 9. Frontend — Screens & UX

### 9.1 Prinsip

- **Mobile-first.** Semua layout dirancang untuk lebar 360–430px dulu, baru di-scale ke desktop. Breakpoint: `sm 640 / md 768 / lg 1024`.
- **PWA installable.** `manifest.webmanifest` + service worker (via `vite-plugin-pwa`), app icon, `display: standalone`, theme color. Offline: cukup app shell + cache read-only dashboard terakhir. Offline write **TIDAK** di-scope v1.
- Angka besar diformat `Rp 1.250.000` (locale `id-ID`, tanpa desimal). Di ruang sempit boleh disingkat `1,25 jt`.
- Nilai negatif selalu merah dengan prefix `-` dan badge `OVER`.

### 9.2 Daftar screen

| # | Route | Screen | Isi |
|---|---|---|---|
| S1 | `/login` | Login | Email, password, tombol masuk. Tidak ada link daftar. |
| S2 | `/` | **Home / Today** | Screen default. Lihat §9.3 |
| S3 | `/week` | **Weekly Dashboard** | Lihat §9.4 |
| S4 | `/month` | **Monthly Dashboard** | Lihat §9.5 |
| S5 | `/expenses` | Expense List | List + filter (bulan, kategori, tempat, weekday/weekend) + search box `q`. Nama tempat tampil sebagai baris utama tiap item (fallback ke nama kategori kalau kosong). Infinite scroll. Tap item → detail/edit. |
| S6 | `/expenses/new` | Quick Add (modal/sheet) | Lihat §9.6 |
| S7 | `/expenses/:id` | Expense Detail | Semua field + galeri foto + tombol edit/hapus. |
| S8 | `/budget` | Budget Setup | Set/edit budget per bulan + preview turunan (jatah harian, jumlah weekday, carry-in). List riwayat budget bulanan. |
| S9 | `/settings` | Settings | Kelola kategori, ganti password, logout, info versi. |

Navigasi utama: bottom tab bar (mobile) dengan 4 item — **Home**, **Minggu**, **Bulan**, **Riwayat** — plus **FAB (+)** melayang di tengah untuk quick add.

### 9.3 S2 — Home / Today

Urutan komponen dari atas:

1. **Header**: greeting + nama bulan berjalan + tombol ke `/budget` kalau bulan ini belum ada budget.
2. **Hero card — sisa hari ini** (kalau hari ini weekday):
   Angka besar `Rp 55.000` dengan sub-label `dari Rp 100.000 hari ini`, plus progress ring.
   Kalau hari ini weekend, hero card berganti jadi **sisa budget weekend minggu ini** dengan sub-label `sisa jatah weekend W2`.
3. **Card sekunder — proyeksi weekend**: `Kalau ga jajan lagi hari ini, weekend nanti dapet Rp 305.000`. Ini yang bikin efek disiplinnya kerasa.
4. **Strip 7 hari** minggu berjalan: bulatan per hari, warna hijau (aman) / kuning (>80% terpakai) / merah (over), hari ini di-highlight.
5. **Pengeluaran terakhir**: 5 item terbaru, tap untuk detail.
6. **FAB (+)** buka Quick Add.

### 9.4 S3 — Weekly Dashboard

1. Week picker (‹ W2 · 7–13 Sep ›).
2. **Kartu breakdown minggu**, dibaca seperti struk supaya alur logikanya jelas:

```
Budget minggu ini (5 weekday × 100rb)     Rp 500.000
Terpakai di weekday                     − Rp 150.000
Rollover dari minggu lalu               + Rp   0
─────────────────────────────────────────────────
Budget weekend                            Rp 350.000
Terpakai di weekend                     − Rp 250.000
─────────────────────────────────────────────────
Sisa minggu ini (jadi rollover W3)        Rp 100.000
```

3. Tabel/list 7 hari: tanggal, tipe hari, jatah, terpakai, sisa.
4. List pengeluaran minggu itu, dikelompokkan per hari.

### 9.5 S4 — Monthly Dashboard

1. Month picker (‹ September 2026 ›).
2. **Summary card**: budget, carry-in, total terpakai, sisa/carry-out proyeksi, progress bar besar (terpakai vs budget) + garis penanda "seharusnya sampai hari ini" (pace indicator berbasis `daysElapsed / daysTotal`).
3. **Tabel mingguan** — satu baris per week segment dengan kolom persis seperti Fixture B (`weekBudget`, `weekdaySpent`, `rolloverIn`, `weekendBudget`, `weekendSpent`, `weekRemaining`). Ini tabel paling penting di aplikasi; harus bisa di-scroll horizontal di mobile.
4. **Donut chart per kategori** + legend dengan nominal & persentase. Inilah jawaban G1 ("uangnya lari ke mana").
5. **Bar chart weekday vs weekend**.
6. **Tempat paling nguras** — list dari `byMerchant`, tiap baris menampilkan nama tempat, total, jumlah kunjungan, dan **rata-rata per kunjungan**. Default urut total; ada toggle `Total ⇄ Rata-rata` supaya bisa membedakan "sering ke warung murah" dari "sekali ke tempat mahal". Tap baris → `/expenses?merchantKey=...`.
7. **Top 5 pengeluaran terbesar** bulan itu.
8. **Breakdown per metode bayar** (list sederhana).

### 9.6 S6 — Quick Add

Form dalam bottom sheet, urutan field mengikuti kecepatan input:

1. **Nominal** — numeric keypad, autofocus, format ribuan otomatis saat mengetik. **Wajib.**
2. **Tempat (`merchant`)** — text field dengan **autocomplete** dari `GET /api/expenses/merchants`. Opsional, tapi diletakkan tinggi karena mengisi ini justru **mempercepat** sisa form. Perilaku:
   - Saat kosong/baru fokus: tampilkan 5 tempat paling sering dipakai sebagai chip, satu tap langsung terpilih.
   - Saat mengetik: debounce 250 ms, cocokkan ke `merchant_key`, tampilkan max 8 saran.
   - Memilih saran **auto-mengisi** kategori dan metode bayar dari `lastCategoryId` / `lastPaymentMethod`. User tetap bisa menimpanya.
   - Nama baru yang belum pernah ada tetap boleh disimpan apa adanya (free text, bukan dropdown tertutup).
3. **Kategori** — chip horizontal scrollable, satu tap. **Wajib.** Ter-preselect kalau tempatnya dipilih dari saran.
4. **Tanggal** — default hari ini; shortcut chip `Hari ini` / `Kemarin` / date picker. Tidak boleh masa depan.
5. **Metode bayar** — chip, default `CASH` (atau metode terakhir yang dipakai / dari saran tempat). Opsional.
6. **Catatan** — text field opsional.
7. **Foto struk** — tombol kamera + galeri, preview thumbnail, bisa multiple (max 5). Opsional.
8. Tombol **Simpan**.

Perilaku:
- Expense disimpan lewat `POST /api/expenses` **dulu**, baru foto di-upload ke `POST /api/expenses/:id/receipts`. Kalau upload gagal, expense tetap tersimpan dan muncul toast `Foto gagal diupload — coba lagi?` dengan tombol retry (§6.11).
- Setelah simpan sukses: sheet tertutup, toast konfirmasi berisi **sisa hari ini yang baru**, dan angka di Home/Weekly ter-refresh.
- Kalau input membuat budget jadi minus, tampilkan konfirmasi ringan sebelum simpan: *"Ini bikin weekend minggu ini minus Rp X. Lanjut?"* — tetap boleh dilanjutkan (§4.4).

### 9.7 S8 — Budget Setup

- Input nominal budget untuk period tertentu (default bulan berjalan).
- **Preview langsung** sebelum disimpan:
  `22 hari weekday · Rp 100.000/hari · carry-in dari Agustus: Rp 80.000`
- Kalau budget diubah padahal sudah ada pengeluaran, tampilkan peringatan bahwa seluruh angka bulan ini dan sesudahnya akan dihitung ulang.
- Di bawahnya: riwayat budget per bulan dengan kolom `period`, `amount`, `totalSpent`, `carryOut`.

---

## 10. Tech Stack & Struktur Project

### 10.1 Stack

| Layer | Pilihan | Catatan |
|---|---|---|
| Backend | **NestJS 11** (TypeScript, Express adapter) | Modular, cocok untuk agent |
| ORM | **Prisma 6** | `schema.prisma` diturunkan dari DDL §7.2 dan harus cocok persis |
| Database | **MySQL 8.0** | InnoDB, `utf8mb4` |
| Frontend | **React 19 + Vite 6 + TypeScript** | Di-serve dari dalam Nest |
| Routing FE | `react-router-dom` v7 | |
| State/server cache | **TanStack Query v5** | Invalidate query reports setelah setiap mutasi expense/budget |
| Styling | **Tailwind CSS v4** + **shadcn/ui** | Mobile-first |
| Chart | **Recharts** | Donut + bar |
| Form | `react-hook-form` + `zod` | Skema zod di-share dengan tipe DTO backend |
| Upload | `multer` (memory storage) + **`sharp`** | Normalisasi & thumbnail |
| Auth | `@nestjs/jwt` + `passport-jwt` + `argon2` | |
| Validasi | `class-validator` + `class-transformer` | `ValidationPipe` global, `whitelist: true`, `forbidNonWhitelisted: true` |
| Tanggal | **`date-fns` + `date-fns-tz`** | **JANGAN** pakai `moment` atau `Date` mentah untuk logika kalender |
| API doc | `@nestjs/swagger` di `/api/docs` | Non-prod saja |
| Test | **Vitest** (FE) + **Jest** (BE) + `supertest` | |
| Deploy | **Docker Compose** (app + mysql) | |

### 10.2 React di dalam NestJS

- Frontend berada di `client/`, di-build oleh Vite ke `client/dist`.
- Nest menyajikannya dengan `ServeStaticModule`:
  ```ts
  ServeStaticModule.forRoot({
    rootPath: join(__dirname, '..', 'client', 'dist'),
    exclude: ['/api/{*splat}'],
  })
  ```
- **SPA fallback WAJIB**: request non-`/api` yang tidak cocok dengan file statis harus mengembalikan `index.html` supaya deep-link (`/month`, `/expenses/12`) tidak 404 saat di-refresh.
- Dev mode: Vite dev server di `:5173` dengan proxy `/api` → `:3000`. Production: satu proses Nest saja di `:3000`.
- Script root:
  - `npm run dev` → jalankan Nest watch + Vite dev bersamaan (`concurrently`)
  - `npm run build` → `vite build` lalu `nest build`
  - `npm start` → jalankan `dist/main.js`

### 10.3 Struktur folder

```
datebud/
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/
│  │  ├─ filters/all-exceptions.filter.ts
│  │  ├─ interceptors/transform.interceptor.ts
│  │  ├─ decorators/current-user.decorator.ts
│  │  └─ utils/
│  │     ├─ money.ts               // format & guard integer rupiah
│  │     └─ merchant.ts            // normalizeMerchant(), lihat §7.3
│  ├─ config/                       // konfigurasi + validasi env (zod)
│  ├─ prisma/
│  │  ├─ prisma.module.ts
│  │  ├─ prisma.service.ts
│  │  └─ schema.prisma
│  ├─ modules/
│  │  ├─ auth/
│  │  ├─ users/
│  │  ├─ categories/
│  │  ├─ budgets/
│  │  ├─ expenses/
│  │  ├─ receipts/
│  │  │  └─ storage/               // StorageService (abstraksi disk/S3)
│  │  └─ reports/
│  │     ├─ reports.controller.ts
│  │     ├─ reports.service.ts      // ambil data dari DB
│  │     └─ engine/
│  │        ├─ calendar.ts          // buildWeekSegments(), countWeekdays()
│  │        ├─ compute-month.ts     // PURE FUNCTION, inti aplikasi
│  │        └─ compute-month.spec.ts
│  └─ cli/
├─ client/
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ routes/
│  │  ├─ components/
│  │  ├─ features/{auth,expenses,budget,reports,categories}/
│  │  ├─ lib/{api.ts,format.ts,query.ts}
│  │  └─ types/api.d.ts
│  └─ vite.config.ts
├─ storage/                          // volume: file struk (git-ignored)
├─ prisma/migrations/
├─ docker-compose.yml
├─ Dockerfile
└─ .env.example
```

### 10.4 Abstraksi storage

**WAJIB** dibuat sebagai interface supaya bisa pindah ke S3 tanpa mengubah domain code:

```ts
export interface StorageService {
  save(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

v1 mengimplementasikan `LocalDiskStorageService` dengan root dari env `STORAGE_ROOT` (default `./storage`). Implementasi S3 `[v1.1]` cukup menambah kelas baru + ganti provider di module.

### 10.5 Environment variables

```dotenv
NODE_ENV=development
PORT=3000
APP_TZ=Asia/Jakarta

DATABASE_URL=mysql://datebud:datebud@localhost:3306/datebud

JWT_SECRET=<random 64 hex>
JWT_ACCESS_TTL=15m
REFRESH_TTL_DAYS=30

STORAGE_DRIVER=local
STORAGE_ROOT=./storage
MAX_UPLOAD_MB=10
MAX_RECEIPTS_PER_EXPENSE=5

SEED_USER_EMAIL=
SEED_USER_PASSWORD=
SEED_USER_NAME=
```

Env **HARUS** divalidasi saat boot (zod). Aplikasi gagal start kalau ada yang kurang atau tidak valid.

### 10.6 Docker Compose

Dua service: `app` (build dari Dockerfile multi-stage: build client → build server → runtime slim) dan `mysql:8.0` dengan named volume. `./storage` di-mount sebagai bind volume ke container. Healthcheck MySQL sebelum app start.

---

## 11. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Keamanan** | Semua endpoint (kecuali login/refresh) di-guard JWT. Setiap query **HARUS** di-scope `user_id`. File struk hanya bisa diakses pemiliknya. Helmet aktif. CORS: same-origin di prod. |
| **Uang** | Integer rupiah di seluruh stack. **DILARANG** ada operasi floating point pada nilai uang. Pembagian selalu `Math.floor` + simpan sisanya (§4.3). |
| **Timezone** | `APP_TZ=Asia/Jakarta`. "Hari ini" dan batas bulan ditentukan di zona ini. `spent_on` disimpan sebagai `DATE` polos. |
| **Performa** | Dataset kecil (< 2.000 expense/tahun). `GET /api/reports/month` **HARUS** < 300 ms. Cukup 1 query expense per bulan lalu agregasi di memori — jangan N+1 per minggu. |
| **Reliability** | Semua mutasi yang menyentuh >1 tabel dibungkus transaksi. Upload file dieksekusi **setelah** commit DB. |
| **Aksesibilitas** | Kontras minimal WCAG AA. Target tap minimal 44×44px. Status "over budget" **tidak boleh** dibedakan hanya lewat warna — sertakan label teks. |
| **Logging** | Structured JSON log (pino). **DILARANG** mencatat password, token, atau isi file. |
| **Backup** | Skrip `npm run backup` → `mysqldump` + `tar` folder storage ke satu file bertanggal. |

---

## 12. Acceptance Criteria & Test Plan

### 12.1 Unit test — calculation engine (prioritas tertinggi)

File: `src/modules/reports/engine/compute-month.spec.ts`

| ID | Test | Ekspektasi |
|---|---|---|
| T1 | Fixture A (§5.1) | Angka tiap minggu cocok persis dengan tabel |
| T2 | Fixture B (§5.2) | Semua 5 minggu cocok, `carryOut = 80.000` |
| T3 | Fixture C (§5.3) | `dailyWeekdayRate = 95.238`, `roundingRemainder = 2`, invariant terpenuhi |
| T4 | Invariant property test | Untuk 1.000 set expense acak: `carryOut == budget + carryIn - totalSpent` |
| T5 | Bulan mulai Sabtu (Agustus 2026) | W1 `weekdayDays = 0`, `weekBudget = 0` |
| T6 | Bulan berakhir Jumat | Segment terakhir `weekendDays = 0`, `weekRemaining == weekendBudget` |
| T7 | Overspend beruntun | Nilai negatif ter-propagasi benar ke minggu berikutnya dan ke `carryOut` |
| T8 | `carryIn` negatif dari bulan sebelumnya | Masuk sebagai `rolloverIn[1]` negatif |
| T9 | Tanpa expense sama sekali | `carryOut == monthlyBudget` |
| T10 | `buildWeekSegments()` untuk 24 bulan berturut-turut | Segment kontinu, tanpa gap/overlap, total hari == jumlah hari bulan |
| T11 | `normalizeMerchant()` | `"Bakmi GM"`, `" bakmi  gm "`, `"Bakmi G.M."`, `"BAKMI GM!"` → semuanya `"bakmigm"` |
| T12 | `normalizeMerchant()` untuk input kosong | `""`, `"   "`, `"!!!"`, `"🍜"`, `null`, `undefined` → `null` |
| T13 | Agregasi `byMerchant` | Urut `amount DESC`, max 10 entri, `avgAmount == FLOOR(amount / count)`, entri `null` selalu di posisi terakhir |

### 12.2 E2E test (supertest)

| ID | Skenario |
|---|---|
| E1 | Login → set budget → input 3 expense → `GET /api/reports/month` mengembalikan angka yang benar |
| E2 | Endpoint tanpa token → `401` |
| E3 | Upload receipt PNG → tersimpan sebagai WebP + thumbnail ada |
| E4 | Upload PDF → `415` |
| E5 | Upload file 12 MB → `413` |
| E6 | Upload receipt ke-6 pada satu expense → `409` |
| E7 | Akses `GET /api/receipts/:id/file` milik user lain → `403`/`404` |
| E8 | Expense dengan `spentOn` besok → `422` |
| E9 | Edit `spentOn` expense ke bulan sebelumnya → `carryOut` kedua bulan berubah, cache ter-invalidate |
| E10 | Soft delete expense → hilang dari list dan dari perhitungan report |
| E11 | Login gagal 6× → `429` |
| E12 | Input 3 expense dengan ejaan `merchant` berbeda-beda untuk tempat yang sama → `byMerchant` mengembalikan **1** entri dengan `count: 3` |
| E13 | `GET /api/expenses/merchants?q=bak` → mengembalikan saran dengan `displayName` ejaan terakhir + `lastCategoryId` yang benar |
| E14 | `merchant` 121 karakter → `422` |
| E15 | Client mengirim `merchantKey` di body → diabaikan, server tetap menghitung sendiri |

### 12.3 Definition of Done (v1)

- [ ] Semua test di §12.1 dan §12.2 hijau
- [ ] `docker compose up` menghasilkan aplikasi jalan dengan migration + seed otomatis
- [ ] Login berfungsi; registrasi publik tidak ada
- [ ] Bisa input pengeluaran + foto dari HP dalam < 20 detik
- [ ] Dashboard bulanan menampilkan tabel mingguan sesuai format Fixture B
- [ ] Dashboard bulanan menampilkan ranking "tempat paling nguras" dengan toggle Total ⇄ Rata-rata
- [ ] Autocomplete tempat muncul dan auto-mengisi kategori saat saran dipilih
- [ ] Dashboard mingguan menampilkan kartu breakdown gaya struk (§9.4)
- [ ] Carry-over antar bulan terverifikasi dengan data 2 bulan berturut-turut
- [ ] PWA bisa di-install di Android Chrome dan iOS Safari
- [ ] Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 90

---

## 13. Milestone

| M | Nama | Isi | Estimasi |
|---|---|---|---|
| **M0** | Scaffold | Nest + Vite + Prisma + MySQL + Docker Compose, healthcheck, env validation | 0,5 hari |
| **M1** | **Calculation engine** | `calendar.ts` + `compute-month.ts` + seluruh unit test §12.1. **Dikerjakan pertama, sebelum UI apa pun.** | 1 hari |
| **M2** | Auth | Login, JWT, refresh rotation, guard, CLI seed user, rate limit | 0,5 hari |
| **M3** | Budget & Expense API | CRUD budget, CRUD expense (termasuk `merchant` + `normalizeMerchant`), kategori, endpoint saran merchant, invalidasi cache | 1 hari |
| **M4** | Reports API | 4 endpoint report + agregasi `byMerchant`, disambungkan ke engine | 0,5 hari |
| **M5** | Receipt upload | Multer + sharp + StorageService + endpoint terautentikasi | 0,5 hari |
| **M6** | Frontend inti | Login, Home/Today, Quick Add, Expense List | 1,5 hari |
| **M7** | Dashboard | Weekly + Monthly dashboard, chart, budget setup | 1,5 hari |
| **M8** | PWA & polish | Manifest, service worker, empty state, error state, format angka | 0,5 hari |
| **M9** | Hardening | E2E test, backup script, README, deploy | 0,5 hari |

**M1 adalah jantung aplikasi.** Kalau engine-nya benar dan ter-test, sisanya cuma CRUD dan tampilan.

---

## 14. Future Scope `[v1.1+]`

Dicatat supaya arsitektur v1 tidak menutup jalan, tapi **JANGAN** dikerjakan sekarang:

1. **S3/MinIO storage driver** — sudah disiapkan lewat `StorageService`.
2. **Tabel master merchant** — alias & merge manual ("Bakmi GM PIM" + "Bakmi GM Senayan" → satu tempat), plus kategori default per tempat. v1 sengaja cukup pakai `merchant_key` hasil normalisasi.
3. **Kalender hari libur nasional** — tabel `holidays`, opsi memperlakukan tanggal merah sebagai weekend.
4. **Shared budget dengan pasangan** — butuh entitas `household`, kolom `paid_by` di expense.
5. **Reminder harian** (web push atau bot Telegram) untuk input pengeluaran.
6. **Budget cap per kategori** (contoh: makan max 60% dari budget bulanan).
7. **OCR struk** untuk auto-isi nominal dan nama tempat.
8. **Export CSV/PDF** laporan bulanan.
9. **Offline-first write** dengan antrean IndexedDB + sinkronisasi.

---

## Lampiran A — Referensi implementasi engine

Pseudocode ini **normatif** untuk urutan operasi. Bahasa boleh menyesuaikan.

```ts
type DayType = 'WEEKDAY' | 'WEEKEND';

interface ExpenseInput { spentOn: string; amount: number; } // 'YYYY-MM-DD', integer IDR

interface WeekSegment {
  weekIndex: number;
  startDate: string;
  endDate: string;
  weekdayDays: number;
  weekendDays: number;
}

function buildWeekSegments(period: string): WeekSegment[] {
  // Senin–Minggu, di-clip ke batas bulan. Lihat §4.2.
}

function computeMonth(input: {
  period: string;
  monthlyBudget: number;   // 0 kalau belum di-set
  carryIn: number;         // boleh negatif
  expenses: ExpenseInput[];
}): MonthReport {
  const segments = buildWeekSegments(input.period);
  const weekdayCount = segments.reduce((s, w) => s + w.weekdayDays, 0);

  if (weekdayCount === 0) throw new Error('invalid calendar month'); // §6.14

  const dailyWeekdayRate = Math.floor(input.monthlyBudget / weekdayCount);
  const roundingRemainder = input.monthlyBudget - dailyWeekdayRate * weekdayCount;

  let rolloverIn = input.carryIn + roundingRemainder;
  const weeks = [];

  for (const seg of segments) {
    const inSeg = input.expenses.filter(e => e.spentOn >= seg.startDate && e.spentOn <= seg.endDate);
    const weekdaySpent = sum(inSeg.filter(e => dayTypeOf(e.spentOn) === 'WEEKDAY'));
    const weekendSpent = sum(inSeg.filter(e => dayTypeOf(e.spentOn) === 'WEEKEND'));

    const weekBudget    = dailyWeekdayRate * seg.weekdayDays;
    const weekendBudget = weekBudget - weekdaySpent + rolloverIn;
    const weekRemaining = weekendBudget - weekendSpent;

    weeks.push({ ...seg, weekBudget, weekdaySpent, rolloverIn, weekendBudget, weekendSpent, weekRemaining });
    rolloverIn = weekRemaining;   // rollover ke minggu berikutnya, boleh negatif
  }

  const carryOut = weeks[weeks.length - 1].weekRemaining;

  // ASSERT (dev only): carryOut === monthlyBudget + carryIn - totalSpent
  return { /* ...lihat shape §8.6 */ };
}
```

Rantai carry-over antar bulan:

```ts
async function resolveCarryIn(userId: number, period: string): Promise<number> {
  const prev = await findPreviousBudgetPeriod(userId, period); // period dengan budget, sebelum `period`
  if (!prev) return 0;                                          // base case §4.5
  if (prev.carryOutCached !== null) return prev.carryOutCached;
  const report = computeMonth({
    period: prev.period,
    monthlyBudget: prev.amount,
    carryIn: await resolveCarryIn(userId, prev.period),          // rekursif
    expenses: await loadExpenses(userId, prev.period),
  });
  await cacheCarryOut(prev.id, report.carryOut);
  return report.carryOut;
}
```

Invalidasi cache: setiap create/update/delete expense atau budget di period `P`, jalankan
`UPDATE monthly_budgets SET carry_out_cached = NULL WHERE user_id = ? AND period >= ?` dengan `?` = `P`
(dan juga period lama kalau `spent_on` berpindah bulan).

---

## Lampiran B — Ringkasan keputusan yang sudah dikunci

| Keputusan | Pilihan |
|---|---|
| Definisi minggu | Kalender Senin–Minggu, di-clip di batas bulan |
| Overspend | Diizinkan, defisit di-rollover ke minggu/bulan berikutnya |
| User | Single-user, registrasi ditutup, seed lewat CLI/env |
| Storage foto | Local disk + Docker Compose, di balik `StorageService` supaya siap pindah S3 |
| Hari libur nasional | Diperlakukan sebagai weekday biasa |
| Carry-over bulan | Masuk sebagai `rolloverIn[1]`, **tidak** menaikkan jatah harian |
| Field expense | `amount`, `spentOn`, `category`, `merchant` (+ `merchantKey` turunan), `paymentMethod`, `note`, `receipts[]` |
| Prioritas UI | Mobile-first, PWA installable |
| Representasi uang | Integer rupiah (`INT`), tanpa desimal, tanpa float |
| Timezone | Asia/Jakarta |
