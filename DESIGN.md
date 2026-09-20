---
version: 1
name: Clash-Arena-Broadcast
description: |
  A live-competition broadcast package rendered as a mobile web app. The stage is
  near-black, the type is monumental condensed uppercase, and the numbers are the
  hero objects — scores, ranks and countdowns are set larger than any headline.
  Exactly one acid accent (VOLT) means "live, go, your turn"; exactly one heat
  accent (BLAZE) means "hurry". Everything else is ink, chalk and hairlines.
  Geometry is sharp and mechanical: scoreboard rows, ticket notches, index
  numbers, hazard stripes. No gradients as decoration, no glass, no floating
  card soup. If a screen could belong to a SaaS product, it is wrong.

colors:
  ink: "#08090A"
  pit: "#0E1012"
  deck: "#16181B"
  ridge: "#1E2125"
  rail: "#2A2E34"
  chalk: "#F4F5F3"
  smoke: "#9BA1A8"
  ghost: "#606770"
  volt: "#CCFF00"
  volt-deep: "#A8D400"
  volt-wash: "#CCFF001A"
  blaze: "#FF5C1A"
  blaze-wash: "#FF5C1A1A"
  win: "#2BE07A"
  loss: "#FF2E4C"
  flag: "#FFC531"
  gold: "#FFC531"
  silver: "#C6CBD1"
  bronze: "#D08B45"
  on-volt: "#08090A"
  on-blaze: "#08090A"

typography:
  display-mega:
    fontFamily: Anton
    fontSize: 88px
    fontWeight: 400
    lineHeight: 0.82
    letterSpacing: -0.01em
    textTransform: uppercase
  display-xl:
    fontFamily: Anton
    fontSize: 56px
    fontWeight: 400
    lineHeight: 0.86
    letterSpacing: -0.005em
    textTransform: uppercase
  display-lg:
    fontFamily: Anton
    fontSize: 36px
    fontWeight: 400
    lineHeight: 0.9
    textTransform: uppercase
  display-md:
    fontFamily: Anton
    fontSize: 24px
    fontWeight: 400
    lineHeight: 0.95
    textTransform: uppercase
  numeral-hero:
    fontFamily: Archivo
    fontSize: 104px
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: -0.04em
    fontVariantNumeric: tabular-nums
  numeral-xl:
    fontFamily: Archivo
    fontSize: 56px
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: -0.03em
    fontVariantNumeric: tabular-nums
  numeral-lg:
    fontFamily: Archivo
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.02em
    fontVariantNumeric: tabular-nums
  numeral-md:
    fontFamily: Archivo
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1
    fontVariantNumeric: tabular-nums
  kicker:
    fontFamily: Archivo
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.18em
    textTransform: uppercase
  label:
    fontFamily: Archivo
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.06em
    textTransform: uppercase
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  action:
    fontFamily: Archivo
    fontSize: 16px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0.1em
    textTransform: uppercase

rounded:
  none: 0px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 18px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 40px
  gutter: 20px

components:
  button-primary:
    backgroundColor: "{colors.volt}"
    textColor: "{colors.on-volt}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    height: 56px
    padding: 0 24px
  button-secondary:
    backgroundColor: "{colors.deck}"
    textColor: "{colors.chalk}"
    border: 1px solid "{colors.rail}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    height: 52px
  button-danger:
    backgroundColor: "{colors.loss}"
    textColor: "{colors.chalk}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    height: 52px
  option-row:
    backgroundColor: "{colors.deck}"
    border: 1px solid "{colors.rail}"
    rounded: "{rounded.md}"
    minHeight: 68px
    indexBadge: 40px square, "{colors.ridge}"
  option-row-selected:
    backgroundColor: "{colors.volt-wash}"
    border: 2px solid "{colors.volt}"
    transform: translateX(4px)
  scoreboard-row:
    backgroundColor: "{colors.deck}"
    borderBottom: 1px solid "{colors.rail}"
    rounded: "{rounded.none}"
    height: 64px
  tournament-poster:
    backgroundColor: "{colors.deck}"
    rounded: "{rounded.lg}"
    indexLabel: "{typography.kicker}" top-left
    titleType: "{typography.display-lg}"
  timer-hero:
    typography: "{typography.numeral-hero}"
    calmColor: "{colors.chalk}"
    urgentColor: "{colors.blaze}"
    criticalColor: "{colors.loss}"
  bottom-nav:
    backgroundColor: "{colors.pit}"
    border: 1px solid "{colors.rail}"
    rounded: "{rounded.lg}"
    height: 64px
    activeIndicator: 3px "{colors.volt}" top bar + volt label
