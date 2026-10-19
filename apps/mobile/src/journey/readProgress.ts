export type ReadProgress = {
  seen: number;
  saved: number;
  connected: boolean;
  saving: boolean;
};

export function observeReadProgress(progress: ReadProgress, sequence: number, eligible: boolean) {
  if (eligible) progress.seen = Math.max(progress.seen, sequence);
}

export function flushReadProgress(
  progress: ReadProgress,
  save: (sequence: number) => Promise<unknown>,
) {
  if (progress.saving || !progress.connected || progress.seen <= progress.saved) return null;
  progress.saving = true;
  return drainReadProgress(progress, save);
}

async function drainReadProgress(
  progress: ReadProgress,
  save: (sequence: number) => Promise<unknown>,
) {
  try {
    while (progress.connected && progress.seen > progress.saved) {
      const sequence = progress.seen;
      await save(sequence);
      progress.saved = Math.max(progress.saved, sequence);
    }
  } finally {
    progress.saving = false;
  }
}
