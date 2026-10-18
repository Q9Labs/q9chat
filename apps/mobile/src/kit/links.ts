import { Linking } from "react-native";

import { isWebUrl } from "./format";

/** Opens an http or https link in the browser; any other text does nothing. */
export function openWebUrl(url: string) {
  if (isWebUrl(url)) void Linking.openURL(url);
}
