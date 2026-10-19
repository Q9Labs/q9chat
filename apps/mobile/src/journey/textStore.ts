import { Directory, File, Paths } from "expo-file-system";

import { privateMedia } from "../kit/privateMedia";
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
  privateMedia.clearGroup(profile, group);
  stores.clearGroupText(profile, group);
  clearAttachments(`${profile}-${group}`);
}

export function retainGroupText(profile: string, groups: readonly string[]) {
  privateMedia.retainGroups(profile, groups);
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
  privateMedia.clearAccount();
  const owner = new File(Paths.document, "q9-text-profile.json");
  const profile = owner.exists ? owner.textSync() : null;
  stores.clearAccountText();
  if (profile) clearAttachments(profile);
}
