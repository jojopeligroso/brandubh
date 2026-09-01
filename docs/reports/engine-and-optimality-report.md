# The Brandubh Engine — a comprehensive report

*Covering: what the sessions achieved, how the engine works, the techniques behind
it, the mathematics of optimality, and precisely what can — and cannot — be
claimed about how close this play is to perfect, under the WTF ruleset.*

---

## The one-pager

**What we built.** A complete, offline, browser-based Brandubh (7×7 Irish tafl)
game with a serious AI opponent. The engine is a classical game-tree searcher of
the same family as pre-neural chess engines — alpha–beta search with iterative
deepening, a transposition table, quiescence search, move ordering, late-move
reductions, and board-symmetry folding — plus two things most hobby engines never
get: **exact endgame recognizers that are mathematically proven correct** (they
never claim a forced win that isn't one, validated against an exhaustive solver),
and, as of the latest session, a **precomputed opening book** so the strongest
difficulty ("Ollamh") answers the first two moves of each side instantly.

**What the last session specifically delivered.** The opening book: an offline
generator that deep-searches the opening tree (folded 8× by the board's
symmetry), keeps only moves that are *exactly tied for best* at the strongest
tier's own search depth, and bundles the result into the app (343 folded entries
→ 2,737 playable positions, ~6 kB of gzip weight). Measured results: opening
replies in **0.1–0.5 ms instead of 3.2–4.5 s**; **20 distinct four-move openings
where there were 6**; and a strength gauntlet that finished **28–20 in the
book's favour** (48 games, identical engine otherwise). Two genuine generator
bugs were found by measurement and fixed before shipping; two candidate books
were rejected on evidence. Nothing shipped on faith.

**The claim you can stand over** — worded carefully, because the wording is the
claim: Brandubh under WTF rules is **not solved**, by us or by anyone; the
game-theoretic value of the opening is unknown, and we prove in §IV that
computing it is a research-cluster project, not a browser feature (≈6×10¹⁴
symmetry-reduced positions; centuries at our measured node rate; ~150 TB just to
store one value per position). Therefore *no one* can honestly say "this play is
close to the optimal strategy" as a statement about game theory — there is no
known optimal strategy to be close to. What you **can** say, and defend line by
line:

> *"Every approximation in this engine is either proven exact where proof is
> tractable, or measured against the strongest available baseline where it is
> not. The endgame recognizers are mathematically sound — cross-validated
> against an exhaustive solver. The opening book contains only moves the
> strongest search tier itself finds equal-best, precomputed. Every
> strength-affecting change ran a gauntlet, and nothing that measured as a
> regression was ever shipped. This is the practical ceiling of play achievable
> without a dedicated solving effort of the kind that took the checkers
> community eighteen years and a cluster."*

That is a strong, true, and complete statement. The full argument for each
clause is in Part V.

**Key numbers at a glance**

| Measurement | Value |
|---|---|
| State space (WTF Brandubh, upper bound) | ≈ 4.8 × 10¹⁵ raw; ≈ 6.0 × 10¹⁴ after symmetry |
| Time to visit each position once at measured speed | ≈ 228 years (single thread) |
| Storage for one value per position (2 bits each) | ≈ 150 TB |
| Deepest proven results | forced wins/losses several plies out; exact recognizers; reduced positions solved outright |
| Opening book | 343 folded / 2,737 expanded positions, depth-8 exact ties only |
| Booked reply latency | 0.1–0.5 ms (vs 3.2–4.5 s searched) |
| Opening variety (4-ply lines, seeded) | 20 distinct with book vs 6 without |
| Final gauntlet | book 28 — no-book 20 (48 games) |
| Test suite | 496 tests, all green; build clean |

---

## Glossary

Read this first; every term below is used in the report. Terms are ordered so
that each builds on the ones before it.

- **Ply.** One move by one side. A "move" in casual speech is often two plies
  (one by each player). "Searching to depth 8" means looking 8 plies ahead.
- **Game tree.** The branching structure of all possible futures: the current
  position is the root, each legal move is a branch, each resulting position is
  a node with branches of its own. Chess, draughts, and tafl analysis all start
  here.
- **Branching factor.** How many legal moves a typical position has. Brandubh's
  opening has 40; mid-game positions have roughly 30–50. The tree grows as
  (branching factor)^depth — exponentially.
