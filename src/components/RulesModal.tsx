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
          <h2 className="font-display text-2xl text-gold">Conas Brandubh a imirt</h2>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm text-parchment-dim">
          Is é Brandubh (&lsquo;fiach dubh&rsquo;) an leagan Gaelach 7×7 de hnefatafl — cluiche cogaidh Lochlannach-Gaelach neamhshiméadrach. <em>Ní</em> ficheall shiméadrach é: tá rudaí éagsúla uaidh ag an dá thaobh.
        </p>

        <Section title="Na sluaite">
          <li>
            <b className="text-gold">An Rí</b> ina shuí ar an ríchathaoir lár le <b>4 chosantóir</b>.
            Tá a thaobh faoi mhíbhuntáiste uimhreach.
          </li>
          <li>
            <b>8 bhfoghlaithe</b> (creachadóirí) timpeall na n-imeall. Bogann siad ar dtús.
          </li>
        </Section>

        <Section title="Gluaiseacht">
          <li>Bogann gach píosa mar chaiseal: aon líon cearnóg folamh suas, síos nó trasna.</li>
          <li>Ní léimeann aon phíosa. Ní cheadaítear bogadh trasnánach.</li>
          <li>
            Ní féidir ach leis an Rí fanacht ar an <b>ríchathaoir</b> (lár) nó <b>cúinne</b>. Féadann saighdiúirí dul thar an ríchathaoir fholamh ach ní féidir leo stopadh uirthi.
          </li>
        </Section>

        <Section title="Gabháil">
          <li>
            Cuir saighdiúir namhad i ngaiste idir dhá phíosa de do chuid féin (nó do phíosa agus cearnóg naimhdeach) ar líne — bainfear é. Ní ghabháiltear tú ach trí bhogadh <em>isteach</em> sa ghaiste; tá sé sábháilte bogadh idir dhá namhaid.
          </li>
          <li>Is cearnóga naimhdeacha iad na cúinní agus an ríchathaoir fholamh a chabhraíonn le gabháil.</li>
          <li>Is féidir roinnt píosaí a ghabháil le bogadh amháin.</li>
          {!rules.armedKing && (
            <li className="text-blood">
              Sa leagan seo tá an Rí <b>gan arm</b> — ní féidir leis cabhrú le gabháil riamh.
            </li>
          )}
        </Section>

        <Section title="Buachan">
          <li>
            <b className="text-gold">Cosantóirí a bhuann</b> má shroicheann an Rí aon <b>cúinne</b>.
          </li>
          <li>
            <b className="text-blood">Foghlaithe a bhuann</b> má ghabhann siad an Rí — á thimpeallú ar dhá thaobh os comhair a chéile san oscailt, nó ar na ceithre thaobh nuair atá sé ina shuí ar an ríchathaoir nó in aice léi.
          </li>
          <li>Cailleann imreoir gan bogadh dlíthiúil.</li>
          {rules.repetitionIsDraw && <li>Is cluiche cothrom é suíomh a thagann trí huaire.</li>}
        </Section>

        <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
          <div className="font-semibold text-gold">{rules.name}</div>
          <p className="mt-1 text-parchment-dim">{rules.blurb}</p>
        </div>

        <button className="btn btn-primary mt-5 w-full" onClick={onClose}>
          Imir
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
