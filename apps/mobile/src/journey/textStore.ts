import { Directory, File, Paths } from "expo-file-system";

import { createTextStores } from "./textStores";

const stores = createTextStores({
  file: (name) => new File(Paths.document, name),
  names: () => new Directory(Paths.document).list().map((entry) => entry.name),
});
export const { textStore, rememberTextProfile } = stores;

function clearAttachments(scope: string) {
  const prefix = `q9-attachment-${scope}-`;
  for (const entry of new Directory(Paths.document).list()) {
    if (entry instanceof File && entry.name.startsWith(prefix)) entry.delete();
  }
}

export function clearGroupText(profile: string, group: string) {
  stores.clearGroupText(profile, group);
  clearAttachments(`${profile}-${group}`);
}

export function retainGroupText(profile: string, groups: readonly string[]) {
  stores.retainGroupText(profile, groups);
  const prefix = `q9-attachment-${profile}-`;
  for (const entry of new Directory(Paths.document).list()) {
    if (
      entry instanceof File &&
      entry.name.startsWith(prefix) &&
      !groups.some((group) => entry.name.startsWith(`${prefix}${group}-`))
    )
      entry.delete();
  }
}

export function clearAccountText() {
  const owner = new File(Paths.document, "q9-text-profile.json");
  const profile = owner.exists ? owner.textSync() : null;
  stores.clearAccountText();
  if (profile) clearAttachments(profile);
  for (const entry of new Directory(Paths.cache).list()) {
    if (entry instanceof Directory && entry.name.startsWith("q9-share-")) entry.delete();
  }
}
