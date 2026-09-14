import { describe, expect, it } from 'vitest';
import { depositToastMessage } from './deposit-toast';

/**
 * The toast is the only place the repaid/fresh split is put in front of the user at the
 * moment it happens. If it ever collapses back to one number, goal G6 is gone with it --
 * the app would be congratulating a deposit that moved the balance and not the target.
 */
describe('depositToastMessage', () => {
  it('names both numbers when part of the deposit only patched a withdrawal', () => {
    // Fixture D, July: 2jt in, 600rb of it putting June's advance back.
    const message = depositToastMessage(2_000_000, 600_000, 1_400_000);

    expect(message.title).toBe('Masuk Rp 2.000.000');
    expect(message.description).toBe('Rp 600.000 nutup utang, Rp 1.400.000 nambah tabungan.');
  });

  it('does not invent a debt line when there was nothing to repay', () => {
    const message = depositToastMessage(1_000_000, 0, 1_000_000);

    expect(message.title).toBe('Masuk Rp 1.000.000');
    expect(message.description).toBe('Semuanya nambah tabungan.');
  });

  it('still reports the fresh figure when a deposit only repaid debt', () => {
    const message = depositToastMessage(600_000, 600_000, 0);

    expect(message.description).toBe('Rp 600.000 nutup utang, Rp 0 nambah tabungan.');
  });
});
