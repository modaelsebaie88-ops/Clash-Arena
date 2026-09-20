'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Display, Kicker } from './primitives';

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 28 };

/**
 * One overlay component for the whole product: a bottom sheet on phones (where
 * the thumb is) and a centred dialog from `sm` up. Escape closes it, the body
 * locks while open, and focus moves into the panel.
 */
export function Sheet({
  open,
  onClose,
  title,
  kicker,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Focus + scroll lock: only on the open/close transition itself. Keying
  // this on `onClose` too would re-run it (and steal focus back to the
  // panel) on every keystroke inside the sheet, since callers pass a fresh
  // inline `onClose` function on every render.
  React.useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/85" onClick={onClose} aria-hidden />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.4 }}
            transition={SPRING}
            className={cn(
              'relative z-10 flex max-h-[92dvh] w-full flex-col border border-rail bg-pit',
              'rounded-t-lg sm:rounded-lg',
              widths[size],
            )}
          >
            {/* Grab handle: signals the sheet is dismissible on touch. */}
            <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-rail" />
            </div>

            <div className="flex items-start justify-between gap-4 border-b border-rail px-5 py-4">
              <div>
                {kicker ? <Kicker>{kicker}</Kicker> : null}
                <Display size="md" className="mt-1">
                  {title}
                </Display>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-smoke transition-colors hover:bg-deck hover:text-chalk"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

            {footer ? (
              <div className="flex gap-3 border-t border-rail px-5 py-4 pb-safe sm:pb-4">{footer}</div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Segmented control styled as broadcast chrome: square, hairline-bounded, with
 * the active cell filled VOLT.
 */
export function Segmented({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; badge?: React.ReactNode }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'no-scrollbar flex gap-0 overflow-x-auto rounded-md border border-rail bg-pit p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'flex min-h-[40px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-sm px-4',
              'font-data text-[11px] font-bold uppercase tracking-[0.12em] transition-colors',
              active ? 'bg-volt text-volt-ink' : 'text-smoke hover:bg-deck hover:text-chalk',
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