- **Terminal position.** A position where the game is over (king captured, king
  escaped, encirclement, repetition, or no legal moves). Its value is a fact,
  not an estimate.
- **Game-theoretic value.** The result of a position if both sides play
  perfectly from there on: attacker win, defender win, or draw. Every position
  has exactly one, whether or not anyone knows it.
- **Minimax.** The bedrock algorithm: my best move is the one whose *worst case*
  (after your best reply, after my best reply to that…) is best. Computing it
  exactly requires visiting the whole subtree; everything else in this report is
  about doing dramatically less work while losing as little as possible.
- **Evaluation function ("eval").** A hand-built formula that scores a
  non-terminal position from static features (material, king safety, escape
  lanes…) when the search must stop before the game ends. It is a *heuristic* —
  an educated estimate, not a truth. In this engine, positive favours the
  attackers; the material term (40 per attacker) is the scale's yardstick.
- **Heuristic.** Any rule of thumb used in place of exhaustive calculation.
  Fast, useful, and fallible — the report is careful to mark which parts of the
  engine are heuristic and which are proven.
- **Alpha–beta pruning.** An exact optimisation of minimax: once one reply
  refutes a move, remaining replies to it need not be examined. With perfect
  move ordering it searches roughly the *square root* of the minimax tree —
  the same answer, exponentially cheaper. "Exact" matters: alpha–beta never
  changes the result, only the cost.
- **Move ordering.** Searching probable-best moves first, which is what makes
  alpha–beta's pruning bite. This engine orders: the previously-best move, then
  captures, then "killer" moves (see below), then geometric heuristics.
- **Killer move.** A move that caused a cutoff at the same depth elsewhere in
  the tree; remembered and tried early, since refutations tend to recur.
- **Transposition table (TT).** A hash table remembering positions already
  searched (the same position is reachable by many move orders — a
  *transposition*). Stores the value found, how deep the search beneath it was,
  and the best move. Saves enormous re-search and improves ordering.
- **Iterative deepening.** Search to depth 1, then 2, then 3… until time runs
  out. Sounds wasteful; isn't (the last iteration dominates the cost, and each
  pass seeds the next one's move ordering via the TT). Also what lets a time
  budget always return the best *completed* answer.
- **Horizon effect.** The classic failure of fixed-depth search: a disaster one
  ply beyond the search depth is invisible, so the engine happily "gains" a
  piece and loses the game. Named as if the search cannot see past its horizon
  — because it can't.
- **Quiescence search.** The cure: at the depth limit, don't evaluate a
  position mid-exchange — keep searching *tactical* moves only (captures, king
  escapes, king-adjacent attacker moves) until the position is quiet, then
  evaluate. Kills most horizon blunders.
- **Late-move reductions (LMR).** Moves ordered far down the list are probably
  bad, so search them shallower; if one surprises, re-search it at full depth.
  A measured speed/accuracy trade that buys about an extra ply here.
- **Depth floor / time budget.** The strongest tiers search on a clock (e.g. 8 s)
  but guarantee a minimum depth even on slow hardware, so "slow phone" never
  means "shallow blunders".
- **D4 (dihedral group of the square).** The 8 transformations that map a square
  board onto itself: 4 rotations and 4 reflections. Brandubh's board, throne,
  corners, and starting position are all unchanged by every one of them.
- **Orbit / canonical form / stabiliser.** Under those 8 transforms, positions
  fall into families ("orbits") of game-identical mirror images. The *canonical
  form* is one agreed representative per family (we use the lexicographically
  smallest encoding); the *stabiliser* is the subset of transforms that map a
  given position onto itself. Searching one representative per orbit does ⅛ of
  the work in the symmetric opening (the 40 first moves fold to 5).
- **Opening book.** A precomputed table: position → good move(s), consulted
  before searching. Ours is keyed by an exact position hash and stores only
  moves found *equal-best* by a fixed-depth search.
- **Multi-PV.** A search that returns accurate scores for *several* top moves,
  not just the single best ("PV" = principal variation, the best line). Needed
  by the book generator; implemented as `scoreRootMoves`.
- **Seeded RNG / determinism.** All randomness in tests and measurements comes
  from a seeded pseudo-random generator, so every experiment is exactly
  repeatable. The engine itself is deterministic given a seed and a fixed depth.
- **Self-play gauntlet.** The measurement standard used throughout: two engine
  configurations play a series of games against each other from identical
  seeds, both colours. The only accepted evidence that a change helps, hurts,
  or is neutral.
