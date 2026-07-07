import { fetchFixExplanation, fetchReflection } from "../api";
import { useExplain } from "../useExplain";
import { useLoad } from "../useLoad";
import { STR, type Lang } from "../i18n";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/** 直したい表現1件。「もっと詳しく」で fetchFixExplanation を呼び、解説を自分の state に保持する */
function FixItem({ fix, lang }: { fix: { original: string; better: string }; lang: Lang }) {
  const t = STR[lang].reflection;
  const { state, request } = useExplain(() => fetchFixExplanation(fix.original, fix.better));
  return (
    <li>
      <s>{fix.original}</s> → <strong>{fix.better}</strong>
      {state.status === "idle" && <Button variant="ghost" onClick={request}>{t.explainMore}</Button>}
      {state.status === "loading" && <p className="text-sm text-muted">{t.explainLoading}</p>}
      {state.status === "error" && (
        <p className="text-sm text-muted">{t.explainError}<Button variant="ghost" onClick={request}>{t.retry}</Button></p>
      )}
      {state.status === "done" && <p className="sentence-explain text-sm">{state.text}</p>}
    </li>
  );
}

export function ReflectionScreen({ lang }: { lang: Lang }) {
  const t = STR[lang].reflection;
  const { state, reload } = useLoad(fetchReflection);

  if (state.status === "error") {
    return (
      <div>
        <Banner kind="error" action={<Button onClick={reload}>{t.retry}</Button>}>{state.error}</Banner>
      </div>
    );
  }
  if (state.status === "loading") return <p className="text-muted">{t.loading}</p>;

  const reflection = state.data;
  return (
    <div className="stack">
      {reflection.goodPhrases.length > 0 && (
        <Card header={<h3>{t.goodPhrases}</h3>}>
          <ul>{reflection.goodPhrases.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </Card>
      )}
      {reflection.fixes.length > 0 && (
        <Card header={<h3>{t.fixes}</h3>}>
          <ul>
            {reflection.fixes.map((f, i) => (
              <FixItem key={i} fix={f} lang={lang} />
            ))}
          </ul>
        </Card>
      )}
      <Card header={<h3>{t.tomorrow}</h3>}>
        <p>{reflection.noteForTomorrow_ja}</p>
      </Card>
    </div>
  );
}
