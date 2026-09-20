'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Display, Kicker } from '@/components/ui/primitives';
import { Wordmark } from '@/components/layout/app-shell';
import { ApiClientError, api } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import type { SessionUserDTO } from '@/types';

export default function RegisterPage() {
  const router = useRouter();
  const { mutate } = useSession();

  const [form, setForm] = React.useState({
    displayName: '',
    username: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const result = await api.post<{ user: SessionUserDTO }>('/api/auth/register', form);
      await mutate();
      toast.success(`You're on the roster, ${result.user.displayName}`);
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setErrors(
        error instanceof ApiClientError
          ? (error.fieldErrors ?? { form: error.message })
          : { form: 'We could not create your profile. Try again.' },
      );
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[45vh] grid-field" aria-hidden />

      <header className="container flex h-16 items-center">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>

      <main className="container relative flex-1 pb-12">
        <div className="mx-auto w-full max-w-sm py-6">
          <Kicker tone="volt">New competitor</Kicker>
          <Display size="xl" as="h1" className="mt-2">
            Claim your
            <br />
            name
          </Display>
          <p className="mt-3 text-[14px] leading-relaxed text-ghost">
            Your display name is what the rankings will shout when you climb.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Display name" htmlFor="displayName" required error={errors.displayName}>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={update('displayName')}
                placeholder="Ahmed"
                required
              />
            </Field>

            <Field
              label="Username"
              htmlFor="username"
              required
              error={errors.username}
              hint="Letters, numbers, dots and dashes."
            >
              <Input
                id="username"
                autoCapitalize="none"
                value={form.username}
                onChange={update('username')}
                placeholder="ahmed"
                required
              />
            </Field>

            <Field label="Email" htmlFor="email" required error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                value={form.email}
                onChange={update('email')}
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              required
              error={errors.password ?? errors.form}
              hint="At least 8 characters, with a letter and a number."
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={update('password')}
                placeholder="••••••••"
                required
              />
            </Field>

            <Button type="submit" size="xl" block loading={loading} loadingLabel="Registering">
              Join the roster
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ghost">
            Already competing?{' '}
            <Link href="/login" className="font-semibold text-volt hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
