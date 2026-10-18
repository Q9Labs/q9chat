// The approved mock's seed (people, groups, messages), copied so every screen shows the same content.
export type SeedKind = "text" | "image" | "file" | "voice" | "system";

export type SeedPerson = { id: string; name: string; initials: string; color: string; colorOnDark: string; email: string };

export const PEOPLE: Record<string, SeedPerson> = {
  hasan: { id: "hasan", name: "Hasan", initials: "HS", color: "#6d28d9", colorOnDark: "#a78bfa", email: "hasan@q9labs.ai" },
  shoaib: { id: "shoaib", name: "Shoaib", initials: "SH", color: "#0f766e", colorOnDark: "#2dd4bf", email: "shoaib@q9labs.ai" },
  bilal: { id: "bilal", name: "Bilal", initials: "BI", color: "#b45309", colorOnDark: "#fbbf24", email: "bilal@q9labs.ai" },
  sara: { id: "sara", name: "Sara", initials: "SA", color: "#be185d", colorOnDark: "#f472b6", email: "sara@q9labs.ai" },
  yahya: { id: "yahya", name: "Yahya", initials: "YA", color: "#0369a1", colorOnDark: "#38bdf8", email: "yahya@q9labs.ai" },
  omar: { id: "omar", name: "Omar", initials: "OM", color: "#c2410c", colorOnDark: "#fb923c", email: "omar@q9labs.ai" },
  rana: { id: "rana", name: "Rana", initials: "RA", color: "#4d7c0f", colorOnDark: "#a3e635", email: "rana@q9labs.ai" },
  nadia: { id: "nadia", name: "Nadia", initials: "NA", color: "#b91c1c", colorOnDark: "#f87171", email: "nadia@q9labs.ai" },
};

export type SeedGroup = {
  id: string;
  name?: string;
  initials?: string;
  /** Set for a group of two: the partner. */
  pair?: string;
  members: string[];
  unread: number;
  mentions?: boolean;
  link?: string;
};

export const GROUPS: SeedGroup[] = [
  { id: "launch", name: "Q9 Chat launch", initials: "QL", members: ["hasan", "shoaib", "bilal", "sara", "omar"], unread: 4, mentions: true, link: "k7Pq2x" },
  { id: "shoaib", pair: "shoaib", members: ["hasan", "shoaib"], unread: 2 },
  { id: "chalk", name: "Chalk", initials: "CH", members: ["hasan", "shoaib", "yahya", "omar", "rana"], unread: 3, link: "c4Lm9t" },
  { id: "core", name: "Q9 Core", initials: "Q9", members: ["hasan", "shoaib", "yahya"], unread: 0, link: "q9Cr3w" },
  { id: "design", name: "Design", initials: "DE", members: ["hasan", "sara", "bilal", "rana"], unread: 5, link: "d3Sg8n" },
  { id: "bilal", pair: "bilal", members: ["hasan", "bilal"], unread: 0 },
  { id: "random", name: "Random", initials: "RA", members: ["hasan", "shoaib", "bilal", "sara", "yahya", "omar", "rana"], unread: 9, link: "r4Nd0m" },
  { id: "sara", pair: "sara", members: ["hasan", "sara"], unread: 0 },
];

export type SeedMessage = {
  id: string;
  by: string;
  day: "Today" | "Yesterday" | "Thu" | "Mon" | "30 Sep";
  time: string;
  text: string;
  kind: SeedKind;
  reactions?: Record<string, string[]>;
  quote?: string;
  edited?: boolean;
  duration?: number;
  size?: string;
  /** Only visible with the "long names" condition. */
  long?: boolean;
};

const m = (id: string, by: string, day: SeedMessage["day"], time: string, text: string, extra: Partial<SeedMessage> = {}): SeedMessage => ({
  id,
  by,
  day,
  time,
  text,
  kind: "text",
  ...extra,
});

export const LONG_GROUP = "Q9 Chat launch, App Store review and the October release for web and phone";
export const LONG_PERSON = "Bilal Ahmed Siddiqui-Rahmatullah";
export const LONG_FILE = "release-checklist-for-app-store-review-final-version-3-october.pdf";
const LONG_TEXT =
  "Before the App Store review on Thursday we still need the privacy labels, screenshots in all three sizes, a demo account with a group that has photos, files and a voice note in it, and review notes that explain how invite links work. Everything is in https://docs.q9labs.ai/launch/app-store-review-checklist-october-2026-final-with-notes-from-bilal-and-sara";

