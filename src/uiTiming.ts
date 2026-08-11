// ── Shared exercise timing ───────────────────────────────────────────────────
// The rhythm of a played exercise, shared by every surface that judges a move
// (the bank puzzle player and the review attempts in App) so the two can never
// drift into different beats. Reduced motion keeps each beat and shortens it to
// nearly nothing: the position still changes in steps, it just does not linger.

/** How long the board rests before a move that was not the learner's plays. */
export const beat = (reduced: boolean): number => (reduced ? 60 : 620);

/** How long a wrong guess stays on the board before it is bounced back —
 *  lichess's revert. Long enough to see what the move does and the ✗ it earned,
 *  short enough that the bounce reads as a verdict rather than a freeze. */
export const bounce = (reduced: boolean): number => (reduced ? 120 : 800);