- **Paired gauntlet.** A gauntlet variant where the same seeds run with a
  feature on and off, and only *changed outcomes* ("flips") are counted. More
  sensitive — but see Part III for the trap we documented with it.
- **Solved (three grades).** *Ultra-weakly solved:* the value of the starting
  position is known, without a strategy. *Weakly solved:* value plus a strategy
  achieving it from the start. *Strongly solved:* perfect play known from
  every legal position. Brandubh under WTF rules is **none of these**.
- **Sound (of a solver or recognizer).** Never wrong when it speaks: it may
  answer "unknown", but a definite answer is a proof. Our bounded solver and
  both endgame recognizers are sound in this sense.
- **Exhaustive / bounded solver.** A program that computes true game-theoretic
  values by complete search of a subtree, within a node budget; past the
  budget it reports "unknown" rather than guessing (`src/game/solver.ts`).
- **Recognizer.** A fast, provably-correct pattern check at search leaves for
  positions whose outcome is already forced (e.g. a king with two clear lanes
  to different corners cannot be stopped). Converts a heuristic leaf into an
  exact one at almost no cost.
- **Retrograde analysis / tablebase.** Solving backwards from all terminal
  positions to build a table of perfect play for every position with few enough
  pieces. How chess endgames and all of checkers were solved. Storage-hungry —
  the reason a Brandubh solve needs terabytes.
- **Proof-number search (df-pn).** A specialised solving algorithm that steers
  toward whichever line currently needs the least additional proof — the
  standard tool for cracking opening values, used in the checkers solve.
- **Zobrist hashing.** The standard fast incremental position-hashing technique
  real solving engines use. (This engine uses simple string keys — honest
  overhead accounted in the throughput numbers of §IV.)
- **WTF rules.** The World Tafl Federation tournament ruleset for Brandubh, the
  app's shipping default: armed king, hostile corners, empty throne hostile to
  soldiers, strong king on/next to the throne (four-sided capture, empty throne
  counting as a wall), encirclement win, repetition loses for defenders. One
  clause (king-next-to-throne capture) is flagged in-repo as contested and is
  toggleable; the book is fingerprint-locked to the exact flag set.
- **Ollamh.** The strongest difficulty tier (named for the highest rank of
  Gaelic filí): 8-second budget, depth floor 5, reaches depth ~8–9 in the
  opening — and now plays the first two moves per side from the book.

---

## Part I — What was achieved

### The project, session by session

The engine and app were built across a series of focused sessions, each ending
green (tests passing, build clean, strength changes gauntletted) before merging:

1. **Game resumability** — a refresh never loses a game; the live game is
   stored as its move list and replayed on load, the same design Lichess uses.
2. **Play either side** — raiders or king, with all side-derivation in one
   module and the clock following the human.
3. **Export / import** — a PGN-style text format compatible with the notation
   used by the tafl community (aagenielsen.dk), with one shared
   replay-and-validate trust boundary for both storage and pasted games.
4. **Attacker endgame recognizer** — the proven forced-king-capture twin of the
   defender recognizers; measured *not free* (~7 % throughput) and strength-
   neutral, so shipped default-off as an analysis tool. The measurement, not
   the intention, made the shipping decision.
5. **Correctness & polish batch** — Zen-mode reachability, a subtle
   autosave/rules-mismatch bug fixed by carrying per-ply capture counts through
   the same validation path the export format uses, and the deliberate
   *re-hiding* of the Irish locale until a human speaker reviews it.
6. **The opening book** (this session — detail below).
7. **Analysis suite** (parallel sessions, merged here): eval bar, best-move
   arrow, board mirrors, move tree, post-game annotations, position paste.

Two philosophical throughlines the sessions kept: **never ship a measured
regression**, and **label honestly** — heuristics are called heuristics, proofs
are called proofs, and when a label stopped being true (see the book's
"proven"→"best-effort" relabeling) the label changed in every place it appeared.

### This session: the opening book, and how it was actually won

The naive version of this feature is an afternoon's work: search some opening
positions offline, save the answers, look them up at play time. What made it a
real session is that the first two versions were *measurably wrong*, and the
measurement infrastructure caught both.

The session's chronology, compressed:

1. **A multi-PV scorer was added to the engine** (`scoreRootMoves`): the book
   needs "all moves within a margin of best, with exact scores", which a normal
   alpha–beta root loop deliberately never computes (it prunes everything
   provably worse than the best). The trick: score the best move with tight
   windows as usual, then re-search the others with the window widened by the
   margin — near-best moves fall inside the window and come back exact,
   clearly-worse moves fail low almost free.
2. **The generator** (`scripts/genbook.ts`) walks the opening tree as two
   interleaved "cones" — because only positions the book itself steers into are
   reachable through it. When Ollamh plays attackers it needs plies 0 and 2
   booked: its own first move, then a reply to *every* legal defender answer.
   When it plays defenders it needs plies 1 and 3: an answer to every attacker
   first move, then to every attacker follow-up along its own booked replies.
   The booking side's plies keep best moves; the opponent's plies expand every
   legal reply, because a human can play anything. Every discovered position is
   canonicalised under D4 on the spot, so each family of mirror images is
   searched once; the loader unfolds all 8 images again at load time.
3. **Candidate 1** followed the original sketch — keep the best 3 moves within
   a margin of ⅓ of a material unit, "for variety". The gauntlet **rejected
   it**: at depth 4 it lost 7–17. The post-mortem is obvious in hindsight: a
   move booked as "close to best" is still deliberately-not-best, and the
   design's other promise — *a book move is never weaker than what Ollamh would
   have found itself* — is only actually true at margin zero.
