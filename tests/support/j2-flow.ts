import { api } from "@q9chat/convex";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { expect, type Locator, type Screen } from "e2e";

import { expectButtonHeights } from "./targets.js";
import {
  deletePhoneProfile,
  magicCode,
  removeTestUser,
  signInPhone,
  type PhoneSession,
} from "./workos.js";

// Journey 2 on the phone, shared by the iOS and the Android test: Nadia creates a group with two people, adds
// a third, copies the invite link and signs out; Dana opens the link signed out, signs in through a killed app,
// joins, and starts a pair from Group info. Runs against dev Convex and the web Worker.

const convexUrl = "https://quixotic-crab-23.convex.cloud";

/** What differs between the two platforms. */
export type J2Platform = {
  screen: Screen;
  /** Points on iOS, pixels on Android: the smallest a press target may be. */
  target: number;
  shot: (name: string) => Promise<void> | void;
  /** Types text into a field the way the platform needs it. */
  enter: (field: Locator, text: string) => Promise<void>;
  /** Types a sign-in code. */
  enterCode: (digits: string) => Promise<void>;
  /** Kills the app and opens it again. */
  restart: () => Promise<void>;
  /** Opens a link the way the system would, answering any prompt. */
  openLink: (url: string) => Promise<void>;
  /** The system Back key, where the platform has one. */
  systemBack: (() => Promise<void>) | null;
};

type Person = { email: string; displayName: string; session: PhoneSession };

async function makePerson(
  emails: Set<string>,
  stamp: string,
  handle: string,
  displayName: string,
): Promise<Person> {
  const email = `q9-j2-${handle}-${stamp}@example.net`;
  emails.add(email);
  const session = await signInPhone(email);
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(session.accessToken);
  await client.action(api.profiles.setUp, { displayName });
  return { email, displayName, session };
}

async function signInOnPhone(p: J2Platform, email: string, displayName: string) {
  const { screen } = p;
  await p.enter(screen.getByLabel("Email"), email);
  await screen.getByRole("button", "Email me a code").tap();
  await expect(screen.getByText("Check your email")).toBeVisible();
  await p.enterCode(await magicCode(email));
  await expect(screen.getByText("Set up your profile")).toBeVisible();
  await p.enter(screen.getByRole("textbox", "Your name"), displayName);
  await screen.getByRole("button", "Continue", { exact: true }).tap();
}

/** Types an email into the people field and picks the one person it finds. */
async function pickPerson(p: J2Platform, who: Person) {
  const field = p.screen.getByRole("textbox", "Add people");
  await p.enter(field, who.email);
  const first = who.displayName.split(" ")[0];
  await p.screen.getByRole("button", `${first}, ${who.email}`).tap();
  await expect(p.screen.getByRole("button", `Remove ${first}`)).toBeVisible();
}

/** Everyone the run makes, and every address it must clean up. */
type Cast = {
  stamp: string;
  nadia: string;
  dana: string;
  bilal: Person;
  carla: Person;
  elena: Person;
  allEmails: Set<string>;
  apiUsers: PhoneSession[];
};

async function makeCast(stamp: string): Promise<Cast> {
  const allEmails = new Set<string>();
  const apiUsers: PhoneSession[] = [];
  const person = async (handle: string, displayName: string) => {
    const made = await makePerson(allEmails, stamp, handle, displayName);
    apiUsers.push(made.session);
    return made;
  };
  const nadia = `q9-j2-nadia-${stamp}@example.net`;
  const dana = `q9-j2-dana-${stamp}@example.net`;
  allEmails.add(nadia).add(dana);
  return {
    stamp,
    nadia,
    dana,
    bilal: await person("bilal", "Bilal Beta"),
    carla: await person("carla", "Carla Gamma"),
    elena: await person("elena", "Elena Epsilon"),
    allEmails,
    apiUsers,
  };
}

const NO_LINK = "Add a name or more people to get an invite link.";

