import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api';
import { formatAmountInput, formatRupiah, parseAmountInput } from '@/lib/format';
import { todayInJakarta } from '@/lib/today';
import type { GoalWithReport } from '@/types/api';
import { useCreateGoal, useUpdateGoal } from './hooks';

/**
 * Setting or revising the target (PRD v2 8.6, 10.3).
 *
 * `planPerMonth` is never entered by hand: the server derives it from the target, the
 * opening balance and the window, and locks it. Editing recomputes it from the *original*
 * start date, so the pace baseline stays one straight line instead of a curve that
 * flatters whatever the balance happens to be today -- which the sheet says out loud,
 * because a silently moving yardstick is how a goal stops meaning anything.
 */
export function GoalSheet({
  open,
  onClose,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  goal: GoalWithReport | null;
}) {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const editing = goal !== null;

  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [openingText, setOpeningText] = useState('');
  const [startDate, setStartDate] = useState(todayInJakarta());
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;

    setName(goal?.name ?? '');
    setTargetText(goal ? formatAmountInput(String(goal.targetAmount)) : '');
    setOpeningText(goal ? formatAmountInput(String(goal.openingBalance)) : '');
    setStartDate(goal?.startDate ?? todayInJakarta());
    setDeadline(goal?.deadline ?? '');
    setNote(goal?.note ?? '');
  }, [open, goal]);

  const targetAmount = parseAmountInput(targetText);
  const openingBalance = parseAmountInput(openingText);
  const pending = createGoal.isPending || updateGoal.isPending;
  const canSave =
    name.trim() !== '' && targetAmount >= 1 && deadline !== '' && deadline >= startDate && !pending;

  const submit = async () => {
    if (!canSave) return;

    try {
      if (editing) {
        await updateGoal.mutateAsync({
          name: name.trim(),
          targetAmount,
          deadline,
          note: note.trim() === '' ? null : note.trim(),
        });
        toast.success('Target diperbarui', { description: 'Rencana per bulan dihitung ulang.' });
      } else {
        await createGoal.mutateAsync({
          name: name.trim(),
          targetAmount,
          openingBalance,
          startDate,
          deadline,
          note: note.trim() === '' ? null : note.trim(),
        });
        toast.success('Target dipasang');
      }

      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menyimpan target');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={editing ? 'Ubah target' : 'Pasang target'}
      description={editing ? undefined : 'Nominal dan tenggat; sisanya dihitung sendiri.'}
    >
      <div className="flex flex-col gap-4">
        <Field label="Nama target" required>
          <Input
            autoFocus={!editing}
            value={name}
            maxLength={100}
            placeholder="Liburan Jepang"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Target nominal" required>
          <div className="flex items-baseline gap-2 border-b-2 border-pos pb-2">
            <span className="font-mono text-[13px] font-medium text-ink-3">Rp</span>
            <Input
              inputMode="numeric"
              placeholder="0"
              aria-label="Target nominal"
              value={targetText}
              onChange={(event) => setTargetText(formatAmountInput(event.target.value))}
              className="amount-display h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-[28px] focus:border-0"
            />
          </div>
        </Field>

        {editing ? null : (
          <Field label="Saldo awal" hint="yang udah ada sekarang">
            <Input
              inputMode="numeric"
              placeholder="0"
              value={openingText}
              onChange={(event) => setOpeningText(formatAmountInput(event.target.value))}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai" required>
            <Input
              type="date"
              value={startDate}
              disabled={editing}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="Tenggat" required>
            <Input
              type="date"
              value={deadline}
              min={startDate}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </Field>
        </div>

        {editing ? (
          <p className="text-[11.5px] text-ink-3">
            Rencana per bulan dihitung ulang dari tanggal mulai yang asli ({goal.startDate}), bukan
            dari hari ini — jadi ketinggalan yang udah kejadian nggak ikut kehapus.
          </p>
        ) : null}

        <Field label="Catatan" hint="opsional">
          <Textarea
            value={note}
            maxLength={500}
            placeholder="tiket + hotel"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {targetAmount >= 1 && deadline !== '' && deadline >= startDate ? (
          <p className="text-[12px] text-ink-2">
            Target {formatRupiah(targetAmount)} sampai {deadline}.
          </p>
        ) : null}

        <Button size="lg" onClick={() => void submit()} disabled={!canSave}>
          {pending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Pasang target'}
        </Button>
      </div>
    </Sheet>
  );
}
