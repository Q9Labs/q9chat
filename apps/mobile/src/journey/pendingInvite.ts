import { readPendingInvite, writePendingInvite } from "../session/storage.ts";
import { tokenStore } from "../session/tokenStore";

/** Keeps an invite across sign-in, OAuth and a killed app, for ten minutes. */
export const rememberInvite = (token: string) =>
  writePendingInvite(tokenStore, token, Date.now()).catch(() => {});

export const savedInvite = () => readPendingInvite(tokenStore, Date.now()).catch(() => null);

/** The invite was used or dropped: it must never come back. */
export const forgetInvite = () => tokenStore.delete("pendingInvite").catch(() => {});
