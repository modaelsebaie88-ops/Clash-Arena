'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatDateTime } from '@/lib/utils';
import { Kicker, LiveTag, Tag } from '@/components/ui/primitives';
import type { TournamentStatusDTO, TournamentSummaryDTO } from '@/types';

const STATUS_COPY: Record<TournamentStatusDTO, { label: string; tone: React.ComponentProps<typeof Tag>['tone'] }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  REGISTRATION_OPEN: { label: 'Entry open', tone: 'volt' },
  WAITING: { label: 'Lobby open', tone: 'blaze' },
  LIVE: { label: 'Live', tone: 'loss' },
  PAUSED: { label: 'Paused', tone: 'flag' },
  FINISHED: { label: 'Complete', tone: 'win' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export function StatusTag({ status, className }: { status: TournamentStatusDTO; className?: string }) {
  if (status === 'LIVE') return <LiveTag className={className} />;
  const meta = STATUS_COPY[status];
  return (
    <Tag tone={meta.tone} className={className}>
      {meta.label}
    </Tag>
  );
}

/** The tournament code, set as a machine-readable plate. */
export function CodePlate({
  code,
  size = 'md',
  className,
}: {
  code: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs border border-rail bg-ink font-data font-extrabold uppercase tracking-[0.22em] text-volt',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[12px]',
        className,
      )}
    >
      {code}
    </span>
  );
}

/** Where a poster should take you, given its state and your membership. */
export function destinationFor(tournament: TournamentSummaryDTO): string {
  const joined = Boolean(tournament.myParticipation);
  switch (tournament.status) {
    case 'LIVE':
    case 'PAUSED':
      return joined ? `/tournaments/${tournament.id}/play` : `/tournaments/${tournament.id}`;
    case 'WAITING':
      return joined ? `/tournaments/${tournament.id}/waiting-room` : `/tournaments/${tournament.id}`;
    case 'FINISHED':
    case 'ARCHIVED':
      return `/tournaments/${tournament.id}/result`;
    default:
      return `/tournaments/${tournament.id}`;
  }
}

/**
 * The tournament poster: an event ticket, not a content card.
 *
 * Index label top-left, Anton title running large, a meta strip along the
 * bottom, and a notch on both edges so it reads as something you tear off.
 */
export function TournamentPoster({
  tournament,
  index,
  className,
}: {
  tournament: TournamentSummaryDTO;
  index?: number;
  className?: string;
}) {
  const joined = Boolean(tournament.myParticipation);
  const full = tournament.participantCount >= tournament.maxParticipants;
  const live = tournament.status === 'LIVE' || tournament.status === 'PAUSED';

  return (
    <Link
      href={destinationFor(tournament)}
      className={cn(
        'pressable group relative block overflow-hidden rounded-lg border border-rail bg-deck',
        live && 'border-loss/50',
        className,
      )}
    >
      {live ? (
        <span className="absolute inset-x-0 top-0 h-1 animate-stripe-scroll hazard" aria-hidden />
      ) : null}

      <div className="relative">
        {tournament.coverImageUrl ? (
          <div className="relative h-28 overflow-hidden border-b border-rail">
            <img
              src={tournament.coverImageUrl}
              alt=""
              className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-deck to-transparent" aria-hidden />
          </div>
        ) : null}

        <div className="px-5 pb-4 pt-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <span className="font-data text-kicker text-volt">
              {index !== undefined ? `#${String(index).padStart(2, '0')}` : tournament.code}
            </span>
            <div className="flex shrink-0 gap-1.5">
              {joined ? <Tag tone="win">Entered</Tag> : null}
              <StatusTag status={tournament.status} />
            </div>
          </div>

          <h3 className="display text-[1.625rem] leading-[0.92] text-chalk transition-colors group-hover:text-volt">
            {tournament.name}
          </h3>

          {tournament.description ? (
            <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-ghost">
              {tournament.description}
            </p>
          ) : null}
        </div>

        {/* Perforation: the seam between the poster and its stub. */}
        <div className="relative flex items-center" aria-hidden>
          <span className="h-3 w-3 -translate-x-1/2 rounded-full bg-ink" />
          <span className="h-px flex-1 border-t border-dashed border-rail" />
          <span className="h-3 w-3 translate-x-1/2 rounded-full bg-ink" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-3">
          <div className="flex gap-5">
            <Stub label="Players" value={`${tournament.participantCount}/${tournament.maxParticipants}`} warn={full} />
            <Stub label="Rounds" value={String(tournament.questionCount)} />
          </div>
          <div className="text-right">
            <Kicker>{tournament.startAt ? 'Starts' : 'Host'}</Kicker>
            <p className="mt-0.5 font-data text-[12px] font-bold text-chalk">
              {tournament.startAt
                ? formatDateTime(tournament.startAt)
                : tournament.host.displayName}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Stub({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <Kicker>{label}</Kicker>
      <p
        className={cn(
          'mt-0.5 font-data text-[15px] font-extrabold tnum',
          warn ? 'text-blaze' : 'text-chalk',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Connection state, shown wherever the arena is live. */
export function SignalDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-data text-[10px] font-bold uppercase tracking-[0.14em]',
        connected ? 'text-win' : 'text-blaze',
      )}
      title={connected ? 'Connected to the arena' : 'Reconnecting'}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-win' : 'animate-live-blink bg-blaze',
        )}
        aria-hidden
      />
      {connected ? 'Signal' : 'Reconnecting'}
    </span>
  );
}
