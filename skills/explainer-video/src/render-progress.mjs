/**
 * Throttled per-video frame progress & ETA tracker for `render-worker.mjs`.
 */
export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (s < 3600) return `${m}m${String(rem).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h${String(remM).padStart(2, '0')}m`;
}

export function createProgressTracker({
  vid,
  totalFrames,
  stepPct = 5,
  intervalMs = 10000,
  now = () => Date.now(),
  write = (s) => process.stderr.write(s),
}) {
  let done = 0;
  const startMs = now();
  let lastEmitMs = startMs;
  let lastEmitPct = 0;

  return {
    onFrame(count = 1) {
      done = Math.min(totalFrames, done + count);
      if (totalFrames > 0 && done > 0 && done < totalFrames) {
        const pct = Math.floor((done * 100) / totalFrames);
        const t = now();
        const elapsedMs = t - startMs;
        if (pct >= lastEmitPct + stepPct || t - lastEmitMs >= intervalMs) {
          const eta = elapsedMs >= 500
            ? `, ~${formatDuration((elapsedMs / 1000) * ((totalFrames - done) / done))} left`
            : '';
          write(`[render] ${vid}: ${done}/${totalFrames} frames (${pct}%)${eta}\n`);
          lastEmitMs = t;
          lastEmitPct = pct;
        }
      }
    },
    finish() {
      write(`[render] ${vid}: ${totalFrames}/${totalFrames} frames (100%) in ${formatDuration((now() - startMs) / 1000)}\n`);
    },
  };
}
