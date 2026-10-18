---
name: q9chat
colors:
  surface: "#fafaf9"
  surface-container: "#f1f1ef"
  surface-raised: "#e9e9e6"
  on-surface: "#141414"
  on-surface-variant: "#6b6b68"
  outline: "#e4e4e0"
  primary: "#0b5394"
  on-primary: "#ffffff"
  error: "#b91c1c"
  dark-surface: "#0f0f10"
  dark-surface-container: "#19191b"
  dark-surface-raised: "#232326"
  dark-on-surface: "#ececea"
  dark-on-surface-variant: "#9a9a96"
  dark-outline: "#26262a"
  dark-primary: "#62a8e6"
  dark-on-primary: "#0f0f10"
  dark-error: "#f87171"
---

# Design direction: Q9 Chat

This file owns visual direction, not delivery status. Use `@q9labsai/ui` and
semantic color roles; its token CSS owns precise values. The direction was
approved through an interactive mock on 18 Oct 2026, and its restraint comes
from Chalk's call design and, through it, X Calls.

## Principles

1. The conversation owns the screen. Headers, times and action rows stay quiet
   until they are needed, such as on hover or tap.
2. One quiet kit. Every screen uses the same few shapes, with no glass, glow,
   gradient or colored shadow. Only things that float get a shadow: menus,
   toasts, sheets and the message action bar.
3. Color carries meaning. Ocean blue means unread, mentions and yours; red means
   failed or destructive. Everything else is neutral, apart from avatars.
4. Light and Dark are the only themes, and both are first-class.
5. Less space inside a component, more space between groups of messages.
6. Motion is small and confirms something: hover 150ms, menus 180ms, moves
   220ms on `cubic-bezier(0.16, 1, 0.3, 1)`, transform and opacity only.

## Monochrome base

Light mode is neutral light surfaces with near-black text; dark mode is neutral
dark surfaces with near-white text. Surfaces are not tinted.

## One accent, used sparingly

Ocean blue is the only accent: `#0b5394` in light mode with white text on it,
`#62a8e6` in dark mode with near-black text on it. It appears on the send
button, unread counts, the "new since you last looked" divider, quote bars,
mentions, the wash on your own reaction and the 9 in the logo, and nowhere
else. Every text use meets WCAG AA contrast.

## Logo

The logo is the Q9 Labs mark: a white Q with a superscript 9 on a near-black
tile, where only the 9 turns Ocean blue (`#62a8e6` on the tile in both modes).
The wordmark is the mark followed by "Chat". App icons are full-bleed, so the
tile fills the icon and the platform's corner shape clips it.

## Color from people and meaning

Color comes from avatars and from meaning, not decoration. A person shows their
photo; without one, their initials on one of eight rich colors fixed by their
ID: `#0369a1`, `#be185d`, `#b45309`, `#0f766e`, `#6d28d9`, `#c2410c`,
`#4d7c0f`, `#b91c1c`. Their name in a group uses the same color, lightened in
dark mode until it meets contrast. Red marks a message that failed to send.
There is no online indicator. Generated portrait avatars come after launch.

## Kit

- Type is Figtree: body 14px at 1.4 line height, names and buttons 13px at 600,
  meta 12px, with tabular figures for times and counts.
- Icons come from one rounded outline family at a 1.75px stroke, 20px by
  default and 18px in menus.
- Avatars are round for people and groups alike.
- Radius: 12px menus and inputs, 16px cards and dialogs, 18px message bubbles,
  24px top corners on phone sheets, and fully round buttons and pills.
- Controls: icon buttons 36px (44px on the phone), menu rows 40px (48px on the
  phone), sheet rows 52px, pill buttons 36px. Touch targets are at least 44px.
- Inputs are 44px high and filled, with no focus ring: on focus the border
  turns the text color. The composer is a pill that grows with its text.

## Messages

Every message sits in the same raised neutral bubble with an 18px radius and
8 by 12px padding; your own sit on the right. Messages one person sends close
together form one group with one name, one avatar and one time; other times
show on hover on the web and on tap on the phone. A quote inside a bubble is a
thin accent bar with muted text and no box. Reactions are borderless pills on a
soft fill with a count. The action bar floats beside the bubble and never
covers text. Phone sheets run to the bottom edge with only the top corners
rounded, and every menu stays inside the screen and its safe area.

## Layout and language

Use the shared AppShell and exported primitives. Keep layouts responsive and
use CSS logical properties so a right-to-left language can be added without
rewriting layouts.
Respect reduced motion and preserve visible keyboard focus.
