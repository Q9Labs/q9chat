import { Directory, File, Paths } from "expo-file-system";

import { createTextStores } from "./textStores";

export const { textStore, clearGroupText, clearAccountText, rememberTextProfile } =
  createTextStores({
    file: (name) => new File(Paths.document, name),
    names: () => new Directory(Paths.document).list().map((entry) => entry.name),
  });
