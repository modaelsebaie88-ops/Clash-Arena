'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Camera, Check, ImageIcon, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Kicker, Meter } from '@/components/ui/primitives';
import { ApiClientError, api } from '@/lib/client/api';
import { cn } from '@/lib/utils';

export interface CapturedPhoto {
  id: string;
  url: string;
  originalName: string;
}

type Status = 'empty' | 'uploading' | 'ready' | 'failed';

/**
 * Capture a photo of handwritten work.
 *
 * Two entry points, because a phone and a laptop want different things: the
 * camera input carries `capture="environment"` so it opens the rear camera
 * directly, while the second input is a plain gallery/file picker that also
 * accepts a desktop drag-and-drop.
 */
export function PhotoCapture({
  onChange,
  questionId,
  tournamentId,
  purpose = 'SUBMISSION',
  disabled,
  className,
}: {
  onChange: (photo: CapturedPhoto | null) => void;
  questionId?: string;
  tournamentId?: string;
  purpose?: 'SUBMISSION' | 'QUESTION' | 'COVER' | 'AVATAR';
  disabled?: boolean;
  className?: string;
}) {
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  const [status, setStatus] = React.useState<Status>('empty');
  const [preview, setPreview] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const lastFile = React.useRef<File | null>(null);

  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const upload = React.useCallback(
    async (file: File) => {
      lastFile.current = file;
      setError(null);
      setStatus('uploading');
      setProgress(12);

      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));

      // The fetch upload gives no byte-level progress, so the bar is a paced
      // approximation that always completes on the real response.
      const pacer = window.setInterval(() => {
        setProgress((value) => (value < 85 ? value + 7 : value));
      }, 160);

      try {
        const form = new FormData();
        form.append('file', file);
        form.append('purpose', purpose);
        if (questionId) form.append('questionId', questionId);
        if (tournamentId) form.append('tournamentId', tournamentId);

        const result = await api.upload<{ file: CapturedPhoto }>('/api/uploads', form);
        setProgress(100);
        setStatus('ready');
        onChange(result.file);
      } catch (err) {
        setStatus('failed');
        setProgress(0);
        onChange(null);
        const message =
          err instanceof ApiClientError ? err.message : 'That upload did not go through.';
        setError(message);
        toast.error(message);
      } finally {
        window.clearInterval(pacer);
      }
    },
    [onChange, preview, purpose, questionId, tournamentId],
  );

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setStatus('empty');
    setProgress(0);
    setError(null);
    onChange(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  };

  const accept = 'image/png,image/jpeg,image/webp,image/heic,image/heif';

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {status === 'empty' ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            'rounded-md border-2 border-dashed p-6 text-center transition-colors',
            dragging ? 'border-volt bg-volt/5' : 'border-rail bg-deck',
          )}
        >
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-ridge">
            <Camera className="h-7 w-7 text-volt" />
          </span>
          <p className="display mt-3 text-[1.25rem] text-chalk">Show your work</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ghost">
            Solve it on paper, then capture your steps.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              size="lg"
              disabled={disabled}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="steel"
              size="lg"
              disabled={disabled}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
              From phone
            </Button>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'overflow-hidden rounded-md border-2',
            status === 'ready' ? 'border-volt' : status === 'failed' ? 'border-loss' : 'border-rail',
          )}
        >
          <div className="flex items-center justify-between border-b border-rail bg-pit px-3 py-2">
            <Kicker tone={status === 'ready' ? 'volt' : status === 'failed' ? 'blaze' : 'smoke'}>
              {status === 'ready' ? 'Photo ready' : status === 'failed' ? 'Upload failed' : 'Uploading'}
            </Kicker>
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              aria-label="Remove photo"
              className="grid h-8 w-8 place-items-center rounded-xs text-smoke transition-colors hover:bg-deck hover:text-chalk"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative bg-ink">
            {preview ? (
              <img
                src={preview}
                alt="Your handwritten solution"
                className="max-h-[46vh] w-full object-contain"
              />
            ) : null}

            {status === 'ready' ? (
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-sm bg-volt text-volt-ink"
                aria-hidden
              >
                <Check className="h-5 w-5" strokeWidth={3} />
              </motion.span>
            ) : null}
          </div>

          {status === 'uploading' ? <Meter value={progress} className="rounded-none" /> : null}

          {status === 'failed' ? (
            <div className="space-y-2 border-t border-rail bg-loss/5 p-3">
              <p className="text-[13px] text-loss">{error}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="steel"
                  onClick={() => lastFile.current && upload(lastFile.current)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={clear}>
                  Choose another
                </Button>
              </div>
            </div>
          ) : null}

          {status === 'ready' ? (
            <div className="flex gap-2 border-t border-rail bg-pit p-3">
              <Button
                type="button"
                size="sm"
                variant="steel"
                disabled={disabled}
                onClick={() => cameraRef.current?.click()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retake
              </Button>
            </div>
          ) : null}
        </motion.div>
      )}
    </div>
  );
}
