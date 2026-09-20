'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Display, Kicker, LoadingState } from '@/components/ui/primitives';
import { Wordmark } from '@/components/layout/app-shell';
import { ApiClientError, api } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import type { SessionUserDTO } from '@/types';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSession();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await api.post<{ user: SessionUserDTO }>('/api/auth/login', { email, password });
      await mutate();
      toast.success(`Welcome back, ${result.user.displayName}`);

      const next = params.get('next');
      router.push(next || (result.user.role === 'ADMIN' ? '/admin' : '/dashboard'));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'We could not sign you in. Try again.',
      );
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] grid-field" aria-hidden />

      <header className="container flex h-16 items-center">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>

      <main className="container relative flex flex-1 flex-col justify-center pb-10">
        <div className="mx-auto w-full max-w-sm">
          <Kicker tone="volt">Competitor access</Kicker>
          <Display size="xl" as="h1" className="mt-2">
            Enter the
            <br />
            arena
          </Display>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email or username" htmlFor="email" required>
              <Input
                id="email"
                autoComplete="username"
                autoCapitalize="none"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field label="Password" htmlFor="password" required error={error}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>

            <Button type="submit" size="xl" block loading={loading} loadingLabel="Opening the gate">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ghost">
            First time here?{' '}
            <Link href="/register" className="font-semibold text-volt hover:underline">
              Create a competitor profile
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center">
          <LoadingState message="Opening the gate" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
