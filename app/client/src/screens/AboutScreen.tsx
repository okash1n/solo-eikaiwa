import { STR, type Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const LP_URL = "https://btajp.github.io/solo-eikaiwa/#privacy";
const GITHUB_URL = "https://github.com/btajp/solo-eikaiwa";

/** アプリ概要とLP/GitHubへの外部リンクだけを示す小さな情報画面（判定・ノルマ演出は置かない） */
export function AboutScreen({ lang }: { lang: Lang }) {
  const t = STR[lang].about;
  return (
    <div className="stack">
      <div className="hero">
        <h2 className="hero-title">{t.title}</h2>
      </div>
      <Card>
        <div className="stack">
          <div className="app-brand"><span className="brand-mark" aria-hidden="true" />solo-eikaiwa</div>
          <p>{t.desc}</p>
          <div className="about-actions">
            <Button asChild variant="primary"><a href={LP_URL} target="_blank" rel="noopener noreferrer">{t.lpButton}</a></Button>
            <Button asChild variant="secondary"><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">{t.githubButton}</a></Button>
          </div>
          <p className="text-sm text-muted">{t.license}</p>
        </div>
      </Card>
    </div>
  );
}
