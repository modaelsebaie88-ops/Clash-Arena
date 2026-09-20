'use client';

import * as React from 'react';
import useSWR from 'swr';
import { LogOut, Pencil, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  Avatar,
  Display,
  EmptyState,
  Kicker,
  LoadingState,
  Meter,
  Numeral,
  RuleLabel,
} from '@/components/ui/primitives';
import { PhotoCapture } from '@/components/tournament/photo-capture';
import { ApiClientError, api, fetcher } from '@/lib/client/api';
import { useSession } from '@/lib/client/hooks';
import { cn, formatDateTime, formatMs, formatNumber, formatPercent } from '@/lib/utils';
import type { SessionUserDTO } from '@/types';

interface OverviewResponse {
  user: SessionUserDTO;
  stats: {
    tournamentsPlayed: number;
    tournamentsFinished: number;
    wins: number;
    podiums: number;
    totalPoints: number;
    averageRank: number | null;
    accuracy: number;
    bestStreak: number;
  };
  badges: Array<{
    code: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    awardedAt: string;
  }>;
  recent: Array<{
    participantId: string;
    tournament: { id: string; name: string };
    finalRank: number | null;
    totalPoints: number;
    correctCount: number;
    averageResponseMs: number | null;
  }>;
}

/** Every badge in the catalogue, so the locked ones read as things to chase. */
const BADGE_CATALOGUE = [
  { code: 'FIRST_BLOOD', name: 'First Blood', icon: '🥇', color: '#FFC531' },
  { code: 'SPEED_DEMON', name: 'Speed Demon', icon: '⚡', color: '#38BDF8' },
  { code: 'STREAK_MASTER', name: 'Hot Streak', icon: '🔥', color: '#FF5C1A' },
  { code: 'PERFECT_ROUND', name: 'Perfect', icon: '💯', color: '#2BE07A' },
  { code: 'COMEBACK_KING', name: 'Comeback', icon: '🚀', color: '#CCFF00' },
  { code: 'CHAMPION', name: 'Champion', icon: '🏆', color: '#FFC531' },
  { code: 'PODIUM', name: 'Podium', icon: '🏅', color: '#C6CBD1' },
];

/** Level curve: quick early levels, then a widening gap. Derived, not stored. */
function levelFor(points: number) {
  const level = Math.max(1, Math.floor(Math.sqrt(points / 250)) + 1);
  const floorPoints = (level - 1) ** 2 * 250;
  const nextPoints = level ** 2 * 250;
  const progress = nextPoints === floorPoints ? 0 : ((points - floorPoints) / (nextPoints - floorPoints)) * 100;
  return { level, nextPoints, progress: Math.min(100, Math.max(0, progress)) };
}

