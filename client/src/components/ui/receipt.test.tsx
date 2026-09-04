import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReceiptLine } from './receipt';

/** The figure at the end of the line, past the label and the dotted leader. */
function amountOf(node: HTMLElement): string {
  const spans = node.querySelectorAll('span');
  return spans[spans.length - 1].textContent ?? '';
}

function line(props: Parameters<typeof ReceiptLine>[0]): HTMLElement {
  return render(<ReceiptLine {...props} />).container;
}

/**
 * The receipt is a running total, so each operand has to carry the direction it moves the
 * total in. Getting a sign wrong makes the arithmetic on screen contradict the figure
 * underneath it, which reads as a broken app rather than a bad week.
 */
describe('ReceiptLine signed rows', () => {
  it('renders a deficit rolling in from last week as a subtraction', () => {
    // The engine carries a deficit forward untouched (PRD 4.4), so this is a real state.
    expect(amountOf(line({ label: 'Rollover', amount: -149_239, signed: true }))).toBe('− Rp 149.239');
  });

  it('renders a surplus rolling in from last week as an addition', () => {
    expect(amountOf(line({ label: 'Rollover', amount: 149_239, signed: true }))).toBe('+ Rp 149.239');
  });

  it('renders a zero rollover as an addition', () => {
    expect(amountOf(line({ label: 'Rollover', amount: 0, signed: true }))).toBe('+ Rp 0');
  });

  it('keeps a spend row subtracting when nothing was spent', () => {
    // Guards the -0 case: `-0 < 0` is false, so this used to read "+ Rp 0" on a spend row.
    expect(amountOf(line({ label: 'Terpakai', amount: 0, signed: 'minus' }))).toBe('− Rp 0');
    expect(amountOf(line({ label: 'Terpakai', amount: -0, signed: 'minus' }))).toBe('− Rp 0');
  });

  it('subtracts what a spend row spent', () => {
    expect(amountOf(line({ label: 'Terpakai', amount: 397_400, signed: 'minus' }))).toBe('− Rp 397.400');
  });

  it('leaves an unsigned total as a bare figure', () => {
    expect(amountOf(line({ label: 'Budget weekend', amount: 160_946 }))).toBe('Rp 160.946');
    expect(amountOf(line({ label: 'Budget weekend', amount: -149_239 }))).toBe('-Rp 149.239');
  });
});