---

## Overview

Clash Arena is a live competition that happens to run in a browser. The design
system is borrowed from broadcast sport graphics rather than from software: a
dark stage, a scoreboard, lower-third lockups, and numbers big enough to read
from across a room.

Three devices carry the entire identity:

1. **Monumental condensed type.** Anton, uppercase, tight leading, used for
   tournament names, state announcements and section headers. It never appears
   in sentence case and never carries body copy.
2. **Numbers as objects.** Scores, ranks, countdowns and round counters are set
   in Archivo 700–800 with tabular figures at sizes that dwarf the labels beside
   them. The label is small and quiet; the number is the thing.
3. **One acid accent.** VOLT (`{colors.volt}`) means live, go, active, yours.
   It is never decorative. If VOLT is on screen, something is happening or
   something is expected of you.

The surface language is mechanical, not soft: hairline rules instead of card
borders wherever possible, sharp 12px corners, edge-to-edge rows on mobile, a
fine film grain over everything, and index numbers (`#01`, `04/10`) used as
composition anchors the way a broadcast package numbers its segments.

**Key characteristics:**
- Near-black stage (`{colors.ink}`) with two raised surfaces only (`{colors.pit}`, `{colors.deck}`)
- VOLT is the single brand colour; BLAZE is reserved for time pressure and streaks
- Type contrast is extreme: 11px kickers sit directly under 56–104px numerals
- Mobile is the design target; desktop is the same system given more room
- Motion is spring-based and always communicates state, never decoration

## Colors

### Brand
- **VOLT** (`{colors.volt}` `#CCFF00`) — the only brand colour. Primary buttons,
  active nav, the live dot, rank #1, your own row, the selected answer, progress
  fill. Black text on top (`{colors.on-volt}`), never white.
- **BLAZE** (`{colors.blaze}` `#FF5C1A`) — heat. The countdown under 33%, streak
  indicators, "LIVE" chrome, the pulse on an urgent action. Never a background
  for large areas.

### Stage
- **INK** (`{colors.ink}`) — the page. Everything sits on it.
- **PIT** (`{colors.pit}`) — recessed panels, the bottom nav, sticky bars.
- **DECK** (`{colors.deck}`) — raised rows, posters, option tiles.
- **RIDGE** (`{colors.ridge}`) — the step above deck: index badges, inset chips.
- **RAIL** (`{colors.rail}`) — every hairline, border and divider.

### Ink on stage
- **CHALK** (`{colors.chalk}`) — primary text, slightly warm so it does not
  vibrate against pure black.
- **SMOKE** (`{colors.smoke}`) — labels, metadata, secondary copy.
- **GHOST** (`{colors.ghost}`) — disabled, placeholder, de-emphasised numerals.

### Semantic
- **WIN** (`{colors.win}`) — correct answer, positive rank movement.
- **LOSS** (`{colors.loss}`) — wrong answer, destructive actions, final seconds.
- **FLAG** (`{colors.flag}`) — awaiting review, paused, and podium gold.
- Podium metals: `{colors.gold}`, `{colors.silver}`, `{colors.bronze}`.

Correct and wrong are **never** communicated by colour alone: they always carry a
glyph (✓ / ✕), a word, and a structural difference.

## Typography

Three families, each with one job.

