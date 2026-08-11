import type { Translations } from "../i18n";

/**
 * The Zen control. A switch, not an icon button: Zen is a state you leave
 * turned on, so the control has to show which way it is set without being
 * pressed. `role="switch"` + `aria-checked` is the same promise made to a
 * screen reader. The word carries the meaning, so there is no icon to decode —
 * and, where the icon button was a second gold circle a glance away from the
 * eval toggle in the board tools, this cannot be mistaken for one.
 *
 * Rendered in several places, which is why it is a component rather than markup
 * in a header: its standard seat up in the header, again at the foot of the
 * page while Zen is on (the header scrolls away with the page, and the way back
 * out has to be within reach from wherever the player has scrolled to), and on
 * every full-screen game surface that honours the preference — Zen is one
 * preference, whichever board it is looked at from.
 */
export default function ZenSwitch({
  t,
  on,
  onChange,
  testId,
}: {
  t: Translations;
  on: boolean;
  onChange: (v: boolean) => void;
  /** Distinct per placement, so a driven browser can tell them apart. */
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`switch${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
      aria-label={t.zenMode}
      title={t.zenMode}
      data-testid={testId}
    >
      <span>{t.zenShort}</span>
      <span className="switch-track" aria-hidden>
        <span className="switch-knob" />
      </span>
    </button>
  );
}
