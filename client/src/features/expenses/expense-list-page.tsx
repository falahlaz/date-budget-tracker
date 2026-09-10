import { Filter, Search, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/app-shell';
import { StepButton } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { EmptyState, ErrorState, LoadingBlock, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { useCategories } from '@/features/categories/hooks';
import { formatPeriodLong, formatRupiah } from '@/lib/format';
import { currentPeriod, shiftPeriod } from '@/lib/today';
import { ExpenseRow } from './expense-row';
import { useInfiniteExpenses, type ExpenseFilters } from './hooks';

/**
 * S5 Expense List (PRD 9.2).
 *
 * Filters live in the URL so a tap through from the monthly dashboard -- "show me
 * everything I spent at this place" -- produces a link that can be shared or bookmarked.
 */
export function ExpenseListPage() {
  const [params, setParams] = useSearchParams();
  // Archived categories still show up in the monthly donut, so a tap-through can land
  // here filtering on one. Fetching them keeps that filter nameable and clearable.
  const categories = useCategories(true);

  const period = params.get('period') ?? currentPeriod();
  const merchantKey = params.get('merchantKey') ?? undefined;
  const categoryId = params.get('categoryId') ? Number(params.get('categoryId')) : undefined;
  const dayType = (params.get('dayType') as ExpenseFilters['dayType']) ?? undefined;

  const allCategories = categories.data ?? [];
  const chipCategories = allCategories.filter((category) => !category.isArchived);
  const selectedCategory = allCategories.find((category) => category.id === categoryId);
  // Gated on isSuccess: while the list is still loading, every id looks unknown, and the
  // pill would flash on screen for a category that does have a chip.
  const orphanCategory =
    categoryId !== undefined &&
    categories.isSuccess &&
    (!selectedCategory || selectedCategory.isArchived);

  const [searchText, setSearchText] = useState(params.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchText);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const filters = useMemo<ExpenseFilters>(
    () => ({
      period,
      categoryId,
      merchantKey,
      dayType,
      q: debouncedSearch || undefined,
    }),
    [period, categoryId, merchantKey, dayType, debouncedSearch],
  );

  const query = useInfiniteExpenses(filters);
  const sentinel = useRef<HTMLDivElement>(null);
  const selectedChip = useRef<HTMLButtonElement>(null);

  // The chip row scrolls sideways, so a category tapped from the monthly donut can land
  // off-screen -- an active filter with nothing on screen to show for it.
  useEffect(() => {
    selectedChip.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [categoryId, chipCategories.length]);

  // Load the next page as the bottom of the list comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [query]);

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value === undefined) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const sumAmount = query.data?.pages[0]?.sumAmount ?? 0;
  const hasFilters = Boolean(categoryId || merchantKey || dayType || debouncedSearch);

  return (
    <>
      <PageHeader eyebrow="Semua pengeluaran" title="Riwayat" />

      <div className="mb-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <StepButton
            onClick={() => setParam('period', shiftPeriod(period, -1))}
            aria-label="Bulan sebelumnya"
          >
            ‹
          </StepButton>
          <div className="min-w-0 text-center">
            <div className="text-[15px] font-semibold text-ink">{formatPeriodLong(period)}</div>
            <div className="tabular mt-0.5 text-[11.5px] text-ink-3">
              {total} pengeluaran · {formatRupiah(sumAmount)}
            </div>
          </div>
          <StepButton
            onClick={() => setParam('period', shiftPeriod(period, 1))}
            disabled={period >= currentPeriod()}
            aria-label="Bulan berikutnya"
          >
            ›
          </StepButton>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Cari tempat atau catatan"
            className="pl-10"
            aria-label="Cari pengeluaran"
          />
        </div>

        <ChipRow>
          <Chip
            selected={dayType === 'WEEKDAY'}
            onClick={() => setParam('dayType', dayType === 'WEEKDAY' ? undefined : 'WEEKDAY')}
          >
            Hari kerja
          </Chip>
          <Chip
            selected={dayType === 'WEEKEND'}
            onClick={() => setParam('dayType', dayType === 'WEEKEND' ? undefined : 'WEEKEND')}
          >
            Weekend
          </Chip>

          {chipCategories.map((category) => (
            <Chip
              key={category.id}
              ref={categoryId === category.id ? selectedChip : undefined}
              accent={category.color}
              selected={categoryId === category.id}
              onClick={() =>
                setParam('categoryId', categoryId === category.id ? undefined : String(category.id))
              }
            >
              {category.name}
            </Chip>
          ))}
        </ChipRow>

        {/* An archived (or stale bookmarked) category has no chip to switch it off, so the
            filter would be invisible and unclearable without this. */}
        {orphanCategory ? (
          <button
            type="button"
            onClick={() => setParam('categoryId', undefined)}
            className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent-ink"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Kategori: {selectedCategory ? `${selectedCategory.name} (diarsip)` : 'terpilih'}
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        {merchantKey ? (
          <button
            type="button"
            onClick={() => setParam('merchantKey', undefined)}
            className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent-ink"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Tempat: {merchantKey}
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title={hasFilters ? 'Ga ada yang cocok' : 'Belum ada pengeluaran bulan ini'}
          description={
            hasFilters ? 'Coba longgarin filternya.' : 'Tap tombol + buat mulai mencatat.'
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {items.map((expense) => (
              <ExpenseRow key={expense.id} expense={expense} />
            ))}
          </ul>

          <div ref={sentinel} className="h-8" />
          {query.isFetchingNextPage ? (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
