import { useEffect, useRef, useState } from "react";
import { fetchPracticeDays, type QuickDrillKind } from "../api";
import { Button } from "../ui/Button";

export type StartSelection =
  | { type: "quick"; drill: QuickDrillKind }
  | { type: "daily"; minutes: 60 | 30 }
  | { type: "free" }
  | { type: "library" };

const QUICK_BUTTONS: Array<{ drill: QuickDrillKind; icon: string; title: string; minutes: string }> = [
  { drill: "warmup", icon: "🔊", title: "音読ウォームアップ", minutes: "6分" },
  { drill: "ftt-mini", icon: "🗣", title: "4/3/2ミニ", minutes: "8分" },
  { drill: "roleplay", icon: "💼", title: "実務ロールプレイ", minutes: "10分" },
  { drill: "shadowing", icon: "🎧", title: "シャドーイング", minutes: "5分" },
];

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** ローカル日付の YYYY-MM-DD（カレンダー表示用） */
function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 直近8週（56日）の練習日カレンダー。実施日のドット表示のみ（情報的フィードバック — 演出・連続日数なし） */
function PracticeCalendar({ days }: { days: string[] }) {
  const set = new Set(days);
  const today = new Date();
  const cells: Array<{ ymd: string; done: boolean; isToday: boolean }> = [];
  for (let i = 55; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ymd = localYmd(d);
    cells.push({ ymd, done: set.has(ymd), isToday: i === 0 });
  }
  const last7 = cells.slice(-7).filter((c) => c.done).length;
  return (
    <div className="card">
      <div className="calendar-head">
        <h3>練習日</h3>
        <span className="text-sm text-muted">直近8週 ・ 今週 {last7}日</span>
      </div>
      <div className="dot-grid">
        {cells.map((c) => (
          <div key={c.ymd} title={c.ymd} className={`day${c.done ? " is-done" : ""}${c.isToday ? " is-today" : ""}`} />
        ))}
      </div>
    </div>
  );
}

export function StartScreen(props: { onSelect: (sel: StartSelection) => void }) {
  const [days, setDays] = useState<string[]>([]);
  const aliveRef = useRef(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      // カレンダーは補助情報 — 取得失敗でスタート画面を壊さない
      fetchPracticeDays().then((d) => { if (aliveRef.current) setDays(d); }).catch(() => {});
    }
    return () => { aliveRef.current = false; };
  }, []);

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日（${WEEKDAYS_JA[today.getDay()]}）`;

  return (
    <div className="stack">
      <div className="hero">
        <h2 className="hero-title">今日の練習</h2>
        <p className="hero-date">{dateLabel} ・ 短くても毎日が正解</p>
      </div>

      <div>
        <p className="section-label">クイックドリル（5〜10分）</p>
        <div className="drill-grid">
          {QUICK_BUTTONS.map((q) => (
            <button key={q.drill} className="drill-card" onClick={() => props.onSelect({ type: "quick", drill: q.drill })}>
              <span className="drill-icon" aria-hidden="true">{q.icon}</span>
              <span className="drill-body">
                <span className="drill-title">{q.title}</span>
                <span className="drill-min">{q.minutes}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="section-label">強化セッション <span className="section-note">週1〜2回おすすめ</span></p>
        <div className="start-row">
          <Button onClick={() => props.onSelect({ type: "daily", minutes: 60 })}>📋 通しセッション（60分）</Button>
          <Button onClick={() => props.onSelect({ type: "daily", minutes: 30 })}>📋 30分・短縮版</Button>
        </div>
      </div>

      <PracticeCalendar days={days} />
    </div>
  );
}
