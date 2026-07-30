import { useState } from "react";
import type { Translations } from "../i18n";
import type { RuleSet } from "../game/variants";

/**
 * The rules, rendered inside the Learn hub (see LearnModal.tsx): a condensed
 * quick version by default, with the original full, rules-reactive text one
 * tab away for those who want to define and refine things.
 */
export default function RulesContent({ rules, t }: { rules: RuleSet; t: Translations }) {
  const [view, setView] = useState<"quick" | "full">("quick");
  return (
    <div>
      <div className="seg mt-3">
        <button className={view === "quick" ? "on" : ""} onClick={() => setView("quick")}>
          {t.quickRulesTab}
        </button>
        <button className={view === "full" ? "on" : ""} onClick={() => setView("full")}>
          {t.fullRulesTab}
        </button>
      </div>
      {view === "quick" ? <QuickRules rules={rules} t={t} /> : <FullRules rules={rules} t={t} />}
    </div>
  );
}

function QuickRules({ rules, t }: { rules: RuleSet; t: Translations }) {
  return (
    <div className="mt-4 space-y-3 text-sm text-parchment">
      <p>
        <b className="text-gold">{t.kingsSide}</b> — {t.quickGoalKing}
      </p>
      <p>
        <b className="text-blood">{t.raiders}</b> — {t.quickGoalRaiders}
      </p>
      <hr className="border-white/10" />
      <p>{t.quickMovement}</p>
      <p>{t.quickCapture}</p>
      <p>{rules.strongKingOnThrone ? t.quickKingCaptureStrong : t.quickKingCaptureSimple}</p>
      <p>{t.quickSpecialSquares}</p>
    </div>
  );
}

function FullRules({ rules, t }: { rules: RuleSet; t: Translations }) {
  return (
    <div>
      <p className="mt-3 text-sm text-parchment-dim">
        {t.rulesIntro}
        <em>{t.rulesIntroNot}</em>
        {t.rulesIntroDifferent}
      </p>

      <Section title={t.sectionArmies}>
        <li>
          <b className="text-gold">{t.theKing}</b> {t.kingSitsOn} <b>{t.fourDefenders}</b>.{" "}
          {t.outnumbered}
        </li>
        <li>
          <b>{t.eightAttackers}</b> {t.attackersRing}
        </li>
      </Section>

      <Section title={t.sectionMovement}>
        <li>{t.movementRook}</li>
        <li>{t.movementNoJumps}</li>
        <li>
          {t.movementThroneOnly} <b>{t.throne}</b> {t.orA} <b>{t.corner}</b>
          {t.movementThronePass}
        </li>
      </Section>

      <Section title={t.sectionCapturing}>
        <li>
          {t.captureTrap1}
          <em>{t.captureInto}</em>
          {t.captureTrap2}
        </li>
        <li>{t.captureHostile}</li>
        <li>{t.captureMultiple}</li>
        {!rules.armedKing && (
          <li className="text-blood">
            {t.weaponlessPrefix}
            <b>{t.weaponless}</b>
            {t.weaponlessSuffix}
          </li>
        )}
      </Section>

      <Section title={t.sectionWinning}>
        <li>
          <b className="text-gold">{t.defendersWinLabel}</b> {t.defendersWinRule}{" "}
          <b>{t.corner}</b>.
        </li>
        <li>
          <b className="text-blood">{t.attackersWinLabel}</b> {t.attackersWinRule}
        </li>
        <li>{t.noMoveLoses}</li>
        {rules.encirclementWin && (
          <li>
            <b className="text-blood">{t.attackersWinLabel}</b> {t.encirclementWinRule}
          </li>
        )}
        {rules.repetitionResult === "draw" && <li>{t.repetitionDraw}</li>}
        {rules.repetitionResult === "loss_for_defenders" && (
          <li className="text-blood">{t.repetitionLossDefenders}</li>
        )}
      </Section>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
        <div className="font-semibold text-gold">{t.variantNames[rules.id] ?? rules.name}</div>
        <p className="mt-1 text-parchment-dim">{t.variantBlurbs[rules.id] ?? rules.blurb}</p>
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
