# Session 16 — installable, and a third language

**Status: open.** Size **M** — one session, UX and shell only. Two deliverables
that share the app shell: `index.html`, the Vite config, and the header.

---

Session 16 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/16-installable-and-a-third-language`. Start from latest `main`.

Do NOT touch the engine, the rules or the notation.

## READ FIRST

1. `index.html` — the pre-paint theme script, and what is already inlined
2. `vite.config.ts` and `vercel.json` — `base: "./"`, the SPA rewrite, the asset caching
3. `public/` — currently `favicon.svg` and nothing else
4. `src/i18n.ts` — the `Translations` interface, `VISIBLE_LANGS` (`:27`), the three tables
5. `CLAUDE.md` § "Irish (ga) locale is hidden — do not re-expose it"
6. `TASKS.md` § "Half-built" — the compact-header entry, **and the correction Session 11 made to it**

**DEPENDS ON:** nothing hard. Session 11 corrects a false recovery hint in
`TASKS.md` that would otherwise waste your time; if 11 is unmerged, read the
warning below anyway.

## WHAT EXISTS

- **The app is already fully offline at runtime.** Everything — the AI worker,
  the opening book, the puzzle bank, the fonts — is bundled. There are no network
  calls after load. **What is missing is only installability**: `public/` holds a
  favicon and nothing else, there is no `manifest.json`, no service worker, no
  registration anywhere. "Works offline" in the README means *makes no requests*,
  not *installs to a home screen*. That gap is the whole first half of this session.
- **`index.html` applies the saved theme before first paint** and assigns a
  weighted random default (Everforest 66 % / Carved Wood 34 %) to first-time
  visitors. Anything you add to the shell must not cause a flash or disturb that.
- **`VISIBLE_LANGS` lists only `en` and `es`.** The `ga` table is complete —
  strict TypeScript enforces it — but hidden, because the strings are unreviewed
  machine drafts. `src/i18n.test.ts` contains a test asserting `ga` is **not**
  visible, to be deleted in the same change that reveals it. That change is not
  this session.
- **The header does not fit a third button.** `TASKS.md` records that at
  360–390 px a third language button overflows, and at 430–520 px it squeezes the
  subtitle onto three lines.

### ⚠ A correction, so you do not lose an hour

`TASKS.md` says the compact-header CSS is recoverable with
`git log --all -S "seg-compact" -- src/`, naming commits `768f12a` and `aa99dca`.
**It is not.** Those commits are not in a fresh clone, and the string has never
appeared in any `src/` blob in fetched history — clones arrive shallow
(`.git/shallow`, ~106 commits, 2 branches). If you want to check for yourself,
`git fetch --unshallow` first; if it is still absent, **write it again**. Budget
for writing, not for archaeology.

## BUILD

1. **`public/manifest.webmanifest`** — name, short name, description, theme and
   background colours that match the *default* theme rather than fighting it,
   display `standalone`, and a maskable icon set generated from the existing
   emblem artwork (`src/cornerEmblems.ts`, `src/shieldKnot.ts`, `NOTICE.md` for
   provenance). Do not introduce new artwork; the traced Celtic set is the
   identity.
2. **A service worker** that precaches the built bundle and serves it offline.
   Keep it small and hand-written — **do not add Workbox or a PWA plugin**; this
   project has two runtime dependencies and that is a feature. Cache-first for
   hashed assets (they are immutable, per `vercel.json`), network-falling-back-to-
   cache for `index.html`. **Version the cache and clean up old versions on
   activate**, or the next deploy serves a stale app forever.
3. **Handle the update path visibly.** A service worker that silently pins an old
   build is worse than none. Minimum: detect a waiting worker and offer a
   "Refresh to update" affordance. It is a Zen extra like everything else
   (`src/zen.ts`) *or* an unconditional one-line banner — pick one and justify it.
4. **Rewrite the header to survive three buttons.** A compact segmented switcher
   plus a header that wraps as a whole. Test at 360, 390, 430 and 520 px. This is
   the piece that was written once and lost; write it to be found next time.
5. **Add one new visible locale.** Use the tafl vocabulary in
   `dcampbell24/hnefatafl`'s `locales/app.toml` as a reference — that file is
   **CC0-1.0** (public domain) even though the surrounding app is AGPL, so the
   words are free to use. **Scope honestly:** it is 115 keys with different key
   names and this interface has 448. It de-risks the domain vocabulary
   (*attacker, defender, throne, rated, draw*), not the translation. Ship **one**
   language properly rather than three badly, and say in the commit message how
   the copy was produced and who, if anyone, reviewed it.

## CONSTRAINTS

**Do not add `ga` to `VISIBLE_LANGS`** (`CLAUDE.md`) — the Irish copy is blocked
on a human reviewer, not on header space, and shipping the compact header does
**not** unblock it. Do not delete the `i18n.test.ts` assertion that keeps it
hidden. New locale means a new full table: **strict TypeScript is the
completeness check** and `npm run build` will fail on a missing key — that is the
gate working, not an obstacle. Never set non-Gaelic text in the cló Gaelach face
(`NOTICE.md`, `src/gaelic.ts`). 100 % offline, no new runtime dependency,
theme-aware, `prefers-reduced-motion` respected. Do not regenerate
`docs/screenshot.png` — `TASKS.md` records that choosing what it should show is
an open product decision, and this session does not settle it.

## VERIFY

`npm test` green including i18n completeness. `npm run build` clean.
**Driven-browser pass required**: install the app from the production build,
kill the network, confirm it launches and plays; deploy a changed build and
confirm the update affordance appears rather than the app pinning silently;
screenshot the header at 360 / 390 / 430 / 520 px with three languages present
and confirm no overflow and no three-line subtitle. `npm run check:evalbar`
green — the shell is where a stylesheet regression would land. Commit + push;
no PR unless asked. Update `docs/ROADMAP.md`, `TASKS.md` (strike the compact
header), `docs/prompts/README.md`, and `README.md`'s offline claim, which becomes
true in a stronger sense than it was.

## PROGRESS

- [ ] 1. `manifest.webmanifest` + icons from existing emblem artwork
- [ ] 2. Hand-written service worker, versioned cache, old caches cleaned
- [ ] 3. Update affordance for a waiting worker
- [ ] 4. Compact header, verified at 360/390/430/520 px
- [ ] 5. One new locale, complete table, provenance stated
- [ ] `ga` still hidden and its test still present
- [ ] Tests green, build clean, install + offline + update verified, pushed
