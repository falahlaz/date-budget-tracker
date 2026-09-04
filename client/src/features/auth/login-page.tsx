import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAuth } from './auth-context';

/**
 * S1 (PRD 9.2).
 *
 * There is no sign-up link, and there is no sign-up endpoint behind one: the app is
 * single-user and accounts are created from the CLI (PRD 3, 7.4).
 */
export function LoginPage() {
  const { login, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(
        apiError.code === 'TOO_MANY_REQUESTS'
          ? 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'
          : 'Email atau password salah.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <header>
        <h1 className="title-display text-4xl text-ink">datebud</h1>
        <p className="mt-2 text-sm text-ink-2">
          Budget weekend-mu ditentukan sama disiplin hari kerja.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error ? (
          <p className="rounded-md bg-neg-soft px-3.5 py-3 text-sm text-neg" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'Masuk…' : 'Masuk'}
        </Button>
      </form>
    </main>
  );
}
