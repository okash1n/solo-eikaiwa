import { useEffect, useRef, useState } from "react";
import { fetchMetricsSummary, type MetricsSummary } from "../api";
import { STR, type Lang } from "../i18n";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type LoadState = "loading" | "ready" | "error";

function fmtMin(sec: number): string {
  return (sec / 60).toFixed(1);
}

/** 前週比の中立矢印（情報表示のみ — 良し悪しの色付けはしない） */
function trendArrow(cur: number, prev: number): string {
  if (prev === 0 || cur === 0) return "→";
  const diff = (cur - prev) / prev;
  if (diff > 0.05) return "↑";
  if (diff < -0.05) return "↓";
  return "→";
}

export function ProgressScreen({ lang }: { lang: Lang }) {
  const t = STR[lang].progress;
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const aliveRef = useRef(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load();
    }
    return () => { aliveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setState("loading");
    setErrorMsg("");
    try {
      const s = await fetchMetricsSummary(14);
      if (!aliveRef.current) return;
      setSummary(s);
      setState("ready");
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  if (state === "loading") return <p className="text-muted">{t.loading}</p>;
  if (state === "error" || !summary) {
    return <Banner kind="error" action={<Button onClick={load}>{t.retry}</Button>}>{errorMsg}</Banner>;
  }

  const days = summary.days;
  const hasData = days.some((d) => d.utterances > 0);
  if (!hasData) {
    return (
      <div className="stack">
        <h2 className="screen-title">{t.title}</h2>
        <Card><p className="text-muted">{t.empty}</p></Card>
      </div>
    );
  }

  const maxSec = Math.max(...days.map((d) => d.speakingSec), 1);
  const maxWpm = Math.max(...days.map((d) => d.avgArticulationWpm), 1);
  const spoken = days.filter((d) => d.utterances > 0);
  const lastWeek = spoken.filter((d) => d.ymd >= days[days.length - 7].ymd);
  const prevWeek = spoken.filter((d) => d.ymd < days[days.length - 7].ymd);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pauseCur = avg(lastWeek.map((d) => d.avgPauseRatio));
  const pausePrev = avg(prevWeek.map((d) => d.avgPauseRatio));
  const repCur = avg(lastWeek.map((d) => d.repetitionRatio));
  const repPrev = avg(prevWeek.map((d) => d.repetitionRatio));

  return (
    <div className="stack">
      <h2 className="screen-title">{t.title}</h2>

      <Card>
        <div className="card-header"><h3>{t.speakingTime}</h3></div>
        <div className="metric-bars">
          {days.map((d) => (
            <div key={d.ymd} className="metric-bar-col" title={`${d.ymd}: ${fmtMin(d.speakingSec)}${t.speakingMinUnit}`}>
              <div className="metric-bar" style={{ height: `${Math.round((d.speakingSec / maxSec) * 100)}%` }} />
              <span className="metric-bar-label">{Number(d.ymd.slice(8, 10))}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-header"><h3>{t.articulation}</h3></div>
        <div className="stack-sm">
          {days.filter((d) => d.utterances > 0).map((d) => (
            <div key={d.ymd} className="hbar-row">
              <span className="hbar-label">{d.ymd.slice(5)}</span>
              <div className="hbar-track">
                <div className="hbar" style={{ width: `${Math.round((d.avgArticulationWpm / maxWpm) * 100)}%` }} />
              </div>
              <span className="hbar-value">{d.avgArticulationWpm} {t.articulationUnit}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="metric-cards">
        <Card>
          <div className="stat-title">{t.pauseCard}</div>
          <div className="stat-main">{(pauseCur * 100).toFixed(1)}<span className="stat-unit">%</span></div>
          <div className="stat-sub">{trendArrow(pauseCur, pausePrev)} {t.weekOverWeek}</div>
        </Card>
        <Card>
          <div className="stat-title">{t.repetitionCard}</div>
          <div className="stat-main">{(repCur * 100).toFixed(1)}<span className="stat-unit">%</span></div>
          <div className="stat-sub">{trendArrow(repCur, repPrev)} {t.weekOverWeek}</div>
        </Card>
      </div>

      <Card>
        <div className="card-header"><h3>{t.levelHistory}</h3></div>
        <p className="text-sm text-muted">{t.currentLevel(summary.level.current)}</p>
        {summary.level.history.length > 0 && (
          <ul className="level-history">
            {summary.level.history.map((h) => (
              <li key={h.ymd}><span className="text-muted">{h.ymd}</span> → Lv {h.level}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
