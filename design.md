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
semantic color roles; its token CSS owns precise values.

## Monochrome base

Light mode is neutral light surfaces with near-black text; dark mode is neutral
dark surfaces with near-white text. Surfaces are not tinted. A person's own
messages sit on a slightly raised neutral surface, not on the accent.

## One accent, used sparingly

Ocean blue is the only accent: `#0b5394` in light mode with white text on it,
`#62a8e6` in dark mode with near-black text on it. It appears on the send
button, the unread count, the quote bar, mentions and the wordmark dot, and
nowhere else. Every text use meets WCAG AA contrast.

## Color from people and meaning

Color comes from avatars and from meaning, not decoration. A person shows their
photo; without one, their initials on one of eight rich colors fixed by their
ID: `#0369a1`, `#be185d`, `#b45309`, `#0f766e`, `#6d28d9`, `#c2410c`,
`#4d7c0f`, `#b91c1c`. Their name in a group uses the same color, lightened in
dark mode until it meets contrast. Red marks a message that failed to send.
There is no online indicator. Generated portrait avatars come after launch.

## Layout and language

Use the shared AppShell and exported primitives. Keep layouts responsive and
use CSS logical properties so a right-to-left language can be added without
rewriting layouts.
Respect reduced motion and preserve visible keyboard focus.