/** New group: the people field explains itself, finds people by exact email, and a lone pick is a pair. */
async function createTrio(p: J2Platform, cast: Cast, seen: string[][]) {
  const { screen } = p;
  // The header has the button and the empty state has another.
  await screen.getByRole("button", "New group").first().tap();
  await expect(
    screen.getByText("Anyone with the link can join once the group exists."),
  ).toBeVisible();
  await p.shot("01-new-group");
  const field = screen.getByRole("textbox", "Add people");
  await p.enter(field, cast.nadia);
  await expect(screen.getByText("That's you.")).toBeVisible();
  await p.enter(field, `nobody-${cast.stamp}@example.net`);
  await expect(screen.getByText("doesn't have an account yet", { exact: false })).toBeVisible();
  await p.enter(field, cast.bilal.email);
  await expect(screen.getByRole("button", `Bilal, ${cast.bilal.email}`)).toBeVisible();
  await p.shot("02-picker");
  await screen.getByRole("button", `Bilal, ${cast.bilal.email}`).tap();
  await expect(screen.getByRole("button", "Start", { exact: true })).toBeVisible();
  await expect(screen.getByText(NO_LINK)).toBeVisible();
  // A group of two has no link to share or copy.
  await expect(screen.getByRole("button", "Copy invite link")).toBeHidden();
  await expect(screen.getByText("/join/", { exact: false })).toBeHidden();
  await p.shot("03-new-group-pair");
  await pickPerson(p, cast.carla);
  await expect(screen.getByRole("button", "Create", { exact: true })).toBeVisible();
  await expect(screen.getByText(NO_LINK)).toBeHidden();
  await p.enter(screen.getByRole("textbox", "Group name"), "Trio");
  await p.shot("04-new-group-filled");
  expect(seen.at(-1) ?? []).not.toContain("Trio");
  await screen.getByRole("button", "Create", { exact: true }).tap();
  await expect(screen.getByRole("button", "Group info for Trio")).toBeVisible();
  await expect(screen.getByText("created this group", { exact: false })).toBeVisible();
  await expect(screen.getByText("added", { exact: false })).toBeVisible();
  await p.shot("05-group");
  // Bilal sees the group arrive without asking.
  await expect.poll(() => seen.at(-1) ?? [], { timeout: 30_000 }).toContain("Trio");
}

/** The invite token of Trio, read as Bilal, who is a member. */
async function trioToken(cast: Cast) {
  const bilal = new ConvexHttpClient(convexUrl);
  bilal.setAuth(cast.bilal.session.accessToken);
  const row = (await bilal.query(api.groups.list, {})).find((group) => group.title === "Trio");
  if (!row) throw new Error("Bilal's list must hold the new group");
  const detail = await bilal.query(api.groups.get, { groupId: row.groupId });
  const token = detail?.status === "member" ? detail.inviteToken : null;
  if (!token) throw new Error("A group must have an invite token");
  return token;
}

/** Group info: members without emails, the invite link, and Add people with the same picker. */
async function trioInfo(p: J2Platform, cast: Cast) {
  const { screen } = p;
  await screen.getByRole("button", "Group info for Trio").tap();
  await expect(screen.getByText("Group info")).toBeVisible();
  await expect(screen.getByText("Bilal Beta")).toBeVisible();
  await expect(screen.getByText(cast.bilal.email, { exact: false })).toBeHidden();
  await p.shot("06-group-info");
  await screen.getByRole("button", "Invite link").tap();
  await expect(screen.getByText("Invite link copied")).toBeVisible();
  await screen.getByRole("button", "Add people").first().tap();
  await pickPerson(p, cast.elena);
  await p.shot("07-add-people");
  await screen.getByRole("button", "Add", { exact: true }).tap();
  // The API does not say who was added, so the line names no one.
  await expect(screen.getByText("Group updated")).toBeVisible();
  await expect(screen.getByText("Elena Epsilon")).toBeVisible();
}

