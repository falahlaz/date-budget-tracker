import { parseBca } from './bca.parser';
import { parseGopay } from './gopay.parser';
import { parseJago } from './jago.parser';

/*
 * The texts below are real Tesseract output for the sample screenshots in
 * test/fixtures/scan/, including the noise it produces from status bars and icons. Each
 * provider also has a variant from a different preprocessing pass, with the misreads
 * that pass introduces, so a parser that only works on one lucky read fails here.
 */

const GOPAY_TEXT = `1310 © = 5 N(R @D
¢ < ©
vy

all
Ww
Rp123.000
Semangkuk Asap Duren Sawi
—
v Anda menyimpan 100 |
\\ J
Q Jalan Radin Inten 2, Duren Sawit, Duren Sawit, Jakar...
Rincian transaksi
Status Selesai @
Metode pembayaran Jago @
Waktu 10:16
Tanggal 26 Sep 2026
ID transaksi 0420260926031623F..."@
Acquirer Name Mandiri
Merchant Name Semangkuk Asap Duren...
Merchant Location Jakarta Timur
Split - atur jumlah Split - foto struk Bagi bukti bayar`;

// The amount was lost entirely in this pass, and "Sep" came out as "5ep".
const GOPAY_THRESHOLD_TEXT = `1310 © # &% » NR. @
Semangkuk Asap Duren Sawi
v
Rincian transaksi
Status
Metode pembayaran Jago 3
Waktu 10:16
Tanggal 26 5ep 2026
ID transaxsi 0420260926031625F...
Acguirer Name Mandiri
Merchant Name Semangkuk Asap Duren...
Merchant Location Jakarta Timur`;

const BCA_TEXT = `m-Transfer:
BERHASIL
15/09/2026 17:56:04
Ke 2740271698
EVIRA FEBRIANI

Rp 25.000,00

Ref 198035216`;

const JAGO_TEXT = `nzaoe * Rill @
&  Rincian Transaksi
Google One =
650-2530000 CA
-Rp35.520
625403677390
Kantong Utama
11 September 2026, 10.27
Uang keluar Vv
Saya Butuh Bantuan
CL e—`;

// The faint labels survive in this pass; the masked card number does not, quite.
const JAGO_THRESHOLD_TEXT = `NnR2zaee * Rul @
&  Rincian Transaksi

Google One -

650-2530000 CA

cere sane sees 6066

-Rp35.520

ID Transaksi

625403677390

Dari

Kantong Utama

Tanggal dan waktu

11 September 2026, 10.27`;

describe('parseGopay', () => {
  it('reads a QRIS payment', () => {
    expect(parseGopay(GOPAY_TEXT)).toEqual({
      amount: 123_000,
      occurredOn: '2026-09-26',
      merchant: 'Semangkuk Asap Duren Sawi',
      paymentMethod: 'QRIS',
      // The app truncates the id on screen, so there is nothing trustworthy to copy.
      reference: null,
    });
  });

  it('still finds the date and merchant when the amount was not read', () => {
    expect(parseGopay(GOPAY_THRESHOLD_TEXT)).toMatchObject({
      amount: null,
      occurredOn: '2026-09-26',
      merchant: 'Semangkuk Asap Duren',
      paymentMethod: 'QRIS',
    });
  });

  it('treats a payment without acquirer rows as plain e-wallet money', () => {
    const text = 'Rp50.000\nTransfer ke Budi\nTanggal 1 Okt 2026\nID transaksi A1B2C3D4E5';
    expect(parseGopay(text)).toEqual({
      amount: 50_000,
      occurredOn: '2026-10-01',
      merchant: 'Transfer ke Budi',
      paymentMethod: 'EWALLET',
      reference: 'A1B2C3D4E5',
    });
  });
});

describe('parseBca', () => {
  it('reads an m-Transfer confirmation', () => {
    expect(parseBca(BCA_TEXT)).toEqual({
      amount: 25_000,
      occurredOn: '2026-09-15',
      merchant: 'EVIRA FEBRIANI',
      paymentMethod: 'TRANSFER',
      reference: '198035216',
    });
  });

  it('leaves the recipient empty when the name line was not read', () => {
    const text = 'm-Transfer:\nBERHASIL\n15/09/2026 17:56:04\nKe 2740271698\nRp 25.000,00';
    expect(parseBca(text)).toMatchObject({ merchant: null, amount: 25_000 });
  });
});

describe('parseJago', () => {
  it('reads a card payment even when the grey labels were lost', () => {
    expect(parseJago(JAGO_TEXT)).toEqual({
      amount: 35_520,
      occurredOn: '2026-09-11',
      merchant: 'Google One',
      paymentMethod: null,
      reference: '625403677390',
    });
  });

  it('reads the same receipt when the labels are present', () => {
    expect(parseJago(JAGO_THRESHOLD_TEXT)).toEqual({
      amount: 35_520,
      occurredOn: '2026-09-11',
      merchant: 'Google One',
      paymentMethod: null,
      reference: '625403677390',
    });
  });

  it('marks a masked card number as a debit payment', () => {
    const text = 'Rincian Transaksi\nNetflix\n•••• •••• •••• 6066\n-Rp54.000\n2 Okt 2026';
    expect(parseJago(text)).toMatchObject({ merchant: 'Netflix', paymentMethod: 'DEBIT' });
  });
});
