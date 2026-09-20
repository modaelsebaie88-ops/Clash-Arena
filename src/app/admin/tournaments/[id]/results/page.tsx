'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Check, Download, Minus, X } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell, TournamentTabs } from '@/components/admin/admin-shell';
import {
  QuestionDifficultyChart,
  RankProgressionChart,
  ResponseTimeChart,
  ScoreDistributionChart,
  type QuestionAnalyticsRow,
} from '@/components/admin/analytics-charts';
import { Button } from '@/components/ui/button';
import { Field, Stepper, Textarea } from '@/components/ui/field';
import { Segmented } from '@/components/ui/sheet';
import {
  Avatar,
  EmptyState,
  Kicker,
  LoadingState,
  Numeral,
  Panel,
  PanelHead,
  Tag,
} from '@/components/ui/primitives';
import { Podium, Rankings } from '@/components/tournament/rankings';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { formatMs, formatNumber, formatPercent } from '@/lib/utils';
import type { LeaderboardEntryDTO } from '@/types';

interface ResultsResponse {
  tournament: { id: string; name: string; code: string; status: string; totalQuestions: number };
  podium: LeaderboardEntryDTO[];
  standings: LeaderboardEntryDTO[];
  stats: {
    participants: number;
    averageScore: number;
    averageResponseMs: number | null;
    correctRate: number;
    fastestAnswer: { displayName: string; responseTimeMs: number } | null;
  };
}

interface AnalyticsResponse {
  summary: {
    participants: number;
    averageScore: number;
    medianScore: number;
    topScore: number;
    averageResponseMs: number | null;
    correctRate: number;
    participationRate: number;
    answeredSubmissions: number;
  };
  questions: QuestionAnalyticsRow[];
  scoreDistribution: Array<{ bucket: string; count: number }>;
  responseTimeDistribution: Array<{ bucket: string; count: number }>;
  rankProgression: Array<{
    userId: string;
    displayName: string;
    points: Array<{ questionOrder: number; rank: number; points: number }>;
  }>;
  highlights: {
    hardestQuestion: { index: number; prompt: string; correctRate: number } | null;
    easiestQuestion: { index: number; prompt: string; correctRate: number } | null;
    fastestAnswer: { displayName: string; responseTimeMs: number; questionIndex: number } | null;
    biggestComeback: { displayName: string; from: number; to: number } | null;
  };
}

interface PendingSubmission {
  id: string;
  user: { id: string; displayName: string; username: string; avatarUrl: string | null };
  question: { id: string; order: number; prompt: string; basePoints: number };
  uploadedImageUrl: string | null;
  submittedAt: string;
  responseTimeMs: number;
}

export default function AdminResultsPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = React.useState('board');

  const { data: results, isLoading } = useSWR<ResultsResponse>(
    `/api/tournaments/${params.id}/results`,
    fetcher,
  );
  const { data: analytics } = useSWR<AnalyticsResponse>(
    `/api/tournaments/${params.id}/analytics`,
    fetcher,
  );
  const { data: pending, mutate: refreshPending } = useSWR<{ submissions: PendingSubmission[] }>(
    `/api/tournaments/${params.id}/submissions/pending`,
    fetcher,
    { refreshInterval: 10_000 },
  );

  const pendingCount = pending?.submissions.length ?? 0;

  return (
    <AdminShell
      kicker={results?.tournament.name}
      title="Results"
      tabs={<TournamentTabs tournamentId={params.id} />}
      actions={
        <a href={`/api/tournaments/${params.id}/export`} download>
          <Button variant="steel">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </a>
      }
    >
      <div className="space-y-6">
        <Segmented
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'board', label: 'Final board' },
            {
              value: 'grading',
              label: 'To score',
              badge: pendingCount ? <Tag tone="flag">{pendingCount}</Tag> : undefined,
            },
            { value: 'analytics', label: 'Analytics' },
          ]}
        />

        {isLoading ? (
          <LoadingState message="Reading the results" />
        ) : tab === 'board' ? (
          <div className="space-y-6">
            {results?.podium.length ? (
              <Panel className="p-6">
                <Podium entries={results.podium} />
              </Panel>
            ) : null}

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail lg:grid-cols-4">
              <Cell label="Players" value={results?.stats.participants ?? 0} tone="volt" />
              <Cell label="Avg score" value={formatNumber(results?.stats.averageScore ?? 0)} />
              <Cell
                label="Avg response"
                value={formatMs(results?.stats.averageResponseMs ?? null)}
                tone="blaze"
              />
              <Cell
                label="Correct rate"
                value={formatPercent(results?.stats.correctRate ?? 0)}
                tone="win"
              />
            </div>

            <Rankings entries={results?.standings ?? []} showMovement={false} />
          </div>
        ) : tab === 'grading' ? (
          <GradingQueue
            submissions={pending?.submissions ?? []}
            onGraded={() => void refreshPending()}
          />
        ) : (
          <AnalyticsPanels analytics={analytics} />
        )}
      </div>
    </AdminShell>
  );
}

