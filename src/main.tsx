import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import App from "./App";
import ProvingGround from "./components/ProvingGround";
import { isProvingPath } from "./game/proving";

// The **Proving ground** is one unlisted path, read once, with no router:
// `vercel.json` rewrites `/(.*)` to `index.html`, so a path is there for the
// asking. It is mounted *instead of* `App` rather than inside it, because the
// app shell is four thousand lines of game state the calibration page needs none
// of, and an early return cannot come before four thousand lines of hooks.
//
// Unlisted and not secured, and `proving.ts` says why at length: a password
// checked in client-side JavaScript can be read out of the bundle, and there is
// nothing here to decrypt, because the puzzle bank ships in the bundle for the
// normal app anyway (ADR-0004).
const page = isProvingPath(window.location.pathname) ? <ProvingGround /> : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {page}
    <Analytics />
  </StrictMode>,
);