export const MESSAGES: Record<string, SeedMessage[]> = {
  launch: [
    m("l1", "sara", "Yesterday", "16:02", "Avatar colors are in Figma. Eight colors, and each person keeps one everywhere."),
    m("l2", "hasan", "Yesterday", "16:10", "Can we keep muted groups quiet? A grey count, not blue."),
    m("l3", "shoaib", "Yesterday", "16:12", "Yes. Blue only when something needs you.", { reactions: { "👍": ["hasan", "sara"] } }),
    m("l4", "sara", "Yesterday", "17:45", "Initials on all eight colors, light and dark.", { kind: "image" }),
    m("l5", "hasan", "Yesterday", "17:50", "Love these. Ship them.", { reactions: { "❤️": ["sara", "bilal"] } }),
    m("l6", "omar", "Yesterday", "18:20", "I'll use the same colors in Chalk."),
    m("l7", "shoaib", "Today", "09:58", "Morning. Where are we on the first build?"),
    m("l8", "hasan", "Today", "10:01", "Web goes up on chat.q9labs.ai tonight. Phone builds are going through EAS.", { quote: "l7" }),
    m("l9", "bilal", "Today", "10:05", "Apple account is ready under CollabEZ. I'll add everyone to TestFlight once the build lands.", { reactions: { "👍": ["hasan", "shoaib"], "🙏": ["sara"] } }),
    m("l10", "shoaib", "Today", "10:31", "", { kind: "voice", duration: 24 }),
    m("l11", "sara", "Today", "10:36", "Done. Muted groups now show a grey count everywhere.", { quote: "l2", edited: true }),
    m("l12", "bilal", "Today", "10:40", "Build 1 is up on TestFlight. @Hasan can you try sign in with Apple?", { quote: "l8" }),
    m("l13", "bilal", "Today", "10:42", "release-checklist.pdf", { kind: "file", size: "84 KB · PDF" }),
    m("lx", "sara", "Today", "10:43", LONG_TEXT, { long: true }),
  ],
  shoaib: [
    m("s1", "shoaib", "Yesterday", "21:14", "Did you see the Chalk numbers?"),
    m("s2", "hasan", "Yesterday", "21:20", "Yes. Retention is up again. Talk tomorrow."),
    m("s3", "shoaib", "Today", "10:29", "Can you look at the Chalk deck before 3?"),
    m("s4", "shoaib", "Today", "10:31", "Slides 4 to 9 are new."),
  ],
  chalk: [
    m("c1", "omar", "Mon", "14:02", "TestFlight build for Chalk is next week."),
    m("c2", "hasan", "Mon", "14:10", "Good. Send me the link when it's up."),
    m("c3", "rana", "Today", "09:40", "Recording export is fixed on Chrome."),
    m("c4", "yahya", "Today", "10:05", "Safari still drops the last few seconds."),
    m("c5", "shoaib", "Today", "10:12", "Let's look at it after lunch."),
  ],
  core: [
    m("o1", "yahya", "30 Sep", "11:20", "Invoices for September are out. All paid but one."),
    m("o2", "hasan", "30 Sep", "11:31", "Thanks. Which one is still open?"),
    m("o3", "yahya", "30 Sep", "11:40", "The Chalk pilot. They pay on the 5th."),
    m("o4", "yahya", "Today", "09:50", "Payroll for October is done."),
  ],
  design: [
    m("d1", "sara", "Thu", "15:00", "Avatar colors, second pass.", { kind: "image" }),
    m("d2", "rana", "Yesterday", "11:02", "New icons for the composer are up."),
    m("d3", "bilal", "Yesterday", "11:15", "The grey count reads well in dark mode."),
    m("d4", "sara", "Yesterday", "14:30", "Should the send button stay blue when the field is empty?"),
    m("d5", "rana", "Yesterday", "14:41", "Yes. It's the one place the blue lives."),
    m("d6", "sara", "Yesterday", "16:05", "Initials on all eight colors are final."),
  ],
  bilal: [
    m("b1", "hasan", "30 Sep", "18:02", "Can you send me the TestFlight invite when it's ready?"),
    m("b2", "bilal", "Yesterday", "19:10", "Will do. Apple review takes about a day."),
    m("b3", "hasan", "Yesterday", "19:12", "Sounds good, thanks."),
  ],
  random: [
    m("r1", "yahya", "Mon", "11:50", "Who is in the office today?"),
    m("r2", "rana", "Mon", "11:52", "Me, after 2."),
    m("r3", "omar", "Mon", "12:30", "Lunch at 1?"),
    m("r4", "shoaib", "Mon", "12:31", "Biryani again?"),
    m("r5", "sara", "Mon", "12:33", "Yes please."),
    m("r6", "bilal", "Mon", "12:34", "Count me in."),
    m("r7", "yahya", "Mon", "12:36", "Booking for six."),
    m("r8", "rana", "Mon", "12:37", "Make it seven."),
    m("r9", "omar", "Mon", "12:40", "Done. Table at 1."),
  ],
  sara: [
    m("a1", "sara", "Thu", "12:00", "Which avatar style do you like?"),
    m("a2", "hasan", "Thu", "12:30", "The bold initials. They read well at small sizes."),
  ],
};
