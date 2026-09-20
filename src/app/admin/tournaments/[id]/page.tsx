'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Copy, DoorOpen, Play, Rocket, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell, TournamentTabs } from '@/components/admin/admin-shell';
import {
  DEFAULT_FORM,
  TournamentForm,
  toLocalInput,
  type TournamentFormValues,
} from '@/components/admin/tournament-form';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Kicker, LoadingState, Numeral, RuleLabel } from '@/components/ui/primitives';
import { CodePlate, StatusTag } from '@/components/tournament/poster';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import type { ScoringConfigDTO, TieBreakerKey, TournamentSummaryDTO } from '@/types';

interface DetailResponse {
  tournament: TournamentSummaryDTO & {
    rules: string | null;
    allowLateJoin: boolean;
    showLeaderboardAfterQuestion: boolean;
    showAnswersToParticipants: boolean;
    defaultTimeLimitSeconds: number;
    defaultBasePoints: number;
    scoringConfig: ScoringConfigDTO;
    tieBreakers: TieBreakerKey[];
  };
}

export default function TournamentSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<DetailResponse>(
    `/api/tournaments/${params.id}`,
    fetcher,
  );

  const [form, setForm] = React.useState<TournamentFormValues>(DEFAULT_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const tournament = data?.tournament;
  const locked = tournament ? ['LIVE', 'PAUSED', 'ARCHIVED'].includes(tournament.status) : false;

  React.useEffect(() => {
    if (!tournament) return;
    setForm({
      name: tournament.name,
      description: tournament.description ?? '',
      coverImageUrl: tournament.coverImageUrl ?? '',
      rules: tournament.rules ?? '',
      startAt: toLocalInput(tournament.startAt),
      maxParticipants: tournament.maxParticipants,
      joinByCodeEnabled: tournament.joinByCodeEnabled,
      requireApproval: tournament.requireApproval,
      allowLateJoin: tournament.allowLateJoin,
      showLeaderboardAfterQuestion: tournament.showLeaderboardAfterQuestion,
      showAnswersToParticipants: tournament.showAnswersToParticipants,
      defaultTimeLimitSeconds: tournament.defaultTimeLimitSeconds,
      defaultBasePoints: tournament.defaultBasePoints,
      scoringConfig: tournament.scoringConfig,
      tieBreakers: tournament.tieBreakers,
    });
  }, [tournament]);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.put(`/api/tournaments/${params.id}`, {
        ...form,
        description: form.description || null,
        coverImageUrl: form.coverImageUrl || null,
        rules: form.rules || null,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
        endAt: null,
      });
      await mutate();
      toast.success('Saved');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fieldErrors ?? { form: error.message });
        toast.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const act = async (label: string, run: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await run();
      await mutate();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'That action failed.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !tournament) {
    return (
      <AdminShell title="Setup" tabs={<TournamentTabs tournamentId={params.id} />}>
        <LoadingState message="Loading the setup" />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      kicker="Setup"
      title={tournament.name}
      tabs={<TournamentTabs tournamentId={params.id} />}
      actions={
        <div className="flex items-center gap-2">
          <StatusTag status={tournament.status} />
          <CodePlate code={tournament.code} />
          <button
            type="button"
            aria-label="Copy code"
            title="Copy code"
            onClick={() => {
              void navigator.clipboard.writeText(tournament.code);
              toast.success('Code copied');
            }}
            className="grid h-10 w-10 place-items-center rounded-sm text-ghost transition-colors hover:bg-deck hover:text-chalk"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-section">
        {/* --- stage controls ------------------------------------------ */}
        <section>
          <RuleLabel className="mb-5">Stage</RuleLabel>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-4">
            <Cell
              label="Roster"
              value={`${tournament.participantCount}/${tournament.maxParticipants}`}
            />
            <Cell label="Rounds" value={tournament.questionCount} tone="volt" />
            <Cell label="State" value={tournament.status.replace(/_/g, ' ').toLowerCase()} />
            <Cell label="Code" value={tournament.code} tone="volt" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {tournament.status === 'DRAFT' ? (
              <Button
                size="lg"
                loading={busy === 'publish'}
                disabled={tournament.questionCount === 0}
                onClick={() =>
                  act(
                    'publish',
                    () => api.post(`/api/tournaments/${params.id}/publish`),
                    'Published. Players can enter with the code.',
                  )
                }
              >
                <Rocket className="h-4 w-4" />
                Publish
              </Button>
            ) : null}

            {tournament.status === 'REGISTRATION_OPEN' ? (
              <>
                <Button
                  size="lg"
                  loading={busy === 'lobby'}
                  onClick={() =>
                    act(
                      'lobby',
                      () => api.post(`/api/tournaments/${params.id}/waiting-room`),
                      'Lobby open.',
                    )
                  }
                >
                  <DoorOpen className="h-4 w-4" />
                  Open lobby
                </Button>
                <Button
                  size="lg"
                  variant="steel"
                  loading={busy === 'unpublish'}
                  onClick={() =>
                    act(
                      'unpublish',
                      () => api.delete(`/api/tournaments/${params.id}/publish`),
                      'Back to draft.',
                    )
                  }
                >
                  <Undo2 className="h-4 w-4" />
                  Unpublish
                </Button>
              </>
            ) : null}

            {['REGISTRATION_OPEN', 'WAITING', 'LIVE', 'PAUSED'].includes(tournament.status) ? (
              <Link href={`/admin/tournaments/${params.id}/live`}>
                <Button size="lg" variant="blaze">
                  <Play className="h-4 w-4" strokeWidth={3} />
                  Control room
                </Button>
              </Link>
            ) : null}

            {tournament.status === 'FINISHED' ? (
              <Button
                size="lg"
                variant="steel"
                loading={busy === 'archive'}
                onClick={() =>
                  act('archive', () => api.post(`/api/tournaments/${params.id}/archive`), 'Archived.')
                }
              >
                Archive
              </Button>
            ) : null}

            {!['LIVE', 'PAUSED'].includes(tournament.status) ? (
              <Button size="lg" variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </div>

          {tournament.questionCount === 0 ? (
            <p className="mt-4 rounded-md border border-flag/40 bg-flag/5 px-4 py-3 text-[13px] text-flag">
              Add at least one round before publishing.{' '}
              <Link href={`/admin/tournaments/${params.id}/questions`} className="underline">
                Open the round builder
              </Link>
            </p>
          ) : null}
        </section>

        {locked ? (
          <p className="rounded-md border border-flag/40 bg-flag/5 px-4 py-3 text-[13px] text-flag">
            Setup is read-only while the tournament is running or archived.
          </p>
        ) : null}

        <TournamentForm
          value={form}
          onChange={setForm}
          onSubmit={save}
          saving={saving}
          errors={errors}
          disabled={locked}
          submitLabel="Save changes"
        />
      </div>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kicker="Destructive"
        title="Delete this tournament?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              loading={busy === 'delete'}
              onClick={async () => {
                setBusy('delete');
                try {
                  await api.delete(`/api/tournaments/${params.id}`);
                  toast.success('Tournament deleted');
                  router.push('/admin/tournaments');
                } catch (error) {
                  toast.error(error instanceof ApiClientError ? error.message : 'Delete failed.');
                  setBusy(null);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-smoke">
          Rounds, answers and results go with it. This cannot be undone.
        </p>
      </Sheet>
    </AdminShell>
  );
}

function Cell({
  label,
  value,
  tone = 'chalk',
}: {
  label: string;
  value: React.ReactNode;
  tone?: React.ComponentProps<typeof Numeral>['tone'];
}) {
  return (
    <div className="bg-deck px-4 py-4">
      <Numeral value={value} label={label} size="md" tone={tone} />
    </div>
  );
}
