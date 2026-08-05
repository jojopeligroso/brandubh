# Design — App drawer (lichess-style navigation)

The hamburger's little drop-down popover grew into a full-height slide-out
drawer, lifted from lichess mobile: destinations grouped under section headers,
icon + label rows, and the meta controls pinned at the bottom. `AppDrawer` is
the component; the old `.menu-panel` popover CSS is gone.

## Shape

- **Head** — the wordmark plus one line of live state (mode · strength ·
  variant): lichess's drawer-head idea (username, ping) translated to a game
  with no account. It answers "what am I set up to play?" every time the menu
  opens.
- **Play** — "New game" *reopens the setup overlay* (opponent → side →
  strength) rather than resetting on the spot. The overlay grows a cancel (✕ /
  Escape) only when reopened this way — `onCancel` is null at boot, where there
  is nothing behind it to return to — so a stray tap can never cost a live game.
- **Learn** — the doors of the Learn hub (objectives, rules, set plays, and
  puzzles since 8d) as direct rows, flattening `LearnModal`'s internal menu out
  of the path. Counted as "the three doors" here until the fourth arrived. The
  modal keeps that menu for its other entry (the landing card's "Show me how").
- **Tools** — the game file, moved out of the gear ⚙ modal into its own modal,
  where import/export never quite belonged among appearance settings. The
  `<details>` panel arrives `open` in this placement: here it is the
  destination, not one section among many. The pasted-position refusal is the
  same one the in-page panel makes.
- **Pinned foot** — language segment (still driven by `VISIBLE_LANGS`),
  settings, about. About is new: rules provenance (reconstruction, contested
  readings) and the everything-stays-local promise finally have somewhere to
  live.

## Decisions

- **In-game actions stay in the bottom toolbar's action sheet.** Resign,
  takeback, flips, eval belong to the game; the drawer is the app's navigation.
  Lichess splits the two the same way.
- **No Watch/Community analogues.** The app is deliberately offline
  (`lichess-ui.md` non-goals); copying lichess's section list where it would be
  empty here would be structure without content.
- **The Zen guarantee moved with the game file.** Everything Zen can hide that
  is configuration stays reachable through the header's drawer: Zen, clock and
  custom rules via the settings modal, the game file via its own Tools row.
- **Header shrank to a reporter.** It owns the Zen switch and the hamburger
  button; the drawer state lives in `App` beside the other overlay state.
