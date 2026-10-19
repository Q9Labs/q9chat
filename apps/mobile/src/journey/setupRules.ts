/**
 * The setup save, step by step. Each step after the first runs only while the same account is still
 * signed in, so a person who signs out and another who signs in mid-save never get the first one's
 * name or photo. Returns false when the account changed and the save stopped.
 */
export async function saveSetup<Photo extends object>(steps: {
  setUp: () => Promise<unknown>;
  photo: () => Promise<Photo>;
  update: (photo: Photo) => Promise<unknown>;
  stillSignedIn: () => boolean;
}): Promise<boolean> {
  await steps.setUp();
  if (!steps.stillSignedIn()) return false;
  const photo = await steps.photo();
  if (!steps.stillSignedIn()) return false;
  await steps.update(photo);
  return true;
}

/** The account whose setup save is out, under the session it began in. */
export type SetupSaving = { userId: string; epoch: number } | null;

/** Setup stays on screen while its save is out, but only for the same account in the same session: signing out ends it. */
export const savingSetup = (saving: SetupSaving, userId: string, epoch: number) =>
  saving !== null && saving.userId === userId && saving.epoch === epoch;