4. **Candidate 2** (margin 0, first plies searched one ply deeper "because
   deeper is better") got *worse* in the paired gauntlet — and chasing that
   found **two real generator bugs**: an accept test that compared against the
   integer-widened search window instead of the margin (letting fractionally
   worse moves pass as "ties"), and generation running with a transposition
   table warmed by *other* positions, whose leftover bounds caused ordinary
   search instability — a move the live engine rates 6 points worse shipped
   inside an "exact ties" entry. Both fixed: strict accepts, and a **cold table
   per scored position**. The generalisation is worth framing: *a book must be
   generated by the exact computation that will consume it.* Even "deeper" is
   not safely better, because a shallower live engine must play the follow-up
   positions the deeper choice leads to.
5. **The shipped book** is therefore the purest possible object: for each
   position, precisely the set of moves a fresh depth-8 search — Ollamh's own
   measured live opening depth — finds exactly tied for best. Nothing else.
   Variety comes from genuine ties multiplied by the 8 board orientations,
   not from booking weaker moves.
6. **One measurement-methodology lesson** was documented for posterity: the
   paired gauntlet kept showing "6 flips against" for *every* candidate —
   byte-identical results across three different books, which no real strength
   difference can produce. Tracing the flipped games showed each diverged where
   the book picked a *different member of the same verified-equal tie class*
   than the baseline picked, after which the games simply went somewhere else
   (and under fresh seeds the "losing" member won and the "winning" member
   lost). Once the first divergence is between equal-valued moves, a paired
   design is comparing two tickets from one lottery — it measures trajectory
   chaos, not strength. The discriminating instrument was the ordinary
   head-to-head gauntlet, where the shipped book finished 28–20 up.

Deliverables: the generator, the bundled data (fingerprint-locked to the WTF
rule flags, legality-revalidated on every lookup, consulted only by Ollamh),
six new tests, the measurement harness, honest relabeling through code and
docs, and roughly 6 kB of gzip bundle weight against a 150 kB budget.

---

## Part II — How the engine works

### The rules engine: one source of truth

Everything stands on `src/game/engine.ts`: an immutable rules engine that knows
how pieces slide, how custodial capture works (a soldier is taken when flanked
by two enemies or an enemy and a hostile square), the special king-capture
rules (on or beside the throne the WTF king must be boxed on all four sides,
the empty throne counting as a wall; the capture must be *active* — the moved
piece participates), corner escapes, encirclement (a flood-fill check that the
king's side is sealed away from every board edge), repetition, and
stalemate-as-loss. Every higher layer — search, solver, recognizers, book
generator, tests — calls this one implementation, so a rule is never encoded
twice. When a subtle rules question came up (whether a king beside the throne
can also be captured custodially), it was flagged **in the code and docs as
contested**, defaulted to the best reading of the sources, and exposed as a
toggle — the honest way to handle genuine ambiguity in a reconstructed
medieval game.

### Game-tree search, from first principles

Imagine the current position as the trunk of a tree. Each of your ~40 legal
moves is a branch; each of your opponent's replies branches again. Perfect play
is a fact about this tree: a terminal position's value is known outright, and
any other position's value is the best (for the mover) of its children's
values. That recursive fact is **minimax**. Applied literally it means visiting
the entire tree — at 40 branches per ply, depth 8 alone is 40⁸ ≈ 6.5 × 10¹²
visits. Everything interesting about a game engine is how it avoids that work
*without changing the answer* where it can, and *degrading gracefully* where it
must.

The engine's toolkit, in the order the search applies it:

- **Alpha–beta pruning** (exact — same answer as minimax). While examining
  your moves, the search carries the score you can already guarantee. The
  moment one of the opponent's replies to a candidate move drops below that
  guarantee, the candidate is refuted — its remaining replies are irrelevant.
  Well-ordered, this searches ≈ the square root of the minimax tree: depth 8
  costs like depth 4.
- **Move ordering** (what makes pruning bite): previously-best move from the
  transposition table first, then captures, then killer moves, then geometry
  (attackers toward the king, everyone toward the centre). Ordering is why the
  engine's real trees are hundreds of thousands of nodes, not trillions.
- **The transposition table** (exact, with a standard caveat): positions recur
  through different move orders; the table remembers each position's searched
  value, depth, and best move. The caveat — repetition rules make a position's
  true value depend slightly on its history, which position-keyed tables
  ignore; every serious engine accepts this tiny unsoundness and we document
  it rather than pretend otherwise.
- **Iterative deepening + a predictive clock**: search depth 1, 2, 3… and stop
  when the *next* iteration wouldn't finish in budget (estimated from the
  observed growth rate), so a strong tier never wastes its budget on a
  half-finished ply. A **depth floor** guarantees minimum quality on slow
  devices; the floor is honoured even if it costs more than the nominal budget.
- **Quiescence search** (heuristic-taming): at the depth limit, tactical moves
  — captures, king escapes, attackers landing beside the king — keep being
  searched until the position is quiet. This is what stops "I win a soldier"
  evaluations one ply before the king falls. The test suite contains a
  constructed position where the non-quiescent engine demonstrably hangs its
  king and the shipping engine demonstrably doesn't.
- **Late-move reductions** (measured trade): moves far down the ordering are
  searched one or two plies shallower, with a full-depth re-search if the
  shallow probe surprises. Bought roughly a ply of effective depth in
  benchmarks.
- **D4 symmetry folding at the root** (exact): at symmetric positions a move
  and its mirror image are literally the same move; the opening's 40 legal
  moves fold to 5 representatives. Applied at the root only — per-node
  canonicalisation was measured and rejected as costing more than it saved
  mid-game, a decision recorded in the repo.
- **Two knobs deliberately OFF, with receipts**: null-move pruning (unsound in
  tafl's zugzwang-rich endgames) and PVS/aspiration windows (measured neutral
  here — the ordering and table already tighten windows). Both are documented
  as tried-and-rejected rather than absent.

### The evaluation function

When the search must stop, `evaluate()` scores the position: **material** (40
per attacker, defenders scarcer so weighted double), **king–corner distance**,
**open escape lanes** (squared — one open lane is a worry, two is nearly a loss),
**attacker pressure** beside the king, **king liberties** (raw breathing room
around the king), and **king confinement** (a capped flood-fill of the squares
the king can reach — the gradient the encirclement win needs). Every weight
earned its place in a self-play gauntlet. `shield` and `blocker-aware king
distance` measured neutral and ship as opt-in knobs at weight zero. `mobility`
measured significant once (p=0.0118, marginal once corrected for testing four
candidate terms at once) but unreplicated and redundant with `liberties` in a
combined run, so it stays parked too.

`liberties` did not stay parked. It was first parked on the same
"neutral-or-worse" verdict as the other three, produced by a gauntlet
(`scripts/evaltune.ts`) later shown to carry an 87.5% side bias — an
identical-configuration A/A control split 21–3 to whichever side moved second,
which is enough to hide a real signal the size of one eval term. Re-measured on
a mirrored-pair gauntlet built to cancel that bias by construction
(`scripts/pairgauntlet.ts`, itself validated before being trusted for
anything), `liberties` measured significantly better across 120 mirrored
pairs: 33W/5L, p=4.3e-6. It now ships at weight 12. That result is exactly what
it says and no more — **one eval term measured significantly better across 120
mirrored pairs on a validated instrument** — not a claim that the engine is
stronger in any general sense; see Part V for the bounds this report holds
itself to. The scale matters for the book: "a third of a material unit" (~13
points) was the rejected variety margin in Part I.

### The proven layer: recognizers and the solver

Two components of this engine are **not** heuristics, and the distinction is
the backbone of the optimality argument in Part V:

- **The bounded solver** (`src/game/solver.ts`) computes true game-theoretic
  values by exhaustive search within a node budget. It is *sound*: it answers
  "attacker win / defender win / draw" only with a complete proof in hand, and
  "unknown" otherwise. It never guesses.
- **The endgame recognizers** in the evaluator: the defender pair (an
  already-open escape lane; the two-lane fork no single attacker move can
  cover; the guarded corner race into such a fork) and the attacker twin (an
  imminent forced king capture). Each is a small theorem implemented as code —
  e.g. *"if the king has clear straight lanes to two different corners, and no
  attacker reply both survives and seals every lane, the defender wins next
  move"* — and each was **cross-validated exhaustively against the solver**
  over random positions: wherever a recognizer speaks, the solver agrees. They
  turn heuristic leaf evaluations into exact ones for the patterns that decide
  real endgames, at essentially zero cost for the defender pair (the attacker
  twin measured ~7 % throughput and ships default-off — measurement, again,
  making the call).

### The difficulty ladder and the runtime

`easy` (depth 2, no quiescence, deliberate blunder rate), `medium` (depth 3,
full machinery, ~instant), `hard` (3 s budget, floor 4), `ollamh` (8 s budget,
floor 5, reaches ~8–9 in the opening — and consults the book first). The search
runs in a Web Worker so the interface never freezes, falls back to synchronous
search where workers are unavailable, and the whole thing — book included — is
bundled statically: the app works fully offline, no backend anywhere.

---

## Part III — The opening book, technically

**Why a book at all.** The opening is the *worst* case for live search (most
pieces, most symmetric, most branching) and the *best* case for precomputation
(few reachable positions, perfectly predictable). And the strongest tier's one
user-facing weakness was its opening: 3–4.5 seconds of thinking to produce the
same first move nearly every game.

**The symmetry mathematics.** The board, throne, corners, and initial position
are invariant under all 8 elements of D4 (identity, rotations by 90/180/270°,
four reflections). Two consequences are load-bearing. *Generation:* positions
are stored and searched in canonical form — the lexicographically smallest of
a position's 8 encodings — so each orbit of mirror-image positions is computed
once (343 entries instead of ~2,700). *Play:* the loader re-expands every entry
under all 8 transforms (transforming the stored moves' coordinates with the
board), merging orientations at symmetric positions — so at the fully-symmetric
opening, one canonical "equal-best" set becomes up to 8× as many concrete
playable moves, all game-identical in value by symmetry. That is where most of
the variety comes from, and it is *provably free*: a move and its mirror have
the same game-theoretic value because the transform is an automorphism of the
rules.

**What qualifies a move for the book.** A fresh (cold-table) depth-8 search of
the position — depth 8 being Ollamh's own measured live opening depth — and
membership in the *exact tie set* for best score. No margins, no judgment
calls. The multi-PV scorer exists to compute that set efficiently; the
candidates that relaxed this (margin 13; mixed depths; warm tables) are the
ones the gauntlets rejected in Part I.

**Safety gates at play time** (these are the guarantees that survive even a
corrupt book): the book is consulted **only** by the Ollamh tier; **only** when
the live ruleset's flag-fingerprint exactly matches the generation ruleset
(the Walker variant and any custom rules fall through to live search, since a
move tuned for WTF rules carries no warranty elsewhere); and every served move
is **re-validated against the live legal-move generator** — a bad entry can
cause a silent fallthrough to search, never an illegal move on the board.
Coverage is exactly plies 0–3; a miss at any point simply means Ollamh thinks,
as it always did.

**Cost.** 20 kB of raw data, ~6 kB total gzip across the two bundles, 18
minutes of deterministic 4-core generation, reproducible with one command.

---

## Part IV — The mathematics of finality

This section is the honest core of the report: what "optimal" would even mean
here, and exactly how far away it is.

### The three grades of "solved"

Game theory gives "solved" three precise meanings (see Glossary): knowing the
opening's value (*ultra-weak*), knowing a strategy that achieves it
(*weak* — this is what "solving a game" usually means; checkers 2007 is the
landmark), and knowing perfect play from every position (*strong*). The
question "is this engine close to optimal?" is a question about distance to a
weak solve. So: how big is the problem?

### Counting the states

Non-terminal Brandubh positions keep the king on the board, with 0–4 defenders
and 0–8 attackers on the other 48 squares, either side to move:

$$\sum_{d=0}^{4}\sum_{a=0}^{8} 49\cdot\binom{48}{d}\cdot\binom{48-d}{a}\cdot 2 \;\approx\; 4.8\times10^{15}$$

Dividing by the 8 board symmetries gives **≈ 6.0 × 10¹⁴** distinct positions.
This is an upper bound (it counts unreachable arrangements too), but
reachability pruning does not buy the ~10 orders of magnitude that would change
any conclusion below.

### The time wall

The engine's measured solving throughput in this environment is ≈ 8.3 × 10⁴
nodes/second single-threaded. Visiting the symmetry-reduced space *once* —
and a real solve revisits positions many times —

| Engine | Rate | One pass over 6 × 10¹⁴ |
|---|---|---|
| This engine (immutable, string-hashed) | 8.3 × 10⁴/s | **≈ 228 years** |
| Purpose-built bitboard engine | 10⁶–10⁷/s | ≈ 19 → 1.9 years |

### The memory wall (the worse one)

A strong solve stores a value per position. At a ruthless 2 bits per position
over the reduced space: **≈ 150 TB**. One byte per position: ≈ 600 TB. That is
disk-array, streaming-retrograde-analysis territory — the actual engineering
that the checkers solve did across 18 years and hundreds of machines, for a
game whose space (5 × 10²⁰) is five orders larger than Brandubh's. The
comparison cuts both ways, and both honestly: Brandubh is **plausibly solvable
in principle** by a dedicated research effort — *and it is emphatically not
solvable in a browser tab, an app bundle, or a development session.*

### What was actually attempted, and what the "unknown" means

The bounded solver was pointed at the WTF opening with budgets up to five
million nodes. Result: **UNKNOWN** at every budget — and that is the correct
output, because five million nodes against ~6 × 10¹⁴ positions is a coverage of
about **8 × 10⁻⁹**. The important property is that the solver is *sound*: its
"unknown" is a statement of budget exhaustion, never a guess dressed as an
answer. When the same solver is pointed at reduced positions whose subtrees fit
the budget, it returns fully-proven values — which is exactly the behaviour the
recognizers were validated against.

### So what *is* final?

- **Terminal facts** — every win/loss/draw the rules engine declares.
- **Proven tactics** — forced sequences within the solver's reach: mates-in-N
  for both sides, with distance-to-mate, verified by tests.
- **The recognizers' patterns** — every position they fire on is a proven
  forced win, cross-validated exhaustively against the solver.
- **Symmetry equivalences** — a position and its D4 image have identical value;
  this is a theorem about the rules, not a heuristic.
- **Search-relative facts** — "these book moves are exactly tied for best *at
  depth 8 under this evaluation*" is a reproducible, deterministic fact. Note
  its two qualifiers; they are the honest boundary of the claim.

Everything else — every mid-game evaluation, every depth-limited best move —
is a measured approximation, and the engine's discipline is that it *knows
which of its statements are which*.

---

## Part V — What you can stand over

You asked to be able to defend the idea that this is "close to an optimal
solution" for WTF Brandubh. Here is precisely how far that claim can be pushed,
clause by clause — and where pushing further would break it.

**Claims that are true and defensible, with their defence:**

1. *"The game is not solved — by us or anyone — and we can quantify why."*
   Defence: Part IV. No published solve of WTF Brandubh exists; our own sound
   solver returns "unknown" at the opening; the space/time/memory arithmetic
   is in the repo and reproducible with one command.
2. *"Where proof is tractable, this engine is exactly right — provably."*
   Defence: the solver is sound by construction (budget-bounded, never
   guesses); the recognizers were validated exhaustively against it; forced
   sequences within search reach are proven, not estimated.
3. *"Where proof is intractable, every design choice was measured, and nothing
   that measured as a regression was ever shipped."* Defence: the gauntlet
   record — eval weights (losers shipped off), PVS (neutral, off), null-move
   (unsound, out), attacker recognizer (neutral-not-free, off by default), two
   opening-book candidates (rejected on evidence), the shipped book (ahead
   28–20).
4. *"The strongest tier's opening play is its own best search, precomputed" —*
   i.e. the book cannot be weaker than Ollamh unbooked, because it contains
   exactly the moves Ollamh's own search finds equal-best, computed the same
   way. Defence: margin 0, depth 8, cold generation, plus the legality and
   ruleset gates.
5. *"This is close to the practical ceiling for this game without a dedicated
   solving project."* Defence: the remaining known upgrades (bitboards,
   tablebases, df-pn — Part VI) are throughput and infrastructure plays whose
   costs are quantified in-repo; none change what a browser-resident engine
   can prove.

