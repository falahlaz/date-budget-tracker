import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DepositSheet } from './deposit-sheet';

const mutateAsync = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('./hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks')>();
  return {
    ...actual,
    useAdvances: () => ({
      data: {
        outstanding: 300_000,
        items: [
          { id: 1, note: 'Makan', occurredOn: '2026-09-01', outstanding: 100_000 },
          { id: 2, note: 'Tiket', occurredOn: '2026-09-05', outstanding: 50_000 },
          { id: 3, note: 'Tarik Tunai', occurredOn: '2026-09-09', outstanding: 150_000 },
        ],
      },
    }),
    useCreateDeposit: () => ({ mutateAsync, isPending: false }),
  };
});

const allocationInput = (name: string) =>
  screen.getByLabelText(`Alokasi buat ${name}`) as HTMLInputElement;

describe('DepositSheet per-advance selection', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ repaid: 0, fresh: 0 });
  });

  it('settles only the ticked advances and keeps the prefilled amount in step', async () => {
    render(<DepositSheet open onClose={() => {}} settleFirst />);

    const amount = screen.getByLabelText('Nominal setoran') as HTMLInputElement;
    expect(amount.value).toBe('300.000');

    fireEvent.click(screen.getByLabelText('Balikin Tiket'));

    expect(amount.value).toBe('250.000');
    expect(allocationInput('Tiket').value).toBe('0');
    expect(allocationInput('Tiket').disabled).toBe(true);
    expect(allocationInput('Tarik Tunai').value).toBe('150.000');

    fireEvent.click(screen.getByRole('button', { name: 'Setor' }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      amount: 250_000,
      allocations: [
        { transactionId: 1, amount: 100_000 },
        { transactionId: 3, amount: 150_000 },
      ],
    });
  });

  it('runs FIFO over the ticked advances only when the amount was typed', () => {
    render(<DepositSheet open onClose={() => {}} />);

    const amount = screen.getByLabelText('Nominal setoran');
    fireEvent.change(amount, { target: { value: '120000' } });
    fireEvent.click(screen.getByLabelText('Balikin Makan'));

    expect((amount as HTMLInputElement).value).toBe('120.000');
    expect(allocationInput('Makan').value).toBe('0');
    expect(allocationInput('Tiket').value).toBe('50.000');
    expect(allocationInput('Tarik Tunai').value).toBe('70.000');
  });

  it('sends everything to savings when nothing is ticked', async () => {
    render(<DepositSheet open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Nominal setoran'), { target: { value: '80000' } });
    fireEvent.click(screen.getByLabelText('Pakai setoran ini buat nutup dulu'));
    fireEvent.click(screen.getByRole('button', { name: 'Setor' }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ amount: 80_000, applyToAdvances: false });
  });
});