| Family | Role | Never used for |
|---|---|---|
| **Anton** (`display-*`) | Tournament names, state announcements, section headers, the words on primary actions when they are large | Body copy, anything in sentence case |
| **Archivo** (`numeral-*`, `kicker`, `label`, `action`) | Every number, every kicker, every button label, table headers | Long-form paragraphs |
| **Inter** (`body-*`) | Descriptions, rules, form help, error prose | Numbers that need to align |

Rules:
- Every number that matters uses `font-variant-numeric: tabular-nums`. Digits
  must not jitter as a score counts up or a clock ticks down.
- A numeral is always paired with a kicker **below or beside it**, never a
  sentence: `137` over `POINTS`, not "You scored 137 points".
- Anton at `{typography.display-mega}` is reserved for one moment per screen.
  Two mega lockups on one screen cancel each other out.
- Kickers use 0.18em tracking. This is the system's most recognisable text
  texture and should appear on nearly every screen.

## Layout

Mobile first, always. The participant layout is a three-band structure:

```
┌────────────────────────────┐
│ STATUS STRIP   (44px)      │  context: where you are, live state
├────────────────────────────┤
│                            │
│ STAGE                      │  one job per screen
│                            │
├────────────────────────────┤
│ FLOATING NAV   (64px)      │  only outside a live round
└────────────────────────────┘
```

- Page gutter is `{spacing.gutter}` (20px) on mobile, 32px from `md`, and content
  caps at 1200px on desktop (1440px for the admin control room).
- **Scroll rhythm** is deliberate: BIG → small → BIG → medium. A screen must
  never be a uniform stack of equal cards. Alternate a full-bleed statement, a
  hairline-separated list, a compact stat strip, then another statement.
- Rows on mobile go **edge to edge** (negative margin against the gutter) so the
  list reads as a scoreboard rather than a stack of cards.
- During a live round the bottom nav is hidden. Nothing competes with the
  question.

## Elevation & Depth

There is no shadow-based elevation. Depth comes from three things:

1. **Surface steps** — ink → pit → deck → ridge. Never skip two steps adjacent.
2. **Hairlines** — a 1px `{colors.rail}` rule is the default separator. Cards are
   the exception, not the rule.
3. **Grain** — a fixed fractal-noise overlay at ~3.5% opacity across the whole
   viewport, which keeps large black areas from looking flat and dead.

The only glow permitted is a VOLT ring on the primary action and on the active
answer. It is a focus device, not decoration.

## Shapes

- Default radius is `{rounded.md}` (12px). Buttons, option rows, posters.
- Scoreboard rows are square (`{rounded.none}`) and separated by hairlines.
- Pills (`{rounded.full}`) are reserved for tags and status chips only.
- **The notch**: tournament posters carry a ticket-stub notch on the left edge
  and an index label (`#07`) top-left. This is the product's signature object.
- **Hazard stripes**: a 45° repeating-linear-gradient in BLAZE at low opacity
  marks LIVE and PAUSED chrome. Used as a thin band, never a fill.

## Components

- `{component.button-primary}` — VOLT, black label, 56px tall, full width on
  mobile. One per screen. Presses to `scale(0.97)`.
- `{component.option-row}` — the answer tile. A square index badge (A/B/C/D) at
  `{spacing.lg}` from the left, label at `body-lg`, 68px minimum height. Selected
  state shifts 4px right, swaps to a 2px VOLT border and a VOLT wash.
- `{component.scoreboard-row}` — rank numeral, avatar, name, score. 64px tall,
  square, hairline separated. The viewer's own row gets a VOLT left edge and
  sticks to the bottom of the viewport when scrolled out of view.
- `{component.tournament-poster}` — index label, Anton title, meta row, notch.
  Reads as an event ticket, not a content card.
- `{component.timer-hero}` — the countdown numeral. Chalk above 66% of the
  window, BLAZE between 33% and 66%, LOSS below 33% with a 1s pulse.
