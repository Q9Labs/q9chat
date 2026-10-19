export const MAX_NAME = 60;

/**
 * Saves `name`, then says whether the screen may leave: only when the field still holds what was
 * saved. A change typed while the save was out is not saved, so the screen has to stay.
 */
export async function saveThenCheck(
  name: string,
  save: (name: string) => Promise<unknown>,
  current: () => string,
): Promise<boolean> {
  await save(name);
  return current().trim() === name;
}
