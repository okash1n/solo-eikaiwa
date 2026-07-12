import { STR, type Lang } from "../../i18n";
import type { UiScale } from "../SettingsScreen";

type Props = {
  lang: Lang;
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
  switchLang: (lang: Lang) => void;
};

export function DisplaySettingsTab({ lang, uiScale, setUiScale, switchLang }: Props) {
  const s = STR[lang];
  const scales: UiScale[] = ["small", "medium", "large", "xlarge"];
  return (
    <section className="support-panel stack">
      <div className="stat-title">{s.settings.displaySection}</div>
      <div className="text-sm text-muted">{s.settings.displayImmediateNote}</div>
      <div className="lang-toggle" role="group" aria-label={s.appShell.textSize}>
        {scales.map((scale) => (
          <button key={scale} className={uiScale === scale ? "is-active" : ""} aria-pressed={uiScale === scale} onClick={() => setUiScale(scale)}>
            {s.uiScale[scale]}
          </button>
        ))}
      </div>
      <div className="lang-toggle" role="group" aria-label={s.appShell.language}>
        <button className={lang === "en" ? "is-active" : ""} aria-pressed={lang === "en"} onClick={() => switchLang("en")}>EN</button>
        <button className={lang === "ja" ? "is-active" : ""} aria-pressed={lang === "ja"} onClick={() => switchLang("ja")}>日本語</button>
      </div>
    </section>
  );
}
