'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Kicker, Panel, PanelHead } from '@/components/ui/primitives';
import { formatPercent } from '@/lib/utils';

/**
 * Chart tokens.
 *
 * Single-series charts wear the brand (VOLT deep). Multi-series uses a fixed
 * categorical order, never cycled, validated for colour-vision separation
 * against this surface - a brand hue at full brightness sits outside the dark
 * lightness band, so series colour is a data decision here, not chrome.
 */
const SURFACE = '#16181B';
const GRID = '#2A2E34';
const MUTED = '#9BA1A8';
const SINGLE = '#A8D400';
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

const axis = {
  stroke: GRID,
  tick: { fill: MUTED, fontSize: 10, fontFamily: 'var(--font-data)' },
  tickLine: false,
} as const;

function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string }>;
  label?: string | number;
  format?: (value: number | string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-sm border border-rail bg-pit px-3 py-2 shadow-lift">
      {label !== undefined ? (
        <p className="mb-1 font-data text-[10px] font-bold uppercase tracking-[0.12em] text-chalk">
          {label}
        </p>
      ) : null}
      {payload.map((item, index) => (
        <p key={index} className="flex items-center gap-2 text-[12px] text-smoke">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: item.color ?? SINGLE }}
            aria-hidden
          />
          <span className="truncate">{item.name ?? item.dataKey}</span>
          <span className="ml-auto font-data font-bold tnum text-chalk">
            {format && item.value !== undefined ? format(item.value) : String(item.value ?? '')}
          </span>
        </p>
      ))}
    </div>
  );
}

function NoData({ message = 'Nothing to chart yet.' }: { message?: string }) {
  return (
    <div className="grid h-[200px] place-items-center rounded-sm border border-dashed border-rail">
      <Kicker>{message}</Kicker>
    </div>
  );
}

export function ScoreDistributionChart({ data }: { data: Array<{ bucket: string; count: number }> }) {
  return (
    <Panel>
      <PanelHead kicker="Spread" title="Where scores landed" />
      <div className="p-4">
        {data.length ? (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
              <XAxis dataKey="bucket" {...axis} interval={0} angle={-22} textAnchor="end" height={46} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip
                cursor={{ fill: 'rgba(244,245,243,0.04)' }}
                content={<ChartTip format={(value) => `${value} players`} />}
              />
              <Bar dataKey="count" name="Players" fill={SINGLE} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}
      </div>
    </Panel>
  );
}

export function ResponseTimeChart({ data }: { data: Array<{ bucket: string; count: number }> }) {
  return (
    <Panel>
      <PanelHead kicker="Tempo" title="How fast answers arrived" />
      <div className="p-4">
        {data.length ? (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
              <XAxis dataKey="bucket" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip
                cursor={{ fill: 'rgba(244,245,243,0.04)' }}
                content={<ChartTip format={(value) => `${value} answers`} />}
              />
              <Bar dataKey="count" name="Answers" fill={SINGLE} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}
      </div>
    </Panel>
  );
}

export interface QuestionAnalyticsRow {
  questionId: string;
  index: number;
  prompt: string;
  type: string;
  submitted: number;
  noAnswer: number;
  correct: number;
  incorrect: number;
  correctRate: number;
  averageResponseMs: number | null;
}

export function QuestionDifficultyChart({ questions }: { questions: QuestionAnalyticsRow[] }) {
  const data = questions.map((question) => ({
    label: `R${String(question.index).padStart(2, '0')}`,
    correctRate: Math.round(question.correctRate * 100),
  }));

  return (
    <Panel>
      <PanelHead kicker="Difficulty" title="Which rounds hurt" />
      <div className="space-y-4 p-4">
        {data.length ? (
          <>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis domain={[0, 100]} unit="%" {...axis} />
                <Tooltip
                  cursor={{ fill: 'rgba(244,245,243,0.04)' }}
                  content={<ChartTip format={(value) => `${value}% correct`} />}
                />
                <Bar
                  dataKey="correctRate"
                  name="Correct"
                  fill={SINGLE}
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Table view: the same numbers, readable without colour. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="border-b border-rail text-left font-data text-[10px] uppercase tracking-[0.12em] text-ghost">
                    <th className="py-2 pr-3">Round</th>
                    <th className="py-2 pr-3">Question</th>
                    <th className="py-2 pr-3 text-right">Right</th>
                    <th className="py-2 pr-3 text-right">Wrong</th>
                    <th className="py-2 pr-3 text-right">Skipped</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => (
                    <tr key={question.questionId} className="border-b border-rail/60 last:border-0">
                      <td className="py-2 pr-3 font-data text-ghost tnum">
                        {String(question.index).padStart(2, '0')}
                      </td>
                      <td className="max-w-[300px] truncate py-2 pr-3 text-smoke">
                        {question.prompt}
                      </td>
                      <td className="py-2 pr-3 text-right font-data tnum text-win">
                        {question.correct}
                      </td>
                      <td className="py-2 pr-3 text-right font-data tnum text-loss">
                        {question.incorrect}
                      </td>
                      <td className="py-2 pr-3 text-right font-data tnum text-ghost">
                        {question.noAnswer}
                      </td>
                      <td className="py-2 text-right font-data font-bold tnum text-chalk">
                        {formatPercent(question.correctRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <NoData />
        )}
      </div>
    </Panel>
  );
}

export function RankProgressionChart({
  series,
}: {
  series: Array<{
    userId: string;
    displayName: string;
    points: Array<{ questionOrder: number; rank: number; points: number }>;
  }>;
}) {
  // Five is the cap: past that lines converge and identity stops being readable.
  const tracked = series.filter((entry) => entry.points.length).slice(0, 5);

  const byRound = new Map<number, Record<string, number | string>>();
  for (const entry of tracked) {
    for (const point of entry.points) {
      const row = byRound.get(point.questionOrder) ?? {
        round: `R${String(point.questionOrder).padStart(2, '0')}`,
      };
      row[entry.displayName] = point.rank;
      byRound.set(point.questionOrder, row);
    }
  }

  const data = Array.from(byRound.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);

  const maxRank = tracked.reduce(
    (max, entry) => Math.max(max, ...entry.points.map((point) => point.rank)),
    1,
  );

  return (
    <Panel>
      <PanelHead
        kicker="The climb"
        title={`Rank by round · top ${tracked.length || 0}`}
      />
      <div className="p-4">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
              <XAxis dataKey="round" {...axis} />
              <YAxis reversed allowDecimals={false} domain={[1, Math.max(3, maxRank)]} {...axis} />
              <Tooltip content={<ChartTip format={(value) => `#${value}`} />} />
              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  color: MUTED,
                  paddingTop: 10,
                  fontFamily: 'var(--font-data)',
                }}
                iconType="circle"
                iconSize={8}
              />
              {tracked.map((entry, index) => (
                <Line
                  key={entry.userId}
                  type="monotone"
                  dataKey={entry.displayName}
                  name={entry.displayName}
                  stroke={SERIES[index % SERIES.length]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  // 2px surface ring keeps dots legible where lines cross.
                  dot={{ r: 4, fill: SERIES[index % SERIES.length], stroke: SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 6, stroke: SURFACE, strokeWidth: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <NoData message="Needs at least two completed rounds" />
        )}
      </div>
    </Panel>
  );
}
