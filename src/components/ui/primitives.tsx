'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { avatarColor, cn, initials } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * Type lockups
 * ------------------------------------------------------------------ */

/** Small tracked-out label. The system's most recognisable text texture. */
export function Kicker({
  children,
  tone = 'smoke',
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { tone?: 'smoke' | 'volt' | 'blaze' | 'chalk' }) {
  const tones = {
    smoke: 'text-smoke',
    volt: 'text-volt',
    blaze: 'text-blaze',
    chalk: 'text-chalk',
  };
  return (
    <p className={cn('font-data text-kicker uppercase', tones[tone], className)} {...props}>
      {children}
    </p>
  );
}

/** Monumental condensed lockup. One mega per screen, never sentence case. */
export function Display({
  children,
  size = 'lg',
  className,
  as: Tag = 'h2',
}: {
  children: React.ReactNode;
  size?: 'mega' | 'xl' | 'lg' | 'md';
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div';
}) {
  const sizes = {
    mega: 'text-[clamp(3.5rem,16vw,5.5rem)] leading-[0.88]',
    xl: 'text-[clamp(2.5rem,11vw,3.5rem)] leading-[0.9]',
    lg: 'text-[clamp(1.75rem,7vw,2.25rem)] leading-[0.9]',
    md: 'text-[clamp(1.25rem,5vw,1.5rem)] leading-[0.95]',
  };
  return <Tag className={cn('display text-chalk', sizes[size], className)}>{children}</Tag>;
}

/**
 * A number set as an object with its label tucked under it.
 * This is the product's default way of presenting any figure.
 */
export function Numeral({
  value,
  label,
  size = 'lg',
  tone = 'chalk',
  align = 'left',
  sub,
  className,
}: {
  value: React.ReactNode;
  label?: string;
  size?: 'hero' | 'xl' | 'lg' | 'md' | 'sm';
  tone?: 'chalk' | 'volt' | 'blaze' | 'win' | 'loss' | 'smoke' | 'flag';
  align?: 'left' | 'center' | 'right';
  sub?: React.ReactNode;
  className?: string;
}) {
  const sizes = {
    hero: 'text-[clamp(4rem,22vw,6.5rem)]',
    xl: 'text-[clamp(2.75rem,12vw,3.5rem)]',
    lg: 'text-[2rem]',
    md: 'text-[1.375rem]',
    sm: 'text-[1.0625rem]',
  };
  const tones = {
    chalk: 'text-chalk',
    volt: 'text-volt',
    blaze: 'text-blaze',
    win: 'text-win',
    loss: 'text-loss',
    smoke: 'text-smoke',
    flag: 'text-flag',
  };
  const aligns = { left: 'items-start text-left', center: 'items-center text-center', right: 'items-end text-right' };

  return (
    <div className={cn('flex flex-col', aligns[align], className)}>
      <span className={cn('numeral', sizes[size], tones[tone])}>{value}</span>
      {label ? <Kicker className="mt-1.5">{label}</Kicker> : null}
      {sub ? <span className="mt-0.5 text-[12px] text-ghost">{sub}</span> : null}
    </div>
  );
}

/** Editorial section header: index number, title, optional trailing action. */
export function SectionHead({
  index,
  title,
  action,
  className,
}: {
  index?: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4', className)}>
      <div className="flex items-baseline gap-3">
        {index ? <span className="font-data text-kicker text-volt">{index}</span> : null}
        <h2 className="display text-[1.375rem] leading-none text-chalk">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Chips, tags, avatars
 * ------------------------------------------------------------------ */

const tag = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] font-bold uppercase tracking-[0.12em]',
  {
    variants: {
      tone: {
        neutral: 'bg-ridge text-smoke',
        volt: 'bg-volt/15 text-volt',
        blaze: 'bg-blaze/15 text-blaze',
        win: 'bg-win/15 text-win',
        loss: 'bg-loss/15 text-loss',
        flag: 'bg-flag/15 text-flag',
        solid: 'bg-volt text-volt-ink',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tag> {}

export function Tag({ className, tone, ...props }: TagProps) {
  return <span className={cn(tag({ tone }), className)} {...props} />;
}

/** LIVE marker with a blinking dot. Used wherever a tournament is running. */
export function LiveTag({ label = 'Live', className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-loss/15 px-2.5 py-1 font-data text-[10px] font-bold uppercase tracking-[0.12em] text-loss',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 animate-live-blink rounded-full bg-loss" aria-hidden />
      {label}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 40,
  ring,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  ring?: 'volt' | 'gold' | 'silver' | 'bronze' | null;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const rings = {
    volt: 'ring-2 ring-volt',
    gold: 'ring-2 ring-gold',
    silver: 'ring-2 ring-silver',
    bronze: 'ring-2 ring-bronze',
  };
  const ringClass = ring ? rings[ring] : 'ring-1 ring-rail';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-sm object-cover', ringClass, className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-sm font-data font-extrabold text-ink',
        ringClass,
        className,
      )}
      style={{
        width: size,
        height: size,
        background: avatarColor(name),
        fontSize: Math.max(11, size * 0.4),
      }}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Panel({
  className,
  inset = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md border border-rail',
        inset ? 'bg-pit' : 'bg-deck',
        className,
      )}
      {...props}
    />
  );
}

export function PanelHead({
  title,
  kicker,
  action,
  className,
}: {
  title: string;
  kicker?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-rail px-4 py-3',
        className,
      )}
    >
      <div>
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h3 className="display mt-0.5 text-[1.0625rem] leading-none text-chalk">{title}</h3>
      </div>
      {action}
    </div>
  );
}

/** Horizontal rule that carries a label, used to break up long scrolls. */
export function RuleLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-rail" />
      <Kicker>{children}</Kicker>
      <span className="h-px flex-1 bg-rail" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export function Meter({
  value,
  tone = 'volt',
  className,
}: {
  value: number;
  tone?: 'volt' | 'blaze' | 'loss' | 'win';
  className?: string;
}) {
  const tones = { volt: 'bg-volt', blaze: 'bg-blaze', loss: 'bg-loss', win: 'bg-win' };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ridge', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-linear', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/**
 * Round progression as broadcast-style pips rather than a generic bar.
 * Played rounds are filled, the live round is VOLT and enlarged.
 */
export function RoundPips({
  total,
  current,
  className,
}: {
  total: number;
  current: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`Round ${current} of ${total}`}
    >
      {Array.from({ length: total }).map((_, index) => {
        const position = index + 1;
        const played = position < current;
        const live = position === current;
        return (
          <span
            key={position}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              live ? 'bg-volt' : played ? 'bg-smoke' : 'bg-ridge',
              live && 'h-2',
            )}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} />;
}

/** Contextual loading. Never the word "Loading". */
export function LoadingState({
  message = 'Entering the arena',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16', className)}>
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-2 w-2 rounded-full bg-volt"
            style={{
              animation: 'live-blink 1.1s ease-in-out infinite',
              animationDelay: `${index * 160}ms`,
            }}
          />
        ))}
      </div>
      <Kicker tone="smoke" aria-live="polite">
        {message}
      </Kicker>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-rail px-6 py-14 text-center',
        className,
      )}
    >
      <Display size="md" className="text-smoke">
        {title}
      </Display>
      {description ? (
        <p className="max-w-xs text-[14px] leading-relaxed text-ghost">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Human error copy. Never a raw status code or stack. */
export function ErrorState({
  title = "Something went wrong",
  description = 'Your progress is safe. Try again in a moment.',
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-md border border-loss/30 bg-loss/5 px-6 py-10 text-center',
        className,
      )}
      role="alert"
    >
      <span className="grid h-10 w-10 place-items-center rounded-sm bg-loss/15 font-data text-[18px] font-extrabold text-loss">
        !
      </span>
      <Display size="md" className="text-chalk">
        {title}
      </Display>
      <p className="max-w-xs text-[14px] leading-relaxed text-smoke">{description}</p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stat strip - compact figures in a hairline-separated row
 * ------------------------------------------------------------------ */

export function StatStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode; tone?: React.ComponentProps<typeof Numeral>['tone'] }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid divide-x divide-rail overflow-hidden rounded-md border border-rail bg-deck',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div key={item.label} className="px-3 py-3">
          <Numeral value={item.value} label={item.label} size="md" tone={item.tone ?? 'chalk'} />
        </div>
      ))}
    </div>
  );
}
