'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { LockInButton } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Kicker } from '@/components/ui/primitives';
import { PhotoCapture, type CapturedPhoto } from './photo-capture';
import { cn } from '@/lib/utils';
import type { AnswerPayload, ParticipantQuestionDTO } from '@/types';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * The answering surface.
 *
 * Two deliberate steps: select, then LOCK IN. A single tap would be faster but
 * a mis-tap is unrecoverable in a scored round, so the commit gets its own
 * weighted action. Everything is sized for one thumb.
 */
export function AnswerDeck({
  question,
  onSubmit,
  submitted,
  submittedSummary,
  locked = false,
}: {
  question: ParticipantQuestionDTO;
  onSubmit: (answer: AnswerPayload) => Promise<void>;
  submitted: boolean;
  submittedSummary?: string | null;
  /** Clock expired or tournament paused: accept nothing. */
  locked?: boolean;
}) {
  const [selectedOption, setSelectedOption] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const [numeric, setNumeric] = React.useState('');
  const [photo, setPhoto] = React.useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = React.useState(false);

  const disabled = submitted || locked || busy;

  const commit = async (answer: AnswerPayload) => {
    if (disabled) return;
    setBusy(true);
    try {
      await onSubmit(answer);
    } finally {
      setBusy(false);
    }
  };

  if (submitted) return <LockedState summary={submittedSummary} />;

  /* ---- choice questions ------------------------------------------- */
  if (question.type === 'MCQ' || question.type === 'TRUE_FALSE') {
    return (
      <div className="space-y-3">
        <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
          {question.options.map((option, index) => {
            const selected = selectedOption === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => setSelectedOption(option.id)}
                data-selected={selected}
                className="answer-row disabled:opacity-60"
              >
                <span
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-sm font-data text-[16px] font-extrabold transition-colors',
                    selected ? 'bg-volt text-volt-ink' : 'bg-ridge text-smoke',
                  )}
                  aria-hidden
                >
                  {LETTERS[index]}
                </span>

                <span className="flex-1 text-[17px] font-medium leading-snug text-chalk">
                  {option.text}
                </span>

                {selected ? (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    className="shrink-0 font-data text-[9px] font-black uppercase tracking-[0.14em] text-volt"
                  >
                    Selected
                  </motion.span>
                ) : null}
              </button>
            );
          })}
        </div>

        <LockInButton
          disabled={disabled || !selectedOption}
          loading={busy}
          loadingLabel="Locking in"
          onClick={() =>
            selectedOption &&
            commit({ type: question.type as 'MCQ', optionId: selectedOption })
          }
        >
          {selectedOption ? 'Lock in' : 'Pick an answer'}
        </LockInButton>
      </div>
    );
  }

  /* ---- typed answers ----------------------------------------------- */
  if (question.type === 'SHORT_ANSWER') {
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) void commit({ type: 'SHORT_ANSWER', text: text.trim() });
        }}
      >
        <Input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type your answer"
          disabled={disabled}
          maxLength={200}
          aria-label="Your answer"
          className="h-16 text-center font-data text-[20px] font-bold"
        />
        <LockInButton type="submit" disabled={disabled || !text.trim()} loading={busy} loadingLabel="Locking in">
          Lock in
        </LockInButton>
      </form>
    );
  }

  if (question.type === 'NUMERIC') {
    const value = Number(numeric);
    const valid = numeric.trim() !== '' && Number.isFinite(value);
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void commit({ type: 'NUMERIC', value });
        }}
      >
        <Input
          autoFocus
          type="number"
          step="any"
          inputMode="decimal"
          value={numeric}
          onChange={(event) => setNumeric(event.target.value)}
          placeholder="0"
          disabled={disabled}
          aria-label="Your numeric answer"
          className="h-20 text-center font-data text-[32px] font-extrabold tnum"
        />
        <LockInButton type="submit" disabled={disabled || !valid} loading={busy} loadingLabel="Locking in">
          Lock in
        </LockInButton>
      </form>
    );
  }

  /* ---- photo of written work --------------------------------------- */
  return (
    <div className="space-y-3">
      <PhotoCapture
        questionId={question.id}
        disabled={disabled}
        onChange={setPhoto}
      />
      <LockInButton
        disabled={disabled || !photo}
        loading={busy}
        loadingLabel="Sending"
        onClick={() => photo && commit({ type: 'IMAGE_SUBMISSION', fileId: photo.id })}
      >
        {photo ? 'Lock in solution' : 'Add your solution'}
      </LockInButton>
      <p className="text-center text-[12px] leading-relaxed text-ghost">
        The host scores written solutions by hand. Your points land as soon as they review it.
      </p>
    </div>
  );
}

/** Post-commit state. Confirms the lock without revealing anything. */
function LockedState({ summary }: { summary?: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="flex flex-col items-center gap-4 rounded-md border-2 border-volt bg-volt/5 px-6 py-10 text-center"
    >
      <motion.span
        initial={{ scale: 0.4, rotate: -14 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 16 }}
        className="grid h-16 w-16 place-items-center rounded-md bg-volt text-volt-ink"
      >
        <Check className="h-9 w-9" strokeWidth={3.5} />
      </motion.span>

      <div>
        <p className="display text-[2rem] leading-none text-volt">Locked</p>
        {summary ? (
          <p className="mt-2 font-data text-[14px] font-bold text-chalk">{summary}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-smoke"
            style={{ animation: 'live-blink 1.1s ease-in-out infinite', animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
      <Kicker>Waiting for the field</Kicker>
    </motion.div>
  );
}
