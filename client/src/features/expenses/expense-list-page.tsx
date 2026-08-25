import { Filter, Search, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  const categories = useCategories();

  const period = params.get('period') ?? currentPeriod();
  const merchantKey = params.get('merchantKey') ?? undefined;
  const categoryId = params.get('categoryId') ? Number(params.get('categoryId')) : undefined;
  const dayType = (params.get('dayType') as ExpenseFilters['dayType']) ?? undefined;

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
      <PageHeader
        title="Riwayat"
        subtitle={`${total} pengeluaran · ${formatRupiah(sumAmount)}`}
      />

      <div className="mb-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" onClick={() => setParam('period', shiftPeriod(period, -1))} aria-label="Bulan sebelumnya">
            ‹
          </Button>
          <span className="flex-1 text-center text-sm font-semibold text-ink">
            {formatPeriodLong(period)}
          </span>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setParam('period', shiftPeriod(period, 1))}
            disabled={period >= currentPeriod()}
            aria-label="Bulan berikutnya"
          >
            ›
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Cari tempat atau catatan"
            className="pl-9"
            aria-label="Cari pengeluaran"
          />
        </div>

        <ChipRow>
          <Chip
            className="h-9"
            selected={dayType === 'WEEKDAY'}
            onClick={() => setParam('dayType', dayType === 'WEEKDAY' ? undefined : 'WEEKDAY')}
          >
            Hari kerja
          </Chip>
          <Chip
            className="h-9"
            selected={dayType === 'WEEKEND'}
            onClick={() => setParam('dayType', dayType === 'WEEKEND' ? undefined : 'WEEKEND')}
          >
            Weekend
          </Chip>

          {(categories.data ?? []).map((category) => (
            <Chip
              key={category.id}
              className="h-9"
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

        {merchantKey ? (
          <button
            type="button"
            onClick={() => setParam('merchantKey', undefined)}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"
          >
            <Filter className="h-3.5 w-3.5" />
            Tempat: {merchantKey}
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <Card>
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
      </Card>
    </>
  );
}
