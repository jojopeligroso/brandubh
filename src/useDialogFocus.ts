import { useEffect, useRef } from "react";

/**
 * Keyboard focus for a modal overlay: move it in, keep it in, put it back.
 *
 * The three halves of `aria-modal="true"` that the attribute itself does not
 * deliver. `aria-modal` tells assistive technology to ignore everything outside
 * the dialog; it says nothing to the browser, so without this the Tab order
 * still runs straight through the page behind — 28 controls, measured — and
 * focus never enters the dialog in the first place.
 *
 * Found by audit rather than reasoned about in advance. Opening the Puzzles
 * screen from the drawer left `document.activeElement` on `<body>`: the row that
 * opened it had unmounted with the drawer, so the focus point was destroyed
 * rather than moved, and the next Tab started again from the top of the
 * document. Shift+Tab from the dialog's back button landed on the game file's
 * `<summary>` in the page behind.
 *
 * What it does, and each of them is one WCAG failure closed:
 *
 *  - **moves focus in** on open, to the dialog itself rather than to its first
 *    control, so a screen reader reads the dialog's name before its contents;
 *  - **cycles Tab and Shift+Tab** inside the dialog, so the page behind is not
 *    reachable while it is open;
 *  - **restores focus** on close to whatever held it when the dialog opened,
 *    so dismissing a dialog returns you to where you were rather than to the
 *    top of the page.
 *
 * `Escape` is left to the caller: both dialogs already listen for it on
 * `window`, and there is one right answer per dialog about what it dismisses.
 *
 * No visual change. The container is focused programmatically, which does not
 * match `:focus-visible`, so nothing new is drawn.
 */
export function useDialogFocus<T extends HTMLElement>(screen?: string) {
  const ref = useRef<T | null>(null);

  // Declared FIRST, and it has to be: effects run in declaration order, and the
  // opener is read from `document.activeElement`. Put the screen-change effect
  // above this one and it focuses the dialog before this line runs, so the
  // dialog records *itself* as the thing to hand focus back to and closing
  // returns to nothing. That went in and came straight back out under the probe.
  useEffect(() => {
    const opener = document.activeElement;
    const node = ref.current;
    node?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      // Queried on every press rather than cached: the dialog's contents change
      // under it (a puzzle opens, a filter narrows the list), and a cached ring
      // would trap focus against elements that have gone.
      const focusable = [
        ...ref.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        // Nothing to land on: keep focus on the dialog rather than letting the
        // browser hand it to the page behind.
        e.preventDefault();
        ref.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Focus already outside — dropped on `<body>` by a control that unmounted,
      // or left behind by something else on the page. Tab pulls it back in
      // rather than resuming from the top of the document.
      if (active === null || !ref.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Only if the opener is still in the document: a row that unmounted with
      // its own overlay cannot be returned to, and focusing a detached node
      // silently drops focus on `<body>`, which is the failure this exists to
      // fix.
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  // Focus returns to the dialog whenever `screen` changes, because a dialog
  // that swaps its own contents destroys whatever was focused: opening a puzzle
  // replaces the list that held the row you pressed, and the browser drops focus
  // on `<body>`. Measured, not supposed. Re-focusing also re-announces the
  // dialog's name, which by then is the new sub-screen's title.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [screen]);

  return ref;
}
