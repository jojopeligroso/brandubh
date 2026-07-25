import type { Translations } from "../i18n";
import type { RuleSet } from "../game/variants";

export default function RulesModal({ rules, t, onClose }: { rules: RuleSet; t: Translations; onClose: () => void }) {
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
          <h2 className="font-display text-2xl text-gold">{t.rulesTitle}</h2>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm text-parchment-dim">
          {t.rulesIntro}<em>{t.rulesIntroNot}</em>{t.rulesIntroDifferent}
        </p>

        <Section title={t.sectionArmies}>
          <li>
            <b className="text-gold">{t.theKing}</b> {t.kingSitsOn} <b>{t.fourDefenders}</b>.
            {" "}{t.outnumbered}
          </li>
          <li>
            <b>{t.eightAttackers}</b> {t.attackersRing}
          </li>
        </Section>

        <Section title={t.sectionMovement}>
          <li>{t.movementRook}</li>
          <li>{t.movementNoJumps}</li>
          <li>
            {t.movementThroneOnly} <b>{t.throne}</b> {t.orA} <b>{t.corner}</b>{t.movementThronePass}
          </li>
        </Section>

        <Section title={t.sectionCapturing}>
          <li>
            {t.captureTrap1}<em>{t.captureInto}</em>{t.captureTrap2}
          </li>
          <li>{t.captureHostile}</li>
          <li>{t.captureMultiple}</li>
          {!rules.armedKing && (
            <li className="text-blood">
              {t.weaponlessPrefix}<b>{t.weaponless}</b>{t.weaponlessSuffix}
            </li>
          )}
        </Section>

        <Section title={t.sectionWinning}>
          <li>
            <b className="text-gold">{t.defendersWinLabel}</b> {t.defendersWinRule} <b>{t.corner}</b>.
          </li>
          <li>
            <b className="text-blood">{t.attackersWinLabel}</b> {t.attackersWinRule}
          </li>
          <li>{t.noMoveLoses}</li>
          {rules.repetitionIsDraw && <li>{t.repetitionDraw}</li>}
        </Section>

        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
          <div className="font-semibold text-gold">{t.variantNames[rules.id] ?? rules.name}</div>
          <p className="mt-1 text-parchment-dim">{t.variantBlurbs[rules.id] ?? rules.blurb}</p>
        </div>

        <button className="btn btn-primary mt-5 w-full" onClick={onClose}>
          {t.playButton}
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