- `{component.bottom-nav}` — floating, 16px above the safe-area inset, PIT fill,
  rail border. Active item gets a 3px VOLT bar across the top of its cell plus a
  VOLT label.

## Motion

One spring, used everywhere: `stiffness 320, damping 28`.

| Event | Motion |
|---|---|
| Screen enter | y +12 → 0, opacity 0 → 1 |
| Answer select | x 0 → 4, border swap, 120ms |
| Lock in | scale 0.97 press, then a 220ms wipe to the locked state |
| Score reveal | count up over 700ms with cubic ease-out |
| Rank change | old rank slides up and out, new rank slides in from below |
| Leaderboard reorder | FLIP layout animation, 400ms spring |
| Timer critical | 1s scale pulse 1 → 1.04 → 1 |

Everything above collapses to an instant state change under
`prefers-reduced-motion: reduce`. Reduced motion must never remove information —
the count-up becomes the final number, not a blank.

## Microcopy

Uppercase, short, consequential. The voice is a stadium announcer, not an app.

| Instead of | Use |
|---|---|
| Submit answer | LOCK IN |
| Loading | ENTERING THE ARENA |
| Waiting for host | GET READY |
| Leaderboard | THE RANKINGS |
| Score: 450 | `450` over `POINTS` |
| Correct | CORRECT + ✓ + points count-up |
| Incorrect | NOT THIS TIME |
| Question 4 of 10 | ROUND 04 / 10 |
| No tournaments found | NO BATTLES YET |
| Connection lost | CONNECTION INTERRUPTED — reconnecting you to the arena |

Intensity is spent, not sprayed. One dramatic line per screen; everything else is
plain and quiet so the dramatic line lands.

## Do's and Don'ts

### Do
- Put the number first and the label second, always.
- Use hairlines to separate. Reach for a card only when the object is genuinely a
  discrete thing (a poster, an answer tile).
- Keep one VOLT action per viewport.
- Let rows run edge to edge on mobile.
- Give every state a word and a glyph as well as a colour.
- Hide the bottom nav during a live round.
- Respect `env(safe-area-inset-bottom)` on every fixed bottom element.

### Don't
- Don't use purple, and don't use gradients as decoration. The only gradients
  permitted are the hazard stripe and a progress fill.
- Don't use glassmorphism, soft blurred blobs, or drop shadows for elevation.
- Don't stack more than three equally sized cards in a row on mobile.
- Don't put an icon next to every label. Icons earn their place or leave.
- Don't animate anything that is not communicating a state change.
- Don't let a touch target fall below 44px, or a primary action below 56px.
- Don't show the player's rank while a question is open. It is a distraction and
  the product rule forbids it.

## Responsive Behavior

| Name | Width | Key changes |
|---|---|---|
| mobile | 320–479 | Single column, edge-to-edge rows, floating bottom nav, display type at 36–56px |
| mobile-lg | 480–639 | Same structure, gutters 24px, posters gain a second meta row |
| tablet | 640–1023 | Two-up posters, bottom nav becomes a top bar, stat strips go four-up |
| desktop | 1024–1439 | Top navigation, content capped at 1200px, leaderboard and stage sit side by side during play |
| control-room | 1440+ | Admin only: three-column live control with a persistent leaderboard rail |

Touch targets: primary actions 56px, option rows 68px, nav cells 56×56, icon
buttons 44×44 minimum.

## Accessibility

- VOLT on INK measures well above 7:1; CHALK on INK is above 15:1.
- BLAZE and LOSS on INK both clear 4.5:1 for the sizes used. Neither is ever
  used for small body text on a light surface.
- Correct/wrong, live/paused, and rank movement all carry a glyph and a word.
- Every interactive element has a visible focus ring: 2px VOLT, 2px offset.
- The countdown exposes `aria-live="polite"` at 10s and 5s only, so a screen
  reader is warned without being flooded every second.
- All motion respects `prefers-reduced-motion`.
