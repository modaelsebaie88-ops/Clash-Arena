'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Display, Kicker, LoadingState, Numeral } from '@/components/ui/primitives';
import { ApiClientError, api } from '@/lib/client/api';
import { cn } from '@/lib/utils';

/** Codes are PLAY-7X92: four letters, a dash, four characters. */
const SLOTS = 8;
const DASH_AFTER = 4;

function normalise(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, SLOTS);
}

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [code, setCode] = React.useState(() => normalise(params.get('code') ?? ''));
  const [joining, setJoining] = React.useState(false);
  const [joined, setJoined] = React.useState<{
    name: string;
    tournamentId: string;
    players: number;
    pending: boolean;
  } | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (code.length < 4 || joining) return;

    setJoining(true);
    const formatted = `${code.slice(0, DASH_AFTER)}-${code.slice(DASH_AFTER)}`;

    try {
      const result = await api.post<{
        tournamentId: string;
        pendingApproval: boolean;
        alreadyJoined: boolean;
      }>('/api/tournaments/join', { code: formatted });

      const detail = await api.get<{
        tournament: { name: string; participantCount: number };
      }>(`/api/tournaments/${result.tournamentId}`);

      setJoined({
        name: detail.tournament.name,
        tournamentId: result.tournamentId,
        players: detail.tournament.participantCount,
        pending: result.pendingApproval,
      });

      window.setTimeout(
        () => router.push(`/tournaments/${result.tournamentId}/waiting-room`),
        1900,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'That code did not open anything.',
      );
      setJoining(false);
    }
  };

  if (joined) {
    return (
      <AppShell bare>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex min-h-[70dvh] flex-col items-center justify-center text-center"
        >
          <motion.span
            initial={{ scale: 0.3, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 15 }}
            className="grid h-24 w-24 place-items-center rounded-lg bg-volt text-volt-ink"
          >
            <Check className="h-14 w-14" strokeWidth={3.5} />
          </motion.span>

          <Display size="xl" className="mt-6">
            {joined.pending ? 'Request sent' : "You're in"}
          </Display>

          <p className="mt-3 max-w-xs font-data text-[15px] font-bold uppercase tracking-[0.08em] text-volt">
            {joined.name}
          </p>

          <p className="mt-5 text-[14px] text-ghost">
            {joined.pending
              ? 'The host has to wave you through. Hold tight.'
              : 'Welcome to the arena.'}
          </p>

          {!joined.pending ? (
            <div className="mt-8">
              <Numeral value={joined.players} label="Players ready" size="xl" align="center" tone="chalk" />
            </div>
          ) : null}

          <Kicker className="mt-10">Taking you to the lobby</Kicker>
        </motion.div>
      </AppShell>
    );
  }

  const characters = code.padEnd(SLOTS, ' ').split('');

  return (
    <AppShell>
      <div className="relative mx-auto flex max-w-md flex-col items-center py-6 text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-64 grid-field" aria-hidden />

        <div className="relative">
          <Kicker tone="volt">Tournament code</Kicker>
          <Display size="xl" as="h1" className="mt-2">
            Enter the
            <br />
            arena
          </Display>
        </div>

        <form onSubmit={submit} className="relative mt-10 w-full">
          {/* One hidden input drives every box: correct mobile keyboard, paste works. */}
          <div
            className="flex items-center justify-center gap-1.5"
            onClick={() => inputRef.current?.focus()}
          >
            {characters.map((character, index) => (
              <React.Fragment key={index}>
                {index === DASH_AFTER ? (
                  <span className="px-0.5 font-data text-[24px] font-black text-ghost" aria-hidden>
                    -
                  </span>
                ) : null}
                <span
                  className={cn(
                    'grid h-[52px] w-[34px] place-items-center rounded-sm border-2 font-data text-[24px] font-black uppercase transition-all sm:h-[60px] sm:w-[40px] sm:text-[28px]',
                    character.trim()
                      ? 'border-volt bg-volt/10 text-chalk'
                      : 'border-rail bg-deck text-ghost',
                    index === code.length && 'border-volt/70 bg-volt/5',
                  )}
                >
                  {character.trim() || ''}
                </span>
              </React.Fragment>
            ))}
          </div>

          <input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(normalise(event.target.value))}
            className="sr-only"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Tournament code"
          />

          <Button
            type="submit"
            size="xl"
            block
            className="mt-8"
            loading={joining}
            loadingLabel="Opening the gate"
            disabled={code.length < 4}
          >
            Join
          </Button>
        </form>

        <p className="relative mt-8 text-[12px] text-ghost">
          Codes look like{' '}
          <span className="font-data font-bold tracking-[0.15em] text-smoke">PLAY-7X92</span>. Try{' '}
          <button
            type="button"
            className="font-data font-bold tracking-[0.15em] text-volt hover:underline"
            onClick={() => setCode('PLAYAI26')}
          >
            PLAY-AI26
          </button>
          .
        </p>
      </div>
    </AppShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <LoadingState message="Preparing the gate" />
        </AppShell>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
