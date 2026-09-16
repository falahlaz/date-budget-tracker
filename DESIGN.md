---
version: alpha
name: Budget Tracker
description: Periwinkle & Butter — a mobile-first personal budget app where the weekend allowance is earned from weekday restraint. Serif money, monospace receipts, one quiet accent and one warm accent.
colors:
  background: "#F5F6FB"
  surface: "#FFFFFF"
  surface-sunken: "#EDEEF7"
  surface-sunken-deep: "#E3E5F2"
  border: "#E1E3F0"
  border-strong: "#CBCEE3"
  on-surface: "#262838"
  on-surface-variant: "#5D6079"
  on-surface-muted: "#8A8DA6"
  primary: "#5C63C4"
  on-primary: "#FFFFFF"
  accent: "{colors.primary}"
  on-accent: "{colors.on-primary}"
  accent-ink: "#4A50B0"
  accent-soft: "#E9EAFA"
  accent-line: "#C9CCEE"
  butter: "#E0B65C"
  butter-ink: "#7E6113"
  butter-soft: "#FBF2DE"
  butter-line: "#EEDCB0"
  positive: "#3E8C74"
  positive-soft: "#E0F0EA"
  negative: "#C2536A"
  negative-ink: "#A63D54"
  negative-soft: "#FBE7EA"
  category-1: "#6B6CD0"
  category-2: "#68A63F"
  category-3: "#8E479D"
  category-4: "#C88B00"
  category-5: "#B14576"
typography:
  money-hero:
    fontFamily: Fraunces
    fontSize: 46px
    fontWeight: "600"
    lineHeight: 1.1
    letterSpacing: -0.02em
    fontFeature: tnum
    fontVariation: "'opsz' 90, 'SOFT' 20, 'WONK' 1"
  money-lg:
    fontFamily: Fraunces
    fontSize: 30px
    fontWeight: "600"
    lineHeight: 1.1
    letterSpacing: -0.02em
    fontFeature: tnum
  money-md:
    fontFamily: Fraunces
    fontSize: 26px
    fontWeight: "600"
    lineHeight: 1.1
    letterSpacing: -0.02em
    fontFeature: tnum
  title-display:
    fontFamily: Fraunces
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 1.15
    letterSpacing: -0.015em
    fontVariation: "'SOFT' 30, 'WONK' 1"
  body-md:
    fontFamily: Public Sans
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 1.5
  body-sm:
    fontFamily: Public Sans
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 1.45
  label-strong:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: "600"
    lineHeight: 1.4
  label-micro:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: "500"
    lineHeight: 1.3
    letterSpacing: 0.12em
  receipt-line:
    fontFamily: IBM Plex Mono
    fontSize: 12.5px
    fontWeight: "400"
    lineHeight: 1.5
    fontFeature: tnum
  amount-mono:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: "500"
    lineHeight: 1.4
    fontFeature: tnum
  tab-label:
    fontFamily: Public Sans
    fontSize: 10.5px
    fontWeight: "500"
    lineHeight: 1.2
