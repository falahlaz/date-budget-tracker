import { Archive, LogOut, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { LoadingBlock } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { SectionHead, Segmented } from '@/components/ui/section';
import { Sheet } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/lib/api';
import { useTheme, type ThemePreference } from '@/lib/theme';
import type { WalletType } from '@/types/api';
import { useArchiveCategory, useCategories, useCreateCategory } from './hooks';

const APP_VERSION = '1.0.0';

/**
 * Mirrors UNCATEGORISED_COLOR on the server (reports/engine/aggregate.ts).
 *
 * It is only the *starting* value of the picker: a category left on it would be
 * indistinguishable from uncategorised spend in the donut, so the palette deliberately
 * excludes it and the server picks a real colour when none is sent.
 */
const UNCATEGORISED_COLOR = '#6E7290';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
  { value: 'system', label: 'Sistem' },
];

/** S9 Settings (PRD 9.2): categories, password, sign out, version. */
/**
 * Spending and withdrawal categories are separate vocabularies (PRD v2 9.4), and both need
 * managing here. Without the switch, the savings palette seeded with the first savings
 * wallet could never be renamed, recoloured or archived from anywhere in the app.
 */
const CATEGORY_SCOPES: ReadonlyArray<{ value: WalletType; label: string }> = [
  { value: 'DATE_BUDGET', label: 'Kencan' },
  { value: 'SAVINGS', label: 'Tabungan' },
];

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [scope, setScope] = useState<WalletType>('DATE_BUDGET');
  const categories = useCategories(scope);
  const createCategory = useCreateCategory();
  const archiveCategory = useArchiveCategory();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(UNCATEGORISED_COLOR);
  const [changingPassword, setChangingPassword] = useState(false);
  const { preference, resolved, setTheme } = useTheme();

  const addCategory = async () => {
    try {
      await createCategory.mutateAsync({ name: newName.trim(), color: newColor, walletType: scope });
      toast.success('Kategori ditambahkan');
      setNewName('');
      setAdding(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menambah kategori');
    }
  };

  return (
    <>
      {/* The email goes in the subtitle, not the eyebrow: the eyebrow is a mono micro
          label and uppercases what it is given, which mangles an address. */}
      <PageHeader title="Pengaturan" subtitle={user?.email} chrome={false} />

      <section className="mb-7">
        <SectionHead
          title="Tampilan"
          action={
            <Segmented
              label="Tema"
              value={preference}
              onChange={setTheme}
              options={THEME_OPTIONS}
            />
          }
        />
        <p className="text-[11.5px] text-ink-3">
          {preference === 'system'
            ? `Ikut setelan perangkat — sekarang ${resolved === 'dark' ? 'gelap' : 'terang'}.`
            : 'Pilihan ini menang atas setelan perangkat.'}
        </p>
      </section>

      <section className="mb-7">
        <SectionHead
          title="Kategori"
          action={
            <div className="flex items-center gap-2">
              <Segmented label="Jenis kategori" value={scope} onChange={setScope} options={CATEGORY_SCOPES} />
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setAdding(true)}
                aria-label="Tambah kategori"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          }
        />
        <p className="mb-2 text-[11.5px] text-ink-3">
          {scope === 'SAVINGS'
            ? 'Kategori buat alasan penarikan tabungan. Terpisah dari kategori pengeluaran.'
            : 'Kategori yang diarsip ga muncul lagi pas nyatat, tapi pengeluaran lama tetap kebaca.'}
        </p>

        {categories.isLoading ? (
          <LoadingBlock />
        ) : (
          <ul className="divide-y divide-line">
            {(categories.data ?? []).map((category) => (
              <li key={category.id} className="flex items-center gap-3 py-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="flex-1 text-sm text-ink">{category.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Arsipkan ${category.name}`}
                  onClick={() => {
                    archiveCategory.mutate(category.id);
                    toast.success(`${category.name} diarsipkan`);
                  }}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-7">
        <SectionHead title="Akun" />
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => setChangingPassword(true)}>
            Ganti password
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        </div>
      </section>

      <p className="label-micro text-center">datebud v{APP_VERSION}</p>

      <Sheet
        open={adding}
        onOpenChange={setAdding}
        title={scope === 'SAVINGS' ? 'Kategori penarikan baru' : 'Kategori baru'}
      >
        <div className="flex flex-col gap-4">
          <Field label="Nama" required>
            <Input
              value={newName}
              maxLength={50}
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <Field label="Warna" hint="dipakai di chart">
            <Input
              type="color"
              value={newColor}
              onChange={(event) => setNewColor(event.target.value.toUpperCase())}
              className="h-12 w-20 p-1"
            />
          </Field>
          <Button
            size="lg"
            onClick={addCategory}
            disabled={newName.trim() === '' || createCategory.isPending}
          >
            Tambah
          </Button>
        </div>
      </Sheet>

      {changingPassword ? <ChangePasswordSheet onClose={() => setChangingPassword(false)} /> : null}
    </>
  );
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post<void>('/auth/change-password', { currentPassword, newPassword });
      // Every refresh token is revoked server-side, so this session has to end too.
      toast.success('Password diganti. Masuk lagi ya.');
      await logout();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal mengganti password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()} title="Ganti password">
      <div className="flex flex-col gap-4">
        <Field label="Password sekarang" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field label="Password baru" hint="min 8 karakter" required>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <p className="text-xs text-ink-2">Semua perangkat yang lagi login bakal ikut keluar.</p>
        <Button size="lg" onClick={submit} disabled={newPassword.length < 8 || submitting}>
          {submitting ? 'Menyimpan…' : 'Ganti password'}
        </Button>
      </div>
    </Sheet>
  );
}
