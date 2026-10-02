# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The maintainer and a handful of colleagues in the same Microsoft Entra tenant. Each person logs their own work hours per week against projects, tasks and hour types, and keeps an eye on their flex balance. They are knowledge workers who already know the official time system and its Excel format; MyTime exists because entering hours there is slower than it should be.

## Product Purpose

A faster, more pleasant front-end for weekly timesheet entry. Hours are entered in MyTime, then exported as `.xlsx` and uploaded into the organization's official time system, which remains the source of truth. Success means a week can be filled in quickly and correctly, the export is accepted unchanged by the official system, and the user always knows their flex status.

## Positioning

A personal-scale companion to the official system, not a replacement for it. Its edge is speed and clarity: keyboard-driven weekly grid with autosave, per-cell comments, "copy from last week", flex calculated per day and in total with Norwegian holidays, and byte-compatible import/export of the official `Timecard` spreadsheet.

## Operating Context

- Used at a work computer on desktop, keyboard-first: arrow keys and Enter move through the grid, Shift+Enter opens a cell comment.
- Weekly rhythm: one week view at a time, addressed by `?uke=` in the URL; a mini calendar navigates weeks.
- Round trip with the official system via `.xlsx`: sheet `Timecard`, columns `Project number, Project name, Task number, Task name, Type, Date, Hours, Comment, Time from, Time to`. Export filenames follow the official pattern (e.g. `week40_02102026130256.xlsx`). Import previews before replacing affected weeks.
- Sign-in with the work Microsoft account (Entra ID, single tenant); self-hosted on the maintainer's Unraid server at `mytime.x99.no`.

## Capabilities and Constraints

- Each user sees only their own hours. There is no shared project catalog: lines are entered freely or come from import.
- Daily norm is 8 h; weekends and Norwegian public holidays have norm 0. Flex shown per day and as a running total balance.
- Autosave; no explicit save step.
- The export format must stay identical to the official system's format; it is a hard compatibility constraint.
- UI language is Norwegian (bokmål).
- Mobile use is not a primary scenario; desktop is.

## Brand Commitments

Name: MyTime. The sign-in uses the standard "Logg inn med Microsoft" button with the Microsoft logo. No other binding brand assets.

## Evidence on Hand

No testimonials, metrics or external proof. The product's truth is its own behavior and the official Excel format (documented in `README.md`).

## Product Principles

1. **Compatibility is non-negotiable.** Anything that risks the export being rejected by the official system is a bug, not a trade-off.
2. **Speed of entry over features.** The core loop is filling a week; every interaction should keep hands on the keyboard.
3. **Always know where you stand.** Flex and week totals are visible without asking for them.
4. **Private by default.** One person, their own hours; no team views or management surfaces.
5. **Forgiving input.** Accept the formats people actually type or paste (comma or dot decimals, several date formats).
