'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Check, Search, SlidersHorizontal, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell, TournamentTabs } from '@/components/admin/admin-shell';
import { Button } from '@/components/ui/button';
import { Field, Input, Stepper } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  Avatar,
  EmptyState,
  Kicker,
  LoadingState,
  Numeral,
  Tag,
} from '@/components/ui/primitives';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { cn, formatDateTime, formatMs, formatNumber } from '@/lib/utils';

interface AdminParticipant {
  participantId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  status: 'PENDING' | 'ACTIVE' | 'DISQUALIFIED';
  joinedAt: string;
  connected: boolean;
  totalPoints: number;
  correctCount: number;
  wrongCount: number;
  answeredCount: number;
  rank: number | null;
  bestStreak: number;
  averageResponseMs: number | null;
  disqualifiedReason: string | null;
}

export default function RosterPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, mutate } = useSWR<{ participants: AdminParticipant[] }>(
    `/api/tournaments/${params.id}/participants`,
    fetcher,
    { refreshInterval: 12_000 },
  );

  const [search, setSearch] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<AdminParticipant | null>(null);
  const [reason, setReason] = React.useState('');
  const [adjustTarget, setAdjustTarget] = React.useState<AdminParticipant | null>(null);
  const [adjustPoints, setAdjustPoints] = React.useState(0);
  const [adjustNote, setAdjustNote] = React.useState('');

  const all = data?.participants ?? [];
  const participants = all.filter((participant) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      participant.displayName.toLowerCase().includes(needle) ||
      participant.username.toLowerCase().includes(needle) ||
      participant.email.toLowerCase().includes(needle)
    );
  });

  const pending = all.filter((participant) => participant.status === 'PENDING');
  const connected = all.filter((participant) => participant.connected).length;

  const act = async (participantId: string, body: Record<string, unknown>, success: string) => {
    setBusy(participantId);
    try {
      await api.patch(`/api/tournaments/${params.id}/participants/${participantId}`, body);
      await mutate();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'That action failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell
      kicker="Who is in"
      title="Roster"
      tabs={<TournamentTabs tournamentId={params.id} />}
      actions={
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search players"
            aria-label="Search players"
            className="pl-11"
          />
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rail bg-rail">
          <div className="bg-deck px-4 py-4">
            <Numeral value={all.length} label="On roster" size="md" tone="volt" />
          </div>
          <div className="bg-deck px-4 py-4">
            <Numeral value={connected} label="Connected" size="md" tone="win" />
          </div>
          <div className="bg-deck px-4 py-4">
            <Numeral
              value={pending.length}
              label="Awaiting approval"
              size="md"
              tone={pending.length ? 'flag' : 'chalk'}
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Reading the roster" />
        ) : participants.length ? (
          <div className="overflow-hidden rounded-md border border-rail">
            {participants.map((participant) => (
              <div
                key={participant.participantId}
                className={cn(
                  'flex flex-col gap-3 border-b border-rail bg-deck p-4 last:border-0 sm:flex-row sm:items-center',
                  participant.status === 'DISQUALIFIED' && 'opacity-50',
                  participant.status === 'PENDING' && 'bg-flag/5',
                )}
              >
                <span className="numeral hidden w-10 shrink-0 text-[1.25rem] text-ghost sm:block">
                  {participant.rank ? `#${participant.rank}` : '—'}
                </span>

                <Avatar
                  name={participant.displayName}
                  src={participant.avatarUrl}
                  size={38}
                  ring={participant.connected ? 'volt' : null}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-data text-[14px] font-bold text-chalk">
                      {participant.displayName}
                    </p>
                    {participant.status === 'PENDING' ? (
                      <Tag tone="flag">Awaiting approval</Tag>
                    ) : participant.status === 'DISQUALIFIED' ? (
                      <Tag tone="loss">Removed</Tag>
                    ) : participant.connected ? (
                      <Tag tone="win">Connected</Tag>
                    ) : (
                      <Tag>Offline</Tag>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-ghost">{participant.email}</p>
                  <p className="mt-1 font-data text-[11px] uppercase tracking-[0.08em] text-ghost tnum">
                    {formatNumber(participant.totalPoints)} pts · {participant.correctCount}/
                    {participant.answeredCount} correct · {formatMs(participant.averageResponseMs)} ·
                    joined {formatDateTime(participant.joinedAt)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {participant.status === 'PENDING' ? (
                    <Button
                      size="sm"
                      variant="win"
                      loading={busy === participant.participantId}
                      onClick={() =>
                        act(participant.participantId, { action: 'APPROVE' }, 'Player approved')
                      }
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                      Let them in
                    </Button>
                  ) : null}

                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Adjust score"
                    title="Adjust score"
                    onClick={() => {
                      setAdjustTarget(participant);
                      setAdjustPoints(0);
                      setAdjustNote('');
                    }}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>

                  {participant.status === 'DISQUALIFIED' ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Reinstate"
                      title="Reinstate"
                      loading={busy === participant.participantId}
                      onClick={() =>
                        act(participant.participantId, { action: 'REINSTATE' }, 'Reinstated')
                      }
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove player"
                      title="Remove player"
                      onClick={() => {
                        setRemoveTarget(participant);
                        setReason('');
                      }}
                    >
                      <UserMinus className="h-4 w-4 text-loss" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={search ? 'No match' : 'Nobody yet'}
            description={
              search
                ? 'No player on this roster matches that search.'
                : 'Read the tournament code out to the room and watch them arrive.'
            }
          />
        )}
      </div>

      <Sheet
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        kicker="Disqualify"
        title={`Remove ${removeTarget?.displayName ?? ''}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={async () => {
                if (!removeTarget) return;
                await act(
                  removeTarget.participantId,
                  { action: 'DISQUALIFY', reason: reason || null },
                  'Player removed',
                );
                setRemoveTarget(null);
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-smoke">
            They drop to the bottom of the rankings and cannot answer again. It is written to the
            audit log.
          </p>
          <Field label="Reason" hint="Sent to the player with their notification.">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Suspected second account"
            />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        kicker="Manual adjustment"
        title={`Adjust ${adjustTarget?.displayName ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={async () => {
                if (!adjustTarget) return;
                await act(
                  adjustTarget.participantId,
                  { action: 'ADJUST_SCORE', points: adjustPoints, note: adjustNote || null },
                  'Score adjusted',
                );
                setAdjustTarget(null);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-smoke">
            Written to the score ledger and the audit log, then their totals are recomputed from
            source. Use a negative number to take points away.
          </p>
          <Field label="Points">
            <Stepper
              value={adjustPoints}
              onChange={setAdjustPoints}
              min={-10000}
              max={10000}
              step={10}
              suffix="pts"
            />
          </Field>
          <Field label="Note">
            <Input
              value={adjustNote}
              onChange={(event) => setAdjustNote(event.target.value)}
              placeholder="Compensation for a dropped connection"
            />
          </Field>
        </div>
      </Sheet>
    </AdminShell>
  );
}
