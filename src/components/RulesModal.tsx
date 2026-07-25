import type { RuleSet } from "../game/variants";

export default function RulesModal({ rules, onClose }: { rules: RuleSet; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-lg max-h-[85vh] overflow-y-auto p-6 rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl text-gold">How to play Brandubh</h2>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm text-parchment-dim">
          Brandubh (“black raven”) is the Irish 7×7 form of hnefatafl — an asymmetric Norse–Gaelic
          war game. It is <em>not</em> symmetrical chess: the two sides want different things.
        </p>

        <Section title="The armies">
          <li>
            <b className="text-gold">The King</b> sits on the centre throne with <b>4 defenders</b>.
            His side is outnumbered.
          </li>
          <li>
            <b>8 attackers</b> (raiders) ring the edges. They move first.
          </li>
        </Section>

        <Section title="Movement">
          <li>Every piece moves like a rook: any number of empty squares up, down, or across.</li>
          <li>No piece jumps. No diagonal moves.</li>
          <li>
            Only the King may rest on the <b>throne</b> (centre) or a <b>corner</b>. Soldiers may
            pass over the empty throne but never stop on it.
          </li>
        </Section>

        <Section title="Capturing">
          <li>
            Trap an enemy soldier between two of your own pieces (or your piece and a hostile
            square) along a line — it is removed. You only capture by moving <em>into</em> the trap;
            moving between two enemies is safe.
          </li>
          <li>The corners and the empty throne are hostile squares that help you capture.</li>
          <li>Several pieces can be captured by a single move.</li>
          {!rules.armedKing && (
            <li className="text-blood">
              In this variant the King is <b>weaponless</b> — he can never help make a capture.
            </li>
          )}
        </Section>

        <Section title="Winning">
          <li>
            <b className="text-gold">Defenders win</b> if the King reaches any <b>corner</b>.
          </li>
          <li>
            <b className="text-blood">Attackers win</b> if they capture the King — surrounding him
            on two opposite sides in the open, or on all four sides when he sits on or beside the
            throne.
          </li>
          <li>A player with no legal move loses.</li>
          {rules.repetitionIsDraw && <li>A position repeated three times is a draw.</li>}
        </Section>

        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
          <div className="font-semibold text-gold">{rules.name}</div>
          <p className="mt-1 text-parchment-dim">{rules.blurb}</p>
        </div>

        <button className="btn btn-primary mt-5 w-full" onClick={onClose}>
          Play
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">{title}</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-parchment">{children}</ul>
    </div>
  );
}
