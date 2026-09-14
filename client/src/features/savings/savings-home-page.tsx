import { PiggyBank, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Meter, Skeleton } from '@/components/ui/feedback';
import { MoneyHero } from '@/components/ui/money';
import { SectionHead } from '@/components/ui/section';
import { useExpenses } from '@/features/expenses/hooks';
import { formatPeriodLong, formatRupiah } from '@/lib/format';
import type { GoalWithReport } from '@/types/api';
import { DepositSheet } from './deposit-sheet';
import { GoalSheet } from './goal-sheet';
import { SavingsActivityRow } from './savings-activity-row';
import { useGoal } from './hooks';
import { projectionSentence } from './lateness';

/**
 * Savings Home (PRD v2 11.2).
 *
 * The mirror of the date-budget home screen. That one asks "how much may I still spend?";
 * this one asks "how much do I still have to put in?", and every card below the hero
 * exists to make the answer feel like a claim on the next month rather than a statistic.
 */
export function SavingsHomePage() {
  const { data: goal, isLoading, error, refetch } = useGoal();
  const [editing, setEditing] = useState(false);
  const [settling, setSettling] = useState(false);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  if (!goal) {
    return (
      <>
        <PageHeader eyebrow="Tabungan" title="Belum ada target" />
        <EmptyState
          icon={<PiggyBank className="h-8 w-8" />}
          title="Nabung tanpa target itu cuma nyimpen"
          description="Pasang nominal dan tenggat, dan tiap bulan bakal punya angka yang harus dikejar."
          action={<Button onClick={() => setEditing(true)}>Pasang target</Button>}
        />
        <RecentActivity />
        <GoalSheet open={editing} onClose={() => setEditing(false)} goal={null} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Tabungan"
        title={goal.name}
        subtitle={
          goal.monthsLeft > 0
            ? `Tenggat ${goal.deadline} · sisa ${goal.monthsLeft} bulan`
            : `Tenggat ${goal.deadline} · udah lewat ${goal.deadlinePassedDays} hari`
        }
        action={
          <Button size="md" variant="secondary" onClick={() => setEditing(true)}>
            Ubah
          </Button>
        }
      />

      <Hero goal={goal} />
      <PaceCard goal={goal} />
      {goal.outstandingAdvance > 0 ? (
        <AdvanceCard goal={goal} onSettle={() => setSettling(true)} />
      ) : null}
      <ProjectionCard goal={goal} />
      <RecentActivity />

      <GoalSheet open={editing} onClose={() => setEditing(false)} goal={goal} />
      <DepositSheet open={settling} onClose={() => setSettling(false)} settleFirst />
    </>
  );
}

/**
 * The number of the screen, on the ground rather than in a card.
 *
 * `balance`, not `balance − outstandingAdvance`: the advance already left the account and
 * the balance already reflects it. Netting it off here would take the same money away
 * twice, which is why it gets a card of its own instead (v2 5.2).
 */
function Hero({ goal }: { goal: GoalWithReport }) {
  return (
    <section className="mb-7">
      <div className="label-micro mb-2">Saldo tabungan</div>

      <MoneyHero amount={goal.balance} tone={goal.achieved ? 'safe' : 'neutral'} />

      <Meter
        value={goal.balance}
        max={goal.targetAmount}
        fillClassName="bg-pos"
        className="mt-3.5"
      />

      <p className="mt-3 text-[13px] text-ink-2">
        <b className="tabular font-semibold text-ink">{formatRupiah(goal.balance)}</b> dari{' '}
        {formatRupiah(goal.targetAmount)} · {Math.round(goal.progress * 100)}%
      </p>

      {goal.achieved ? (
        <p className="mt-2 text-[12.5px] font-medium text-pos">
          Target kelewat {formatRupiah(goal.surplus)}. Setoran habis ini tetep kecatat.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The pace card (PRD v2 11.2, item 3).
 *
 * Semantic colour, not the accent: being behind plan is a reading about the money, not a
 * piece of the app's identity. The second line is the one that changes behaviour -- the
 * instalment has *risen*, and showing what it rose from is what makes that land.
 */
function PaceCard({ goal }: { goal: GoalWithReport }) {
  const behind = goal.paceDelta < 0;

  return (
    <Card className="mb-7">
      <div className="label-micro mb-2.5">Pace</div>

      <p className="text-[13px] leading-snug text-ink-2">
        Harusnya udah{' '}
        <b className="tabular font-semibold text-ink">{formatRupiah(goal.expectedBalance)}</b>
        {' · '}
        <span className={behind ? 'font-semibold text-neg' : 'font-semibold text-pos'}>
          {behind
            ? `lo ketinggalan ${formatRupiah(Math.abs(goal.paceDelta))}`
            : `lo kelebihan ${formatRupiah(goal.paceDelta)}`}
        </span>
      </p>

      <p className="mt-3 text-[13px] leading-snug text-ink-2">
        {goal.monthsLeft > 0 ? (
          <>
            Buat ngejar tenggat, mulai sekarang harus{' '}
            <b className="tabular font-semibold text-ink">
              {formatRupiah(goal.requiredPerMonth)}
            </b>
            /bulan
          </>
        ) : (
          <>
            Tenggatnya udah lewat, sisanya{' '}
            <b className="tabular font-semibold text-ink">{formatRupiah(goal.remaining)}</b>
          </>
        )}
      </p>

      {goal.requiredPerMonth > goal.planPerMonth ? (
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          Naik dari rencana awal {formatRupiah(goal.planPerMonth)}/bulan.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Money owed back to the wallet (PRD v2 11.2, item 4).
 *
 * `--neg-soft` rather than full red on purpose: this is a reminder, not an alarm. Nothing
 * has gone wrong -- the money was taken deliberately and marked as a debt to himself.
 */
function AdvanceCard({ goal, onSettle }: { goal: GoalWithReport; onSettle: () => void }) {
  return (
    <Card className="mb-7 border-neg/25 bg-neg-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] leading-snug text-ink">
            Lo masih ngutang{' '}
            <b className="tabular font-semibold">{formatRupiah(goal.outstandingAdvance)}</b> ke
            tabungan lo sendiri.
          </p>
          <p className="mt-1.5 text-[11.5px] text-ink-2">
            Saldonya udah kepotong — ini catatan buat balikin, bukan tambahan.
          </p>
        </div>
        <Button size="md" variant="secondary" className="shrink-0" onClick={onSettle}>
          <Undo2 className="h-4 w-4" />
          Balikin
        </Button>
      </div>
    </Card>
  );
}

function ProjectionCard({ goal }: { goal: GoalWithReport }) {
  return (
    <Card className="mb-7">
      <div className="label-micro mb-2.5">Proyeksi</div>
      <p className="text-[13px] leading-snug text-ink-2">
        {projectionSentence(goal, formatPeriodLong)}
      </p>
      {goal.rateBasis === 'PLAN_FALLBACK' ? (
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          Belum ada bulan penuh buat diukur, jadi ini masih pakai rencana awal.
        </p>
      ) : (
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          Laju sekarang {formatRupiah(goal.rate)}/bulan.
        </p>
      )}
    </Card>
  );
}

/**
 * The last five movements (PRD v2 11.2, item 6).
 *
 * A withdrawal shows its reason as the headline; a deposit shows its amount. That
 * asymmetry is the point -- the sentence is what makes a withdrawal reviewable at all.
 */
function RecentActivity() {
  const { data, isLoading } = useExpenses({ limit: 5 });

  return (
    <section>
      <SectionHead title="Terakhir" />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <ul className="divide-y divide-line">
          {data.items.map((transaction) => (
            <SavingsActivityRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<PiggyBank className="h-8 w-8" />}
          title="Belum ada pergerakan"
          description="Tap Setor buat nyatat setoran pertama."
        />
      )}
    </section>
  );
}