rounded:
  xs: 6px
  sm: 10px
  md: 14px
  lg: 20px
  xl: 28px
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  xl: 28px
  gutter: 20px
  section: 28px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  card-butter:
    backgroundColor: "{colors.butter-soft}"
    textColor: "{colors.butter-ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  card-notice:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  card-debt:
    backgroundColor: "{colors.negative-soft}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  receipt-card:
    backgroundColor: "{colors.surface}"
    typography: "{typography.receipt-line}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  receipt-total:
    typography: "{typography.money-md}"
    textColor: "{colors.on-surface}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: 44px
  button-ghost:
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.md}"
  button-deposit:
    backgroundColor: "{colors.positive}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: 44px
    width: 52px
  button-withdraw:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.md}"
    height: 44px
    width: 52px
  button-step:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.sm}"
    height: 44px
    width: 44px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: 48px
  input-amount:
    textColor: "{colors.on-surface}"
    typography: "{typography.money-lg}"
    rounded: "0px"
    padding: "{spacing.sm}"
  chip:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
    height: 40px
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  badge-over:
    backgroundColor: "{colors.negative-soft}"
    textColor: "{colors.negative-ink}"
    typography: "{typography.label-micro}"
    rounded: "{rounded.xs}"
    padding: "{spacing.xs}"
  badge-status:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-micro}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  meter-track:
    backgroundColor: "{colors.surface-sunken}"
    rounded: "{rounded.full}"
    height: 6px
  meter-fill-positive:
    backgroundColor: "{colors.positive}"
    rounded: "{rounded.full}"
  meter-fill-warn:
    backgroundColor: "{colors.butter}"
    rounded: "{rounded.full}"
  meter-fill-over:
    backgroundColor: "{colors.negative}"
    rounded: "{rounded.full}"
  day-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  day-cell-weekend:
    backgroundColor: "{colors.butter-soft}"
    textColor: "{colors.butter-ink}"
  category-dot:
    backgroundColor: "{colors.category-1}"
    rounded: "{rounded.full}"
    size: 8px
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.tab-label}"
    height: 64px
  tab-active:
    textColor: "{colors.accent-ink}"
---

## Overview

A personal budget app for one person, built on a single idea: **the weekend allowance is
whatever is left over from weekday restraint.** Every screen exists to make that trade
visible before it is made, not to report on it afterwards.

The style is **quiet editorial**, not fintech dashboard. Money is set in a serif, the
arithmetic is set like a paper till receipt, and everything else gets out of the way.
There is one accent colour for identity and one warm colour that means exactly one thing.
Surfaces are light and low-contrast; the loudest thing on any screen should be a number.

Mobile only. The layout is a single column locked to a maximum width of 672px and centred,
so a desktop browser shows the same phone-shaped app rather than a stretched one.

The voice is casual Indonesian — second person, contractions, no banking register.
"Lo masih ngutang Rp 600.000 ke tabungan lo sendiri", never "Outstanding liability".

## Colors

The palette is **Periwinkle & Butter**: a blue-violet-biased neutral ground, one
periwinkle accent, and one butter accent reserved for a single meaning.

- **Accent (periwinkle):** the app's identity. Primary buttons, active tabs, selected
  chips, focused fields. Never used to express a value judgement about money.
- **Butter:** means **weekend**, and nothing else. The weekend projection card, weekend
  day cells, the weekend half of a chart. If something is not about a weekend, it is not
  butter.
- **Positive / negative:** readings about money, never identity. Green for money in and
  for being ahead; red for overspend, withdrawals and being behind plan.
- **Negative-soft:** a reminder, not an alarm. Used for the "money you owe yourself" card,
  where nothing has gone wrong — the money was taken deliberately and marked as a debt.
- **Neutrals:** four steps of surface plus three of text. Sunken surfaces are for tracks,
  chips and wells; raised surfaces are pure white cards on a tinted page.

The token values above are the **light theme**. The dark theme is a full re-map of the same
token names, not a filter, and both are first-class:

| Token | Dark |
|---|---|
| `background` | `#24262E` |
| `surface` | `#2C2F39` |
| `surface-sunken` | `#343845` |
| `surface-sunken-deep` | `#3D4250` |
| `border` | `#3A3E4B` |
| `border-strong` | `#4B5060` |
| `on-surface` | `#EDEEF4` |
| `on-surface-variant` | `#B0B4C4` |
| `on-surface-muted` | `#868B9E` |
| `accent` | `#A3A9F0` |
| `on-accent` | `#1B1D2A` |
| `accent-ink` | `#B7BCF7` |
| `accent-soft` | `#343A5A` |
| `accent-line` | `#4A5178` |
| `butter` | `#E7C583` |
| `butter-ink` | `#F1D49B` |
| `butter-soft` | `#3A3428` |
| `butter-line` | `#514835` |
| `positive` | `#7CC0A7` |
| `positive-soft` | `#263831` |
| `negative` | `#EC8FA0` |
| `negative-soft` | `#3E2A34` |
| `category-1` … `category-5` | `#7478D8` `#639F3D` `#A75FB6` `#BD8300` `#C55787` |