function AnalyticsPanels({ analytics }: { analytics?: AnalyticsResponse }) {
  if (!analytics) return <LoadingState message="Crunching the numbers" />;
  const { summary, highlights } = analytics;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail lg:grid-cols-4">
        <Cell label="Participants" value={summary.participants} tone="volt" />
        <Cell
          label="Avg score"
          value={formatNumber(summary.averageScore)}
          hint={`median ${formatNumber(summary.medianScore)}`}
        />
        <Cell label="Correct rate" value={formatPercent(summary.correctRate)} tone="win" />
        <Cell
          label="Participation"
          value={formatPercent(summary.participationRate)}
          tone="blaze"
          hint="answers vs possible"
        />
      </div>

      <Panel>
        <PanelHead kicker="Story of the match" title="Highlights" />
        <div className="grid gap-px bg-rail sm:grid-cols-2">
          {highlights.hardestQuestion ? (
            <Highlight
              label="Hardest round"
              value={`R${String(highlights.hardestQuestion.index).padStart(2, '0')}`}
              detail={`${formatPercent(highlights.hardestQuestion.correctRate)} got it · ${highlights.hardestQuestion.prompt}`}
            />
          ) : null}
          {highlights.easiestQuestion ? (
            <Highlight
              label="Easiest round"
              value={`R${String(highlights.easiestQuestion.index).padStart(2, '0')}`}
              detail={`${formatPercent(highlights.easiestQuestion.correctRate)} got it · ${highlights.easiestQuestion.prompt}`}
            />
          ) : null}
          {highlights.fastestAnswer ? (
            <Highlight
              label="Fastest answer"
              value={formatMs(highlights.fastestAnswer.responseTimeMs)}
              detail={`${highlights.fastestAnswer.displayName} on round ${highlights.fastestAnswer.questionIndex}`}
            />
          ) : null}
          {highlights.biggestComeback ? (
            <Highlight
              label="Biggest climb"
              value={`#${highlights.biggestComeback.from} → #${highlights.biggestComeback.to}`}
              detail={highlights.biggestComeback.displayName}
            />
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreDistributionChart data={analytics.scoreDistribution} />
        <ResponseTimeChart data={analytics.responseTimeDistribution} />
      </div>

      <QuestionDifficultyChart questions={analytics.questions} />
      <RankProgressionChart series={analytics.rankProgression} />
    </div>
  );
}

function GradingQueue({
  submissions,
  onGraded,
}: {
  submissions: PendingSubmission[];
  onGraded: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [points, setPoints] = React.useState<Record<string, number>>({});
  const [feedback, setFeedback] = React.useState<Record<string, string>>({});

  const grade = async (
    submission: PendingSubmission,
    outcome: 'CORRECT' | 'PARTIAL' | 'INCORRECT',
  ) => {
    setBusy(submission.id);
    try {
      const explicit = points[submission.id];
      await api.post(`/api/submissions/${submission.id}/grade`, {
        outcome,
        points: explicit === undefined || explicit === 0 ? undefined : explicit,
        feedback: feedback[submission.id] || null,
      });
      toast.success('Scored. The board moved.');
      onGraded();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not score that.');
    } finally {
      setBusy(null);
    }
  };

  if (!submissions.length) {
    return (
      <EmptyState
        title="Nothing to score"
        description="Written solutions land here the moment a player sends one."
      />
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map((submission) => (
        <Panel key={submission.id}>
          <div className="flex items-center justify-between gap-4 border-b border-rail px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar name={submission.user.displayName} src={submission.user.avatarUrl} size={36} />
              <div>
                <p className="font-data text-[14px] font-bold text-chalk">
                  {submission.user.displayName}
                </p>
                <p className="font-data text-[10px] uppercase tracking-[0.1em] text-ghost tnum">
                  Round {String(submission.question.order + 1).padStart(2, '0')} ·{' '}
                  {formatMs(submission.responseTimeMs)}
                </p>
              </div>
            </div>
            <Tag tone="flag">Awaiting</Tag>
          </div>

          <div className="space-y-4 p-4">
            <p className="text-[14px] leading-relaxed text-smoke">{submission.question.prompt}</p>

            {submission.uploadedImageUrl ? (
              <a href={submission.uploadedImageUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={submission.uploadedImageUrl}
                  alt={`Solution from ${submission.user.displayName}`}
                  className="max-h-[440px] w-full rounded-sm border border-rail bg-ink object-contain"
                />
              </a>
            ) : (
              <p className="text-[13px] text-ghost">No image attached.</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Override points"
                hint={`Leave at zero to use the scoring rules (base ${submission.question.basePoints}).`}
              >
                <Stepper
                  value={points[submission.id] ?? 0}
                  onChange={(value) =>
                    setPoints((previous) => ({ ...previous, [submission.id]: value }))
                  }
                  min={0}
                  max={10000}
                  step={10}
                  suffix="pts"
                />
              </Field>
              <Field label="Feedback" hint="Goes to the player with their result.">
                <Textarea
                  className="min-h-[52px]"
                  value={feedback[submission.id] ?? ''}
                  onChange={(event) =>
                    setFeedback((previous) => ({ ...previous, [submission.id]: event.target.value }))
                  }
                  placeholder="Right method, slipped on the arithmetic in step 3."
                />
              </Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant="win"
                size="lg"
                loading={busy === submission.id}
                onClick={() => grade(submission, 'CORRECT')}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
                Correct
              </Button>
              <Button
                variant="steel"
                size="lg"
                loading={busy === submission.id}
                onClick={() => grade(submission, 'PARTIAL')}
              >
                <Minus className="h-4 w-4" />
                Partial
              </Button>
              <Button
                variant="danger"
                size="lg"
                loading={busy === submission.id}
                onClick={() => grade(submission, 'INCORRECT')}
              >
                <X className="h-4 w-4" strokeWidth={3} />
                Wrong
              </Button>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Cell({
  label,
  value,
  tone = 'chalk',
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: React.ComponentProps<typeof Numeral>['tone'];
  hint?: string;
}) {
  return (
    <div className="bg-deck px-4 py-4">
      <Numeral value={value} label={label} size="md" tone={tone} sub={hint} />
    </div>
  );
}

function Highlight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-deck px-4 py-4">
      <Kicker>{label}</Kicker>
      <p className="numeral mt-1 text-[1.5rem] text-volt">{value}</p>
      <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ghost">{detail}</p>
    </div>
  );
}