export default function PlayerPage() {
  const router = useRouter();
  const { mutate: refreshSession } = useSession();
  const { data, isLoading, mutate } = useSWR<OverviewResponse>('/api/users/me', fetcher);

  const [editing, setEditing] = React.useState(false);
  const [securing, setSecuring] = React.useState(false);

  if (isLoading || !data) {
    return (
      <AppShell>
        <LoadingState message="Loading your record" />
      </AppShell>
    );
  }

  const { user, stats, badges, recent } = data;
  const earned = new Set(badges.map((badge) => badge.code));
  const { level, nextPoints, progress } = levelFor(stats.totalPoints);
  const bestFinish = recent.reduce<number | null>(
    (best, row) => (row.finalRank && (best === null || row.finalRank < best) ? row.finalRank : best),
    null,
  );

  return (
    <AppShell>
      <div className="space-y-section">
        {/* --- identity ------------------------------------------------ */}
        <section className="relative -mx-gutter border-b border-rail bg-pit px-gutter pb-6 pt-6 sm:mx-0 sm:rounded-lg sm:border">
          <div className="pointer-events-none absolute inset-0 grid-field" aria-hidden />

          <div className="relative flex items-start gap-4">
            <Avatar name={user.displayName} src={user.avatarUrl} size={72} ring="volt" />
            <div className="min-w-0 flex-1">
              <Kicker tone="volt">Level {level}</Kicker>
              <Display size="lg" as="h1" className="mt-1 truncate">
                {user.displayName}
              </Display>
              <p className="mt-1 font-data text-[12px] uppercase tracking-[0.1em] text-ghost">
                @{user.username}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit profile"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-rail text-smoke transition-colors hover:border-volt hover:text-volt"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>

          {user.bio ? (
            <p className="relative mt-4 text-[14px] leading-relaxed text-smoke">{user.bio}</p>
          ) : null}

          <div className="relative mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <Kicker>Progress to level {level + 1}</Kicker>
              <span className="font-data text-[11px] font-bold text-smoke tnum">
                {formatNumber(stats.totalPoints)} / {formatNumber(nextPoints)}
              </span>
            </div>
            <Meter value={progress} />
          </div>
        </section>

        {/* --- career numbers ------------------------------------------ */}
        <section>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rail bg-rail sm:grid-cols-3">
            <Cell label="Total points" value={formatNumber(stats.totalPoints)} tone="volt" />
            <Cell label="Battles" value={stats.tournamentsPlayed} />
            <Cell label="Wins" value={stats.wins} tone={stats.wins ? 'win' : 'chalk'} />
            <Cell
              label="Best finish"
              value={bestFinish ? `#${bestFinish}` : '—'}
              tone={bestFinish === 1 ? 'flag' : 'chalk'}
            />
            <Cell label="Accuracy" value={formatPercent(stats.accuracy)} />
            <Cell
              label="Best streak"
              value={stats.bestStreak}
              tone={stats.bestStreak >= 3 ? 'blaze' : 'chalk'}
            />
          </div>
        </section>

        {/* --- achievements -------------------------------------------- */}
        <section>
          <RuleLabel className="mb-5">Achievements</RuleLabel>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {BADGE_CATALOGUE.map((badge) => {
              const owned = earned.has(badge.code);
              const detail = badges.find((row) => row.code === badge.code);
              return (
                <div
                  key={badge.code}
                  title={
                    owned && detail
                      ? `${detail.description} · ${formatDateTime(detail.awardedAt)}`
                      : 'Locked'
                  }
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center transition-colors',
                    owned ? 'border-rail bg-deck' : 'border-dashed border-rail/60 bg-transparent',
                  )}
                  style={owned ? { borderColor: `${badge.color}55`, background: `${badge.color}10` } : undefined}
                >
                  <span className={cn('text-[22px]', !owned && 'opacity-20 grayscale')} aria-hidden>
                    {badge.icon}
                  </span>
                  <span
                    className="font-data text-[9px] font-black uppercase leading-tight tracking-[0.08em]"
                    style={{ color: owned ? badge.color : undefined }}
                  >
                    <span className={cn(!owned && 'text-ghost')}>
                      {owned ? badge.name : 'Locked'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {!badges.length ? (
            <p className="mt-3 text-center text-[13px] text-ghost">
              Win your first round to start unlocking these.
            </p>
          ) : null}
        </section>

        {/* --- recent form ---------------------------------------------- */}
        <section>
          <RuleLabel className="mb-5">Recent form</RuleLabel>

          {recent.length ? (
            <div className="overflow-hidden rounded-md border border-rail">
              {recent.map((row) => (
                <div
                  key={row.participantId}
                  className="flex items-center gap-4 border-b border-rail bg-deck px-4 py-3 last:border-0"
                >
                  <span
                    className={cn(
                      'numeral w-10 shrink-0 text-[1.25rem]',
                      row.finalRank === 1 ? 'text-gold' : 'text-smoke',
                    )}
                  >
                    {row.finalRank ? `#${row.finalRank}` : '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-data text-[13px] font-bold text-chalk">
                      {row.tournament.name}
                    </p>
                    <p className="font-data text-[11px] uppercase tracking-[0.1em] text-ghost tnum">
                      {formatNumber(row.totalPoints)} pts · {row.correctCount} correct ·{' '}
                      {formatMs(row.averageResponseMs)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No form yet"
              description="Your last battles will show up here once you have played one."
            />
          )}
        </section>

        {/* --- account -------------------------------------------------- */}
        <section className="space-y-2 pb-4">
          <RuleLabel className="mb-5">Account</RuleLabel>
          <Button variant="steel" size="lg" block onClick={() => setSecuring(true)}>
            <ShieldCheck className="h-4 w-4" />
            Change password
          </Button>
          <Button
            variant="ghost"
            size="lg"
            block
            onClick={async () => {
              await api.post('/api/auth/logout');
              toast.success('Signed out');
              router.push('/login');
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </section>
      </div>

      <EditProfileSheet
        open={editing}
        onClose={() => setEditing(false)}
        user={user}
        onSaved={async () => {
          await Promise.all([mutate(), refreshSession()]);
          setEditing(false);
        }}
      />

      <PasswordSheet open={securing} onClose={() => setSecuring(false)} />
    </AppShell>
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

function EditProfileSheet({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: SessionUserDTO;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = React.useState({
    displayName: user.displayName,
    username: user.username,
    bio: user.bio ?? '',
    avatarUrl: user.avatarUrl ?? '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm({
        displayName: user.displayName,
        username: user.username,
        bio: user.bio ?? '',
        avatarUrl: user.avatarUrl ?? '',
      });
      setErrors({});
    }
  }, [open, user]);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.put('/api/users/me', {
        displayName: form.displayName,
        username: form.username,
        bio: form.bio || null,
        avatarUrl: form.avatarUrl || null,
      });
      toast.success('Profile updated');
      await onSaved();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fieldErrors ?? { form: error.message });
        toast.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker="Competitor"
      title="Edit profile"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Display name" required error={errors.displayName}>
          <Input
            value={form.displayName}
            onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
          />
        </Field>

        <Field label="Username" required error={errors.username}>
          <Input
            autoCapitalize="none"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
          />
        </Field>

        <Field label="Bio" error={errors.bio}>
          <Textarea
            value={form.bio}
            onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
            placeholder="Tell the arena who you are"
            maxLength={500}
          />
        </Field>

        <Field label="Avatar" hint="A square image reads best on the rankings.">
          <PhotoCapture
            purpose="AVATAR"
            onChange={(file) => setForm((prev) => ({ ...prev, avatarUrl: file?.url ?? '' }))}
          />
        </Field>

        {errors.form ? <p className="text-[13px] text-loss">{errors.form}</p> : null}
      </div>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [values, setValues] = React.useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.put('/api/users/me/password', values);
      setValues({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fieldErrors ?? { form: error.message });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker="Security"
      title="Change password"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>
            Update
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Current password" required error={errors.currentPassword ?? errors.form}>
          <Input
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, currentPassword: event.target.value }))
            }
          />
        </Field>
        <Field
          label="New password"
          required
          error={errors.newPassword}
          hint="At least 8 characters, with a letter and a number."
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={(event) => setValues((prev) => ({ ...prev, newPassword: event.target.value }))}
          />
        </Field>
      </div>
    </Sheet>
  );
}