**The category colours carry a hard constraint.** They are stored per user as a single hex
that cannot shift between themes, so every one must clear **3:1 contrast against `#FFFFFF`
and `#2C2F39` simultaneously**, which pins them into a narrow luminance band. Within that
band they are spread as far apart as possible — the closest pair sits at ΔE 19.8 in CIE Lab.
Any replacement palette must satisfy both conditions.

Two notes for anyone running a linter over this file:

- **Border and tint tokens read as "orphaned".** `border`, `border-strong`, `accent-line`,
  `butter-line`, `surface-sunken-deep` and `positive-soft` are never referenced from a
  component block because the component schema has no `borderColor` property. They are
  real and in use — applied as 1px borders and as chart and meter fills.
- **`category-2` … `category-5` are equally real.** Only `category-1` appears in
  `category-dot`; the rest are assigned per user at runtime, cycling through the palette.

## Typography

Three families, each with one job:

- **Fraunces (serif)** — every money amount, and page titles. This is the whole point of
  the type system: a serif makes an amount read as something personal rather than a line
  in a corporate report. Always tabular figures. Optical sizing and the SOFT/WONK axes are
  set explicitly so large amounts stay warm rather than sharp.
- **Public Sans** — all interface text: labels, body copy, buttons, list rows.
- **IBM Plex Mono** — receipt lines, eyebrow labels, and small amounts inside lists. Mono
  on a receipt is not decoration: the card *is* a running total where each line feeds the
  next, and a receipt is the form that already explains that arithmetic without a legend.

`label-micro` is always rendered **uppercase** with its wide tracking. It carries the date
or the period so the title beside it can stay a name instead of growing into a sentence.

Money amounts never change family with context. A figure in a hero, in a receipt total and
in a list row is the same serif at three sizes — only mono list amounts differ, and those
are secondary figures inside a scanning context.

## Layout

Mobile-first and thumb-first. The content column is a single stack with a **20px side
gutter**, capped at 672px and centred.

- **Everything interactive lives at the bottom.** The tab bar and the primary action share
  one fixed bar, because that is the only region a thumb reaches without re-gripping the
  phone. The action button sits *inside* the bar rather than floating above it — a circle
  hovering over a scrolling list covers exactly the thing the list exists to show.
- **Vertical rhythm** is generous: `section` (28px) between sections, `lg` (20px) inside
  cards. Screens are allowed to be long; they are not allowed to be dense.
- **One thing outranks everything.** Each screen has a single hero figure, and it sits
  directly on the page background with no card, no border and no shadow. If every block
  gets a box then nothing outranks anything else.
- **Bottom padding** must clear the fixed bar, and the bar itself respects
  `env(safe-area-inset-bottom)`.
- Tables may scroll horizontally rather than wrapping, but must show a gradient mask at the
  scrolling edge — a scrollbar does not appear on touch until you have already scrolled.
- Minimum tap target is 44px everywhere.

## Elevation & Depth

Depth is carried by **tonal layering first, shadow second**. The page is a tinted neutral,
cards are pure white on top of it, and sunken elements go a step darker than the page.

- **Shadows are very soft and low contrast** — wide blur, low opacity, never a hard drop.
  Three levels only: a hairline `sm` for resting cards, `md` for raised controls, `lg` for
  sheets and overlays.
- **The bottom bar** sits on a translucent surface at 92% opacity with a 16px backdrop
  blur, so content scrolling underneath stays faintly visible rather than vanishing.
- **Sheets** dim and blur the screen behind them rather than replacing it, so the numbers
  the user is acting on remain visible while they act.
- **Action buttons** carry a soft coloured glow derived from their own fill, not a neutral
  shadow.

## Shapes

A soft, consistently rounded language that scales with the size of the surface: the bigger
the container, the rounder it is.

- `xs` 6px — badges and chips nested inside other chips.
- `sm` 10px — small and square buttons, segmented controls.
- `md` 14px — inputs, primary buttons, day cells.
- `lg` 20px — cards.
- `xl` 28px — bottom sheets.
- `full` — meters, status pills, category dots.

