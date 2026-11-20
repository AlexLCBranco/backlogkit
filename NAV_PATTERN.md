# Shared layout and menu pattern — all apps

The single source for how every app's layout and menu work. Each app has its own backlog item that points here; this file is never copied into other repos (copies drift). Decided in Claude chat on 2026-11-20.

Applies to: footykit, calendarkit, rotationkit, statmuse-builder, backlogkit, halftime-timer. Not to the gauntlet whiteboard or its widgets (Boardkit, Linkkit), and not to SelfChat.

## The layout: one pinned header, then the page

```
┌─────────────────────────────────────────────────────────────┐
│ ← →   Cups › World Cup › 2002 › Bracket        🔍 Go anywhere │  ← header: pinned, always there
│ [Today] [Clubs] [Leagues] [Cups●] [Tools]                    │
├─────────────────────────────────────────────────────────────┤
│ What:  Champions League  Libertadores  [World Cup]  …        │  ← page rows: scroll away
│        1930 1934 … 1998 [2002] 2006 … 2026                   │
│ How:   ( Groups | [Bracket] | Simulator )                    │
├─────────────────────────────────────────────────────────────┤
│ page content                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 1. Header (pinned, identical on every page)
- Stays at the top while scrolling (`position: sticky`). Same height and same controls on every page of the app; nothing appears or disappears per page.
- Left: back / forward (the app's own page history), then the breadcrumb.
- Breadcrumb: the path to the current page, e.g. `Cups › World Cup › 2002 › Bracket`. Every part is clickable; clicking a part opens a small list of its siblings (other cups, other editions, other views) to jump sideways.
- "Where" tabs: the app's main places, at most 5, always visible, plain words plus an icon. They never change between pages; the current one is highlighted.
- Right: "Go anywhere" search (Ctrl+K, and the button). Type anything ("brazil 2002", "arsenal", "rotations bos") and jump straight there. It searches places, teams, competitions, editions, players — whatever the app has.
- No app switcher (the owner doesn't want one).
- Any small extra tools live in the last "Tools" tab (or the app's equivalent), never as new main tabs.

### 2. Page rows (scroll away with the content)
- **What** — the thing being looked at (competition, team, edition, season, game). Shown as visible chips or a strip, never a dropdown `<select>`: every option is visible and one click away. Long sets (e.g. 23 World Cup editions) are a horizontal strip that scrolls; the chosen one is highlighted and scrolled into view.
- **How** — how it's being looked at (e.g. Groups / Bracket / Simulator, List / Calendar, Table / History). A small segmented switch, 2–5 options.
- On wide screens What and How may share one line to save height; they stack when there isn't room.
- Pages that don't have a What or How skip that row; they don't fill it with something else.

### 3. State and navigation
- Every state lives in the URL (place, what, how, filters, selected date). Reload or a shared link gives the exact same screen. Browser back/forward and the header's back/forward always work.
- The header's height never changes, so nothing below it jumps.

### 4. Narrow screens (phones)
- rotationkit and statmuse-builder are used on the phone, so this must work there; the others are desktop-first but must not break.
- Below ~700 px: the Where tabs become icons with their label under them (still all visible), the breadcrumb shows only its last two parts, and search becomes an icon button. Nothing is moved into a hidden "hamburger" menu.

### 5. Quality bar (every page, every app)
- Fast: any click that changes the page (tab, chip, switch, breadcrumb jump) updates the screen in under 100 ms for data already loaded. No spinners for loaded data.
- Smooth: no layout jumps (cumulative layout shift ≈ 0) on load or after any click; changes animate briefly (≤150 ms) instead of snapping.
- Understandable by a 5-year-old: plain words. No unexplained abbreviations (R16, GD, Pts, 3rd-place table, etc. get a plain label or a hover explanation). Every icon has a visible label or tooltip. Everything that looks clickable is clickable, and nothing clickable looks like plain text.
- Looks: one visual system across all the apps (same header, spacing, type, colours, chip and switch styles), so they look like one site.

### 6. Tests (automated; the owner tests by hand only what can't be)
- e2e: on every main page, the header is present, the same height, and stays visible after scrolling.
- e2e: every Where tab, What chip, How option and breadcrumb part navigates, and the URL round-trips (reload gives the same screen; back/forward work).
- e2e: click-to-update timing under 100 ms on the heaviest page of each app.
- e2e: layout shift ≈ 0 on load and after navigation.
- e2e: no `<select>` elements used for What choices; every icon-only control has an accessible name/tooltip.
- e2e at 390 px width: header fits, nothing hidden in a hamburger, no horizontal page scroll.
- Build report: screenshots of each main page (desktop, and 390 px for rotationkit and statmuse-builder) so the owner can judge the looks in seconds.
