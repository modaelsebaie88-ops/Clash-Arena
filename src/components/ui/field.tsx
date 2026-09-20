'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Kicker } from './primitives';

/**
 * Inputs are mechanical: square-ish, hairline-bounded, 52px tall so they clear
 * the touch-target rule, with a VOLT edge on focus.
 */
const control =
  'w-full rounded-md border border-rail bg-deck px-4 text-[16px] text-chalk placeholder:text-ghost ' +
  'transition-colors focus:border-volt focus:outline-none disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    // 16px font size keeps iOS Safari from zooming the viewport on focus.
    <input ref={ref} className={cn(control, 'h-[52px]', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'min-h-[104px] py-3 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(control, 'h-[52px] pr-9', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="font-data text-kicker uppercase text-smoke">
          {label}
          {required ? <span className="ml-1 text-volt">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-loss" role="alert">
          <span aria-hidden>✕</span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-ghost">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex min-h-[56px] w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors',
        checked ? 'border-volt/40 bg-volt/5' : 'border-rail bg-deck hover:border-smoke',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-volt' : 'bg-ridge',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full transition-transform',
            checked ? 'translate-x-5 bg-volt-ink' : 'translate-x-0 bg-smoke',
          )}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-data text-[12px] font-bold uppercase tracking-[0.08em] text-chalk">
          {label}
        </span>
        {description ? (
          <span className="text-[12px] leading-snug text-ghost">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Stepper for numeric settings. Large tap targets beat a tiny number input on a
 * phone, and it removes typing from the admin flow almost entirely.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={cn('flex items-stretch overflow-hidden rounded-md border border-rail', className)}>
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="grid w-10 shrink-0 place-items-center bg-deck font-data text-[18px] font-bold text-smoke transition-colors hover:bg-ridge hover:text-chalk disabled:opacity-30"
      >
        −
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 bg-deck">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(clamp(next));
          }}
          className="w-full min-w-0 bg-transparent text-center font-data text-[16px] font-extrabold tnum text-chalk focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix ? (
          <span className="shrink-0 pr-1.5 font-data text-[10px] uppercase text-ghost">{suffix}</span>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="grid w-10 shrink-0 place-items-center bg-deck font-data text-[18px] font-bold text-smoke transition-colors hover:bg-ridge hover:text-chalk disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
