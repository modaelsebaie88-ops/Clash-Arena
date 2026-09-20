/**
 * Confetti for the podium. Premium rather than childish: a short burst in the
 * brand palette, never a continuous rain.
 *
 * Silently does nothing under reduced motion, and never breaks the results
 * screen if the library fails to load.
 */
export async function celebrate(intensity: 'win' | 'podium' | 'finish' = 'finish') {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  try {
    const confetti = (await import('canvas-confetti')).default;

    const presets = {
      win: { particleCount: 130, spread: 95, startVelocity: 46, ticks: 220 },
      podium: { particleCount: 90, spread: 78, startVelocity: 38, ticks: 180 },
      finish: { particleCount: 55, spread: 62, startVelocity: 30, ticks: 150 },
    } as const;

    const options = {
      ...presets[intensity],
      colors: ['#CCFF00', '#FF5C1A', '#F4F5F3', '#FFC531'],
      disableForReducedMotion: true,
      scalar: 0.9,
    };

    confetti({ ...options, origin: { y: 0.55 } });
    window.setTimeout(
      () =>
        confetti({
          ...options,
          particleCount: Math.round(options.particleCount * 0.5),
          origin: { x: 0.15, y: 0.5 },
          angle: 60,
        }),
      200,
    );
    window.setTimeout(
      () =>
        confetti({
          ...options,
          particleCount: Math.round(options.particleCount * 0.5),
          origin: { x: 0.85, y: 0.5 },
          angle: 120,
        }),
      340,
    );
  } catch {
    /* decoration only - never let it surface as an error */
  }
}
