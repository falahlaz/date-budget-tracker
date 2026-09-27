import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScanResult } from '@/types/api';
import { ReceiptScanPanel } from './receipt-scan-panel';

const SCANNED: ScanResult = {
  provider: 'JAGO',
  amount: 35_520,
  occurredOn: '2026-09-11',
  merchant: 'Google One',
  paymentMethod: null,
  reference: '625403677390',
  rawText: '',
};

function renderPanel(onScanned = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReceiptScanPanel onScanned={onScanned} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /isi dari bukti bayar/i }));
  return onScanned;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReceiptScanPanel', () => {
  it('will not open the file picker until a provider is chosen', () => {
    renderPanel();

    const picker = () => screen.getByRole<HTMLButtonElement>('button', { name: /^pilih (bukti|gambar)/i });
    expect(picker().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Jago' }));

    expect(picker().disabled).toBe(false);
    expect(picker().textContent).toBe('Pilih gambar');
  });

  it('sends the chosen provider with the image and hands back the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SCANNED), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onScanned = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Jago' }));

    const file = new File([new Uint8Array([0x89, 0x50])], 'jago.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Gambar bukti bayar'), { target: { files: [file] } });

    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(SCANNED));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/transactions/scan');
    const body = init.body as FormData;
    expect(body.get('provider')).toBe('JAGO');
    expect(body.get('file')).toBeInstanceOf(File);
    // Multipart: the browser has to set the boundary itself.
    expect(init.headers['Content-Type']).toBeUndefined();
  });
});