async function signOutOnPhone(p: J2Platform) {
  const { screen } = p;
  await screen.getByRole("button", "Back").tap();
  await screen.getByRole("button", "Back to groups").tap();
  await screen.getByRole("button", "Account", { exact: true }).tap();
  await expectButtonHeights(screen, ["Sign out", "Delete account"], p.target);
  await screen.getByRole("button", "Sign out", { exact: true }).tap();
  await expect(screen.getByRole("button", "Email me a code")).toBeVisible();
}

/** Dana opens the link signed out, the app is killed while she reads her mail, and she still lands on the invite. */
async function danaJoins(p: J2Platform, cast: Cast, token: string) {
  const { screen } = p;
  await p.openLink(`q9chat://join/${token}`);
  // The link opened over the sign-in screen that was already there, so the screen tree holds two of each.
  await expect(screen.getByRole("button", "Email me a code").last()).toBeVisible();
  await p.enter(screen.getByLabel("Email").last(), cast.dana);
  await screen.getByRole("button", "Email me a code").last().tap();
  await expect(screen.getByText("Check your email").last()).toBeVisible();
  await p.restart();
  await expect(screen.getByText(`Enter the 6-digit code we sent to ${cast.dana}.`)).toBeVisible({
    timeout: 120_000,
  });
  await p.enterCode(await magicCode(cast.dana));
  await expect(screen.getByText("Set up your profile")).toBeVisible();
  await p.enter(screen.getByRole("textbox", "Your name"), "Dana Delta");
  await screen.getByRole("button", "Continue", { exact: true }).tap();
  await expect(screen.getByText("Join Trio")).toBeVisible();
  await expect(screen.getByText("4 members", { exact: false })).toBeVisible();
  await expect(
    screen.getByText("Join to read and write in this group.", { exact: false }),
  ).toBeVisible();
  await p.shot("08-join");
  await screen.getByRole("button", "Join group").tap();
  await expect(screen.getByRole("button", "Group info for Trio")).toBeVisible();
  await expect(screen.getByText("joined", { exact: false })).toBeVisible();
}

/** A pair from Group info: Message on a member. Where the platform has a Back key, it closes the sheet first. */
async function pairFromInfo(p: J2Platform, cast: Cast) {
  const { screen } = p;
  await screen.getByRole("button", "Group info for Trio").tap();
  await expect(screen.getByText("5 members", { exact: false }).first()).toBeVisible();
  await screen.getByRole("button", "Options for Bilal Beta").tap();
  await expect(screen.getByRole("button", "Message Bilal")).toBeVisible();
  // The member sheet shows a name, never the address.
  await expect(screen.getByText(cast.bilal.email, { exact: false })).toBeHidden();
  await p.shot("09-member-sheet");
  await p.systemBack?.();
  if (p.systemBack) {
    await expect(screen.getByRole("button", "Message Bilal")).toBeHidden();
    await expect(screen.getByText("Group info")).toBeVisible();
    await screen.getByRole("button", "Options for Bilal Beta").tap();
  }
  await screen.getByRole("button", "Message Bilal").tap();
  await expect(
    screen.getByText("This is the start of your group with Bilal", { exact: false }),
  ).toBeVisible();
  await screen.getByRole("button", /^Group info for Bilal/).tap();
  await expect(screen.getByRole("button", "Invite link")).toBeHidden();
  await p.shot("10-pair-info");
}

