'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Actions in the arena have consequence. Labels are uppercase Archivo, the
 * primary is VOLT with black text, and every button presses physically.
 * Primary actions are 56px tall so they clear the touch-target rule with room.
 */
const button = cva(
  [
    'relative inline-flex items-center justify-center gap-2 font-data uppercase',
    'tracking-[0.1em] font-extrabold transition-[transform,background-color,border-color,opacity]',
    'duration-100 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
    'select-none whitespace-nowrap',
  ],
  {
    variants: {
      variant: {
        volt: 'bg-volt text-volt-ink hover:bg-volt-deep',
        steel: 'border border-rail bg-deck text-chalk hover:border-smoke hover:bg-ridge',
        danger: 'bg-loss text-chalk hover:brightness-110',
        win: 'bg-win text-volt-ink hover:brightness-110',
        blaze: 'bg-blaze text-volt-ink hover:brightness-110',
        ghost: 'text-smoke hover:bg-deck hover:text-chalk',
        outline: 'border border-rail bg-transparent text-chalk hover:border-volt hover:text-volt',
      },
      size: {
        sm: 'h-9 rounded-sm px-3 text-[11px] tracking-[0.12em]',
        md: 'h-12 rounded-md px-5 text-[13px]',
        lg: 'h-14 rounded-md px-6 text-[15px]',
        xl: 'h-16 rounded-md px-8 text-[17px]',
        icon: 'h-11 w-11 rounded-md',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'volt', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
  /** Text shown while `loading` is true, so the action explains itself. */
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, loading, loadingLabel, disabled, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Dots />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  ),
);
Button.displayName = 'Button';

/** Three-dot working indicator. Lighter than a spinner, reads as "thinking". */
function Dots() {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 rounded-full bg-current opacity-70"
          style={{
            animation: 'live-blink 1s ease-in-out infinite',
            animationDelay: `${index * 140}ms`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * The single most important control in the product. Full width, 64px tall,
 * with a VOLT ring so it reads as the one thing to press.
 */
export const LockInButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { locked?: boolean }
>(({ locked, className, children, ...props }, ref) => (
  <Button
    ref={ref}
    variant={locked ? 'win' : 'volt'}
    size="xl"
    block
    className={cn(
      'h-16 shadow-volt',
      locked && 'shadow-none',
      className,
    )}
    {...props}
  >
    {children}
  </Button>
));
LockInButton.displayName = 'LockInButton';

export { button as buttonVariants };