**Claims you must not make (and the failure they'd invite):**

- *"This play is close to game-theoretically optimal."* Unknowable. Nobody can
  measure distance to an optimum nobody has computed. If challenged by anyone
  who knows the field, this claim collapses and takes your credibility with it
  — precisely because the honest version (claims 1–5) was available.
- *"The opening book is proven best play."* It is proven equal-best **at depth
  8 under this evaluation** — a different and weaker statement, deliberately
  relabelled from "proven" to "deep-search best-effort" throughout the repo.
- *"The engine never blunders."* Depth-limited search has horizons; quiescence
  and recognizers push them out and the gauntlets bound the consequences, but
  no finite search of an unsolved game excludes error.

The one-sentence version you can use anywhere, already quoted in the one-pager:
**proven exact where proof is tractable; measured against the strongest
available baseline everywhere else; nothing shipped that measured worse.**
That sentence is this project's actual achievement, and it is bulletproof.

---

## Part VI — How we know: the verification methodology

- **496 automated tests across 23 files**, including: rules-engine fixtures for
  every capture/escape/encirclement/repetition subtlety; constructed positions
  where the search must find (or avoid) specific tactics; a demonstration pair
  proving quiescence fixes a horizon blunder the legacy config commits;
  solver/recognizer cross-validation sweeps; persistence and import round-trips;
  and the six book tests (instant booked play for Ollamh only; illegal entries
  fall through; wrong rulesets fall through; full two-ply coverage; every
  expanded entry legal and deduplicated via an independent decoder; seeded
  variety with per-seed determinism).
- **Determinism as policy**: seeded RNG everywhere in tests and benches; fixed
  depths for comparisons; the book generator is fully deterministic, so the
  shipped data is reproducible byte-for-byte.
- **Gauntlets as the only court of appeal** for strength claims, with both
  designs (head-to-head and paired) in the repo, and the paired design's
  failure mode — tie-lottery flips — documented so future sessions don't
  rediscover it the hard way.
- **Honest labeling as a maintained invariant**: docs/solving.md §5 records the
  book's relabeling explicitly, including the sentence that used to be true
  ("empty precisely because we refuse to fill it with anything unproven") and
  why its successor is the version you can still stand over.

Reproduce everything:

```
npm test                                                  # 496 tests
npm run build                                             # type-check + bundle
npx tsx scripts/solve.ts                                  # the solvability numbers, §IV
npx tsx scripts/aibench.ts                                # search benchmarks
npx tsx scripts/genbook.ts --depth 8 --plies 4 --parallel 4   # regenerate the book (~18 min)
npx tsx scripts/bookbench.ts                              # latency / variety / gauntlet
```

---

## Part VII — If we ever want the real thing

The honest road to a weak solve of WTF Brandubh, costed in the repo's
feasibility study (docs/solving.md):

1. **A bitboard rules engine** with make/unmake and Zobrist hashing —
   10–100× throughput (the current immutable engine trades speed for the
   rule-exactness that made every proof above cheap to trust).
2. **Retrograde endgame tablebases**, built bottom-up by material signature and
   streamed to a multi-terabyte array — the memory wall is the real wall.
3. **Proof-number search** over the opening, backed by those tablebases, on a
   cluster for weeks-to-months — with no convergence guarantee, since no
   solution of this game has ever been published.

Being ~10⁵× smaller than solved checkers, Brandubh is a *credible* research
target. Until someone does that work, the engine in this repository — exact
where it can be, measured where it can't, and honest about which is which — is
what "as good as it gets" actually looks like.

---

*Written from the session records in `docs/ROADMAP.md`, `docs/solving.md`,
`docs/reports/session-6-opening-book.md`, and the measurement scripts in
`scripts/`. Every number in this report is reproducible from the repository
with the commands in Part VI.*
