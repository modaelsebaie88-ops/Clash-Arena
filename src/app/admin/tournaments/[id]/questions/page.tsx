'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell, TournamentTabs } from '@/components/admin/admin-shell';
import {
  QUESTION_TYPE_LABELS,
  QuestionBuilder,
  draftFromQuestion,
  draftToPayload,
  emptyDraft,
  type AdminQuestion,
  type QuestionDraft,
} from '@/components/admin/question-builder';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, Kicker, Numeral, Skeleton, Tag } from '@/components/ui/primitives';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import type { TournamentSummaryDTO } from '@/types';

export default function RoundsPage() {
  const params = useParams<{ id: string }>();

  const { data: detail } = useSWR<{
    tournament: TournamentSummaryDTO & {
      defaultTimeLimitSeconds: number;
      defaultBasePoints: number;
      scoringConfig: { speedBonusPoints: number };
    };
  }>(`/api/tournaments/${params.id}`, fetcher);

  const { data, isLoading, mutate } = useSWR<{ questions: AdminQuestion[] }>(
    `/api/tournaments/${params.id}/questions`,
    fetcher,
  );

  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<QuestionDraft>(() =>
    emptyDraft({ timeLimitSeconds: 30, basePoints: 100 }),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminQuestion | null>(null);
  const [reordering, setReordering] = React.useState(false);

  const questions = data?.questions ?? [];
  const tournament = detail?.tournament;
  const editable = tournament ? !['LIVE', 'PAUSED', 'ARCHIVED'].includes(tournament.status) : true;

  const openCreate = () => {
    setEditingId(null);
    setDraft(
      emptyDraft({
        timeLimitSeconds: tournament?.defaultTimeLimitSeconds ?? 30,
        basePoints: tournament?.defaultBasePoints ?? 100,
        speedBonusPoints: tournament?.scoringConfig?.speedBonusPoints ?? 50,
      }),
    );
    setErrors({});
    setOpen(true);
  };

  const openEdit = (question: AdminQuestion) => {
    setEditingId(question.id);
    setDraft(draftFromQuestion(question));
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload = draftToPayload(draft);
      if (editingId) {
        await api.put(`/api/questions/${editingId}`, payload);
        toast.success('Round updated');
      } else {
        await api.post(`/api/tournaments/${params.id}/questions`, payload);
        toast.success('Round added');
      }
      await mutate();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fieldErrors ?? { form: error.message });
        toast.error(error.message);
      } else {
        setErrors({ form: 'Could not save that round.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    setReordering(true);
    try {
      await api.post(`/api/tournaments/${params.id}/questions/reorder`, {
        orderedIds: next.map((question) => question.id),
      });
      await mutate();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not reorder.');
    } finally {
      setReordering(false);
    }
  };

  const totalPoints = questions.reduce(
    (sum, question) => sum + question.basePoints + question.speedBonusPoints,
    0,
  );
  const totalSeconds = questions.reduce((sum, question) => sum + question.timeLimitSeconds, 0);

  return (
    <AdminShell
      kicker={tournament?.name}
      title="Rounds"
      tabs={<TournamentTabs tournamentId={params.id} />}
      actions={
        <Button onClick={openCreate} disabled={!editable}>
          <Plus className="h-4 w-4" strokeWidth={3} />
          Add round
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rail bg-rail">
          <div className="bg-deck px-4 py-4">
            <Numeral value={questions.length} label="Rounds" size="md" tone="volt" />
          </div>
          <div className="bg-deck px-4 py-4">
            <Numeral value={totalPoints} label="Points on offer" size="md" />
          </div>
          <div className="bg-deck px-4 py-4">
            <Numeral
              value={`${Math.round(totalSeconds / 60)}m`}
              label="Play time"
              size="md"
              sub={`${totalSeconds}s of clock`}
            />
          </div>
        </div>

        {!editable ? (
          <p className="rounded-md border border-flag/40 bg-flag/5 px-4 py-3 text-[13px] text-flag">
            Rounds are locked while the tournament is running.
          </p>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : questions.length ? (
          <div className="overflow-hidden rounded-md border border-rail">
            {questions.map((question, index) => {
              const correct = question.options.find((option) => option.isCorrect);
              return (
                <div
                  key={question.id}
                  className={cn(
                    'flex gap-3 border-b border-rail bg-deck p-4 last:border-0',
                    question.status === 'ACTIVE' && 'bg-loss/5',
                    question.status === 'CLOSED' && 'opacity-60',
                  )}
                >
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <span className="numeral text-[1.5rem] text-volt">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {editable ? (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0 || reordering}
                          aria-label="Move up"
                          className="grid h-7 w-7 place-items-center rounded-xs text-ghost transition-colors hover:bg-ridge hover:text-chalk disabled:opacity-25"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === questions.length - 1 || reordering}
                          aria-label="Move down"
                          className="grid h-7 w-7 place-items-center rounded-xs text-ghost transition-colors hover:bg-ridge hover:text-chalk disabled:opacity-25"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Tag tone="neutral">{QUESTION_TYPE_LABELS[question.type]}</Tag>
                      {question.status !== 'UPCOMING' ? (
                        <Tag tone={question.status === 'ACTIVE' ? 'loss' : 'neutral'}>
                          {question.status === 'ACTIVE' ? 'Live' : 'Played'}
                        </Tag>
                      ) : null}
                      {question.requiresManualGrading ? <Tag tone="flag">You score it</Tag> : null}
                    </div>

                    <p className="mt-2 text-[15px] font-medium leading-snug text-chalk">
                      {question.prompt}
                    </p>

                    {correct ? (
                      <p className="mt-1 text-[13px] text-win">✓ {correct.text}</p>
                    ) : null}

                    <p className="mt-2 font-data text-[11px] uppercase tracking-[0.1em] text-ghost tnum">
                      {question.timeLimitSeconds}s · {question.basePoints} pts
                      {question.speedBonusPoints > 0 ? ` · +${question.speedBonusPoints} speed` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(question)}
                      disabled={!editable || question.status !== 'UPCOMING'}
                      aria-label="Edit round"
                      className="grid h-10 w-10 place-items-center rounded-sm text-ghost transition-colors hover:bg-ridge hover:text-chalk disabled:opacity-25"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(question)}
                      disabled={!editable || question.status !== 'UPCOMING'}
                      aria-label="Delete round"
                      className="grid h-10 w-10 place-items-center rounded-sm text-ghost transition-colors hover:bg-ridge hover:text-loss disabled:opacity-25"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No rounds yet"
            description="Build your first round. Multiple choice, true/false, short answer, numeric, or a photo of written work."
            action={
              <Button size="lg" onClick={openCreate}>
                <Plus className="h-4 w-4" strokeWidth={3} />
                Build round 01
              </Button>
            }
          />
        )}

        {questions.length ? (
          <Kicker className="text-center">
            Players answer these in order. Drag order with the arrows.
          </Kicker>
        ) : null}
      </div>

      <QuestionBuilder
        open={open}
        onClose={() => setOpen(false)}
        draft={draft}
        onChange={setDraft}
        onSave={save}
        saving={saving}
        errors={errors}
        editing={Boolean(editingId)}
        roundIndex={
          editingId
            ? questions.findIndex((question) => question.id === editingId) + 1
            : questions.length + 1
        }
        roundTotal={editingId ? questions.length : questions.length + 1}
      />

      <Sheet
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        kicker="Remove"
        title="Delete this round?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setDeleteTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await api.delete(`/api/questions/${deleteTarget.id}`);
                  await mutate();
                  toast.success('Round deleted');
                } catch (error) {
                  toast.error(error instanceof ApiClientError ? error.message : 'Could not delete.');
                } finally {
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-smoke">{deleteTarget?.prompt}</p>
      </Sheet>
    </AdminShell>
  );
}