The one deliberate exception is the **amount field**, which has no box at all: it is a bare
serif number on a thick accent underline. It should read as a figure being written down,
not as a form control being filled in.

## Components

### The hero figure

Label in `label-micro`, then `money-hero`, then a thin meter, then one line of supporting
numbers. No container. Green when healthy, amber when tight, red plus an `OVER` badge when
negative.

### The receipt card

The signature component. Monospace lines, each a label on the left, a dotted leader, and a
right-aligned signed amount. Operands carry their sign (`−`, `+`); a dashed rule introduces
a subtotal and a double rule introduces the final total, which steps up to `money-md`.
**A line with a zero value is omitted entirely** rather than printed as "Rp 0" — most weeks
have no transfer, and permanent empty rows push the lines that always matter further down.

### Cards

Four tinted variants, each with a fixed meaning: neutral `card` for ordinary content,
`card-butter` for anything about a weekend, `card-notice` (accent tint) for a setup prompt,
`card-debt` (negative tint) for money owed back to oneself.

### The bottom bar

Two configurations, decided by which wallet is active: **4 tabs + 1 accent action button**
for the day-to-day wallet, **3 tabs + 2 action buttons** (a filled green deposit and an
outlined withdraw) for the savings wallet. They are not two views of one thing, so the bar
changes wholesale.

### Chips

Used for categories, payment methods, date shortcuts and filters. Category chips always
carry a coloured dot. Rows of chips scroll horizontally and must keep the selected chip
scrolled into view.

### Sheets

Bottom sheets with a grab handle, a serif title, an X on the right, and a full-width
primary button at the bottom. Field order inside a sheet is a product decision, not a
layout convenience — see Do's and Don'ts.

## Do's and Don'ts

**Do**

- Pair every colour signal with a text signal. A negative amount always carries the literal
  word `OVER`; every donut slice is named in the legend with its amount and share.
- Let numbers go negative. The app never refuses a spend for exceeding a budget; deficits
  roll forward exactly like surpluses and are shown plainly.
- Keep the hero figure on the bare background, with no card around it.
- Reserve butter for weekends, full stop.
- Put the *reason* first in the withdrawal sheet — autofocused, before the amount. Asked
  afterwards it becomes a formality typed once the decision is already made.
- Show the cost of a withdrawal in **time** ("your target slips about a month") before
  confirming it.
- Phrase the weekend projection as a consequence, not a statistic: "spend nothing more
  today and the weekend gets Rp X".
- Keep the wallet switcher in the header of every screen, since which wallet is active
  changes what every number on screen means.

**Don't**

- Don't use colour as the only carrier of meaning, anywhere.
- Don't turn the friction dialog into a block. Cancel sits on the left and is not
  emphasised, but the confirm button is always one tap away and never disabled — a
  withdrawal the app refuses is a withdrawal that happens outside the app and is never
  recorded at all.
- Don't put the primary action in a floating button over the content.
- Don't give every block a card; hierarchy comes from restraint.
- Don't use the accent colour to say something is good or bad. That is what positive and
  negative are for.
- Don't collapse the receipt into a grid of statistics. The chain of arithmetic *is* the
  feature.
- Don't render a savings withdrawal as a category first. The reason sentence is the
  headline; the category is metadata.
- Don't subtract money-owed-to-yourself from the displayed balance. It already left the
  account, and netting it off would take the same money away twice.

### Known contrast debt

`button-deposit` puts a white glyph on `positive` at **4.03:1**. That clears the 3:1
threshold for non-text content, which is the rule that applies to an icon-only control, but
it would fail if a text label were ever put inside it. If the revamp adds a label to that
button, darken the green rather than keeping the pairing.

Everything else in this file meets WCAG AA for its size class. Two values were corrected on
the way into this document rather than copied from the current build: the `OVER` badge now
uses `negative-ink` instead of `negative` (3.74:1 → 5.19:1 at 11px), and inactive tab labels
now use `on-surface-variant` instead of `on-surface-muted` (3.26:1 → 6.0:1 at 10.5px). Both
are improvements the revamp should carry, not descriptions of what ships today.
