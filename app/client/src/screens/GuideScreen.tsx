import { STR, type Lang } from "../i18n";
import { Card } from "../ui/Card";
import { type StartSelection } from "./StartScreen";

/**
 * 学習ガイド（#229 拡張4）: 1日の型・メニューの役割マップ（聞く→覚える→話す）・
 * レベル帯別のおすすめ・設計根拠の要約を情報として示す静的な画面。
 * binding制約: すべて提案・情報表示のみ — チェックリスト・達成管理・順序の強制は置かない。
 * メニュー名は nav / drills 辞書をそのまま参照し、サイドバーやホームの呼称とずれないようにする。
 */
export function GuideScreen({ lang, onSelect }: { lang: Lang; onSelect: (sel: StartSelection) => void }) {
  const t = STR[lang];
  const g = t.guide;

  const stages: Array<{
    key: string; label: string;
    items: Array<{ key: string; name: string; role: string; go: () => void }>;
  }> = [
    {
      key: "listen", label: g.stageListen,
      items: [
        { key: "listening", name: t.nav.listening, role: g.roleListening, go: () => onSelect({ type: "listening" }) },
        {
          key: "shadowing", name: t.drills.shadowing.title, role: g.roleShadowing,
          go: () => onSelect({ type: "session", source: { type: "quick", drill: "shadowing" } }),
        },
      ],
    },
    {
      key: "memorize", label: g.stageMemorize,
      items: [
        { key: "sentences", name: t.nav.sentences, role: g.roleSentences, go: () => onSelect({ type: "sentences" }) },
        { key: "my-phrases", name: g.myPhrasesName, role: g.roleMyPhrases, go: () => onSelect({ type: "sentences", tab: "browse" }) },
      ],
    },
    {
      key: "speak", label: g.stageSpeak,
      items: [
        {
          key: "warmup", name: t.drills.warmup.title, role: g.roleWarmup,
          go: () => onSelect({ type: "session", source: { type: "quick", drill: "warmup" } }),
        },
        {
          key: "ftt", name: t.drills["ftt-mini"].title, role: g.roleFtt,
          go: () => onSelect({ type: "session", source: { type: "quick", drill: "ftt-mini" } }),
        },
        {
          key: "roleplay", name: t.drills["roleplay-daily"].title, role: g.roleRoleplay,
          go: () => onSelect({ type: "session", source: { type: "quick", drill: "roleplay", domain: "daily" } }),
        },
        { key: "free", name: t.nav.free, role: g.roleFreeTalk, go: () => onSelect({ type: "free" }) },
      ],
    },
  ];

  const levels: Array<{ key: string; range: string; body: string }> = [
    { key: "beginner", range: g.levelBeginnerRange, body: g.levelBeginnerBody },
    { key: "intermediate", range: g.levelIntermediateRange, body: g.levelIntermediateBody },
    { key: "advanced", range: g.levelAdvancedRange, body: g.levelAdvancedBody },
  ];

  return (
    <div className="stack">
      <div className="hero">
        <h2 className="hero-title">{g.title}</h2>
        <p className="hero-date">{g.intro}</p>
      </div>

      <section aria-labelledby="guide-day-pattern">
        <h3 id="guide-day-pattern" className="guide-section-title">{g.dayPatternTitle}</h3>
        <Card>
          <p className="guide-pattern">{g.dayPatternBody}</p>
          <p className="text-sm text-muted">{g.dayPatternShort}</p>
        </Card>
      </section>

      <section aria-labelledby="guide-map">
        <h3 id="guide-map" className="guide-section-title">{g.mapTitle}</h3>
        <p className="text-sm text-muted">{g.mapIntro}</p>
        <div className="guide-map">
          {stages.map((stage, i) => (
            <div key={stage.key} className="guide-stage">
              <h4 className="guide-stage-title">
                {i > 0 && <span className="guide-stage-arrow" aria-hidden="true">↓ </span>}
                {stage.label}
              </h4>
              {stage.items.map((item) => (
                <button key={item.key} className="guide-row" onClick={item.go}>
                  <span className="drill-body">
                    <span className="drill-title">{item.name}</span>
                    <span className="drill-desc">{item.role}</span>
                  </span>
                  <span className="drill-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="guide-levels">
        <h3 id="guide-levels" className="guide-section-title">{g.levelsTitle}</h3>
        <Card>
          <ul className="guide-levels">
            {levels.map((level) => (
              <li key={level.key}>
                <span className="guide-level-range">{level.range}</span>
                <span className="guide-level-body">{level.body}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{g.levelsNote}</p>
        </Card>
      </section>

      <section aria-labelledby="guide-why">
        <h3 id="guide-why" className="guide-section-title">{g.whyTitle}</h3>
        <Card>
          <ul className="guide-why">
            {g.whyPoints.map((point, i) => (<li key={i}>{point}</li>))}
          </ul>
          {/* デスクトップでは #269 の on_navigation 委譲でシステムブラウザに開く */}
          <a
            href="https://github.com/btajp/solo-eikaiwa#学習設計の根拠"
            target="_blank" rel="noopener noreferrer"
          >
            {g.whyLinkLabel}
          </a>
        </Card>
      </section>
    </div>
  );
}
