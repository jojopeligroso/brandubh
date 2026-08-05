# The proving ground has no backend, and its lock is a sign

Puzzle **Grades** are estimates. Lichess grounds its equivalent in Glicko
ratings computed from millions of attempts; this app has no backend and no
crowd, so the weights have to be fitted against a small number of real people
solving real puzzles. The **Proving ground** is where that data comes from: an
unlisted page that shows a position cold, times an attempt, reveals the answer,
and only then asks for **Comparisons** against **Anchors** already solved
(ADR-0005). A person only ever compares one puzzle against another; the fitted
formula assigns the **Band**. Asking people at all is what keeps the four band
labels honest, so that a puzzle filed under Hard broadly feels hard to whoever
meets it. The timings and the comparisons are the two arrays a session
accumulates. Both write to the person's own `localStorage`, and both leave via
the same two buttons: one that opens a prefilled `mailto:` in their own mail
client, one that copies the blob to the clipboard.

One session sends one email carrying both arrays. A full eighty-puzzle run is
about 985 characters, comfortably inside the ~1800 worth treating as the safe
`mailto:` ceiling. The page must nonetheless measure the blob and steer to the
clipboard rather than emit a truncated link: a truncated JSON array still
parses, so the failure would be silent and would corrupt the fit. The blob
carries its own entry count and the ingest script checks it — the same instinct
as the `capture_mismatch` guard in `replay.ts`.

A future reader will see an unguessable URL and a `mailto:` where an API
endpoint would be, and want to fix both. Neither is an oversight.

## Why no endpoint

`package.json` has two runtime dependencies and CLAUDE.md states "no router,
no backend" as a property of the project. A form service or a serverless
mailer would add a publicly reachable send capability — a spam vector needing
a token and a rate limit — in exchange for saving the tester one click.
`mailto:` puts the sending in the tester's own client, so nothing leaves any
device without the person seeing exactly what is in it, and there is no
endpoint to abuse. If manual collection ever proves too lossy, the blob is
already shaped to be a request body.

## Why the gate is only a sign

Any password checked in client-side JavaScript can be read out of the bundle
and skipped; hashing it hides the plaintext, not the check. A client-side
password is only meaningful when it decrypts the gated content, and here there
is nothing to decrypt — the puzzle bank ships in the bundle for the normal
app, so the page reveals nothing that is not already public. The arrival
screen therefore explains what the page is rather than pretending to guard it,
and the code says "unlisted, not secured" so nobody later mistakes it for
access control.
