import { Archive, LogOut, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { LoadingBlock } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/lib/api';
import { useArchiveCategory, useCategories, useCreateCategory } from './hooks';

const APP_VERSION = '1.0.0';

/** S9 Settings (PRD 9.2): categories, password, sign out, version. */
export function SettingsPage() {
  const { user, logout } = useAuth();
  const categories = useCategories();
  const createCategory = useCreateCategory();
  const archiveCategory = useArchiveCategory();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#64748B');
  const [changingPassword, setChangingPassword] = useState(false);

  const addCategory = async () => {
    try {
      await createCategory.mutateAsync({ name: newName.trim(), color: newColor });
      toast.success('Kategori ditambahkan');
      setNewName('');
      setAdding(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Gagal menambah kategori');
    }
  };

  return (
    <>
      <PageHeader title="Pengaturan" subtitle={user?.email} />

      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader
            title="Kategori"
            description="Kategori yang diarsip ga muncul lagi pas nyatat, tapi pengeluaran lama tetap kebaca."
            action={
              <Button variant="secondary" size="icon" onClick={() => setAdding(true)} aria-label="Tambah kategori">
                <Plus className="h-4 w-4" />
              </Button>
            }
          />

          {categories.isLoading ? (
            <LoadingBlock />
          ) : (
            <ul className="divide-y divide-line">
              {(categories.data ?? []).map((category) => (
                <li key={category.id} className="flex items-center gap-3 py-2">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
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
        </Card>

        <Card>
          <CardHeader title="Akun" />
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => setChangingPassword(true)}>
              Ganti password
            </Button>
            <Button variant="ghost" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Keluar
            </Button>
          </div>
        </Card>

        <p className="text-center text-xs text-ink-subtle">datebud v{APP_VERSION}</p>
      </div>

      <Sheet open={adding} onOpenChange={setAdding} title="Kategori baru">
        <div className="flex flex-col gap-4">
          <Field label="Nama" required>
            <Input value={newName} maxLength={50} onChange={(event) => setNewName(event.target.value)} />
          </Field>
          <Field label="Warna" hint="dipakai di chart">
            <Input
              type="color"
              value={newColor}
              onChange={(event) => setNewColor(event.target.value.toUpperCase())}
              className="h-12 w-20 p-1"
            />
          </Field>
          <Button size="lg" onClick={addCategory} disabled={newName.trim() === '' || createCategory.isPending}>
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
        <p className="text-xs text-ink-muted">
          Semua perangkat yang lagi login bakal ikut keluar.
        </p>
        <Button size="lg" onClick={submit} disabled={newPassword.length < 8 || submitting}>
          {submitting ? 'Menyimpan…' : 'Ganti password'}
        </Button>
      </div>
    </Sheet>
  );
}