/** The used invite does not come back, and a bad link says so. */
async function staleAndBadLinks(p: J2Platform) {
  const { screen } = p;
  await p.restart();
  await expect(screen.getByText("Trio", { exact: false }).first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(screen.getByText("Join Trio")).toBeHidden();
  await p.openLink("q9chat://join/short");
  await expect(screen.getByText("This invite link isn't valid.")).toBeVisible();
  await p.shot("11-join-invalid");
  await screen.getByRole("button", "Back").tap();
  await expect(screen.getByText("Trio", { exact: false }).first()).toBeVisible();
}

/** Dana is removed while she reads Group info: the pane closes, and the removed group leaves Groups once she takes it off her list. */
async function removedFromGroup(p: J2Platform, cast: Cast) {
  const { screen } = p;
  const bilal = new ConvexHttpClient(convexUrl);
  bilal.setAuth(cast.bilal.session.accessToken);
  const row = (await bilal.query(api.groups.list, {})).find((group) => group.title === "Trio");
  if (!row) throw new Error("Bilal's list must hold Trio");
  const detail = await bilal.query(api.groups.get, { groupId: row.groupId });
  const dana =
    detail?.status === "member" ? detail.members.find((m) => m.fullName === "Dana Delta") : null;
  if (!dana) throw new Error("Dana must be a member of Trio");

  await screen.getByText("Trio", { exact: false }).first().tap();
  await screen.getByRole("button", "Group info for Trio").tap();
  await expect(screen.getByText("Group info")).toBeVisible();

  await bilal.mutation(api.groups.removeMember, { groupId: row.groupId, profileId: dana.id });
  await expect(screen.getByText("You were removed from this group")).toBeVisible({
    timeout: 30_000,
  });
  await p.shot("12-removed");
  await screen.getByRole("button", "Remove from my list").tap();
  await expect(screen.getByText("Trio", { exact: false })).toBeHidden({ timeout: 30_000 });
}

export async function runJ2(p: J2Platform) {
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const cast = await makeCast(stamp);
  const live = new ConvexClient(convexUrl);
  const phoneUsers = new Set<string>();
  try {
    // Nadia is the phone's user; the others are made through the API.
    await expect(p.screen.getByRole("button", "Email me a code")).toBeVisible({ timeout: 360_000 });
    phoneUsers.add(cast.nadia);
    await signInOnPhone(p, cast.nadia, "Nadia Alpha");
    await expect(p.screen.getByText("No groups yet")).toBeVisible();

    // Bilal watches his groups the way the app does, over a live subscription.
    live.setAuth(async () => cast.bilal.session.accessToken);
    const seen: string[][] = [];
    live.onUpdate(api.groups.list, {}, (rows) => seen.push(rows.map((row) => row.title)));

    await createTrio(p, cast, seen);
    const token = await trioToken(cast);
    await trioInfo(p, cast);
    await signOutOnPhone(p);
    phoneUsers.add(cast.dana);
    await danaJoins(p, cast, token);
    await pairFromInfo(p, cast);
    await staleAndBadLinks(p);
    await removedFromGroup(p, cast);
  } finally {
    await live.close();
    await Promise.all(cast.apiUsers.map((session) => deletePhoneProfile(session)));
    for (const email of phoneUsers) await deletePhoneProfile(await signInPhone(email));
    await Promise.all([...cast.allEmails].map((email) => removeTestUser(email)));
  }
}

/** A HEIC photo in the library must reach the server as a JPEG: HEIC would be stored as a file, not an image. */
export async function runHeicPhoto(p: J2Platform, addHeicToLibrary: () => void) {
  const { screen } = p;
  const email = `q9-j2-heic-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.net`;
  let signedIn = false;
  try {
    await expect(screen.getByRole("button", "Email me a code")).toBeVisible({ timeout: 360_000 });
    await signInOnPhone(p, email, "Heidi Photo");
    signedIn = true;
    await expect(screen.getByText("No groups yet")).toBeVisible();
    addHeicToLibrary();
    await screen.getByRole("button", "Account", { exact: true }).tap();
    await screen.getByRole("button", "Upload photo").tap();
    // The picker lists the library newest first, so the first photo is the HEIC added a moment ago.
    await screen
      .getByRole("image", /^Photo, /)
      .first()
      .tap();
    await expect(screen.getByRole("button", "Remove photo").first()).toBeVisible();
    const session = await signInPhone(email);
    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(session.accessToken);
    const me = await client.query(api.profiles.me, {});
    const photo = me?.status === "ready" ? me.profile.photo : null;
    if (!photo) throw new Error("The profile must hold the photo that was picked");
    const response = await fetch(`https://quixotic-crab-23.convex.site${photo}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    await deletePhoneProfile(session);
  } finally {
    if (signedIn) await deletePhoneProfile(await signInPhone(email));
    await removeTestUser(email);
  }
}
