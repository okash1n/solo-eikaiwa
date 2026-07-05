import { useEffect, useRef, useState } from "react";
import { fetchPracticeDays, fetchSettings, saveSettings, type QuickDrillKind } from "../api";

export type StartSelection =
  | { type: "quick"; drill: QuickDrillKind }
  | { type: "daily"; minutes: 60 | 30 }
  | { type: "free" }
  | { type: "library" };

const QUICK_BUTTONS: Array<{ drill: QuickDrillKind; label: string }> = [
  { drill: "warmup", label: "🔊 音読ウォームアップ（6分）" },
  { drill: "ftt-mini", label: "🗣 4/3/2ミニ（8分・2ラウンド）" },
  { drill: "roleplay", label: "💼 実務ロールプレイ（10分）" },
  { drill: "shadowing", label: "🎧 シャドーイング（5分）" },
];

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
  return (
    <div>
      <h3 style={{ fontSize: "0.9rem", color: "#666" }}>練習日（直近8週）</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 14px)", gap: 3 }}>
        {cells.map((c) => (
          <div
            key={c.ymd}
            title={c.ymd}
            style={{
              width: 12, height: 12, borderRadius: 3,
              background: c.done ? "#2e7d32" : "#e0e0e0",
              outline: c.isToday ? "2px solid #666" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function StartScreen(props: { onSelect: (sel: StartSelection) => void }) {
  const [days, setDays] = useState<string[]>([]);
  const [anchor, setAnchor] = useState("");
  const [anchorDraft, setAnchorDraft] = useState("");
  const [editingAnchor, setEditingAnchor] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const aliveRef = useRef(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      // カレンダー/アンカーは補助情報 — 取得失敗でスタート画面を壊さない
      fetchPracticeDays().then((d) => { if (aliveRef.current) setDays(d); }).catch(() => {});
      fetchSettings().then((s) => {
        if (aliveRef.current) { setAnchor(s.anchor); setAnchorDraft(s.anchor); }
      }).catch(() => {});
    }
    return () => { aliveRef.current = false; };
  }, []);

  async function onSaveAnchor() {
    setSaveMsg("");
    try {
      await saveSettings({ anchor: anchorDraft });
      if (!aliveRef.current) return;
      setAnchor(anchorDraft);
      setEditingAnchor(false);
    } catch (err) {
      if (!aliveRef.current) return;
      setSaveMsg(err instanceof Error ? err.message : String(err));
    }
  }

  const btn = { display: "block", width: "100%", fontSize: "1.05rem", padding: "0.9rem", marginBottom: "0.6rem", cursor: "pointer", textAlign: "left" } as const;

  return (
    <div>
      <h3 style={{ fontSize: "1rem" }}>クイックドリル（5〜10分）</h3>
      {QUICK_BUTTONS.map((q) => (
        <button key={q.drill} style={btn} onClick={() => props.onSelect({ type: "quick", drill: q.drill })}>
          {q.label}
        </button>
      ))}
      <h3 style={{ fontSize: "1rem", marginTop: "1.2rem" }}>強化セッション（週1〜2回おすすめ）</h3>
      <button style={btn} onClick={() => props.onSelect({ type: "daily", minutes: 60 })}>📋 通しセッション（60分）</button>
      <button style={btn} onClick={() => props.onSelect({ type: "daily", minutes: 30 })}>📋 通しセッション（30分・短縮版）</button>
      <button style={btn} onClick={() => props.onSelect({ type: "free" })}>💬 自由会話のみ</button>
      <button style={btn} onClick={() => props.onSelect({ type: "library" })}>📚 ライブラリ（モデルトークの復習）</button>

      <div style={{ marginTop: "1.5rem" }}>
        <PracticeCalendar days={days} />
      </div>

      <div style={{ marginTop: "1rem", color: "#444" }}>
        {!editingAnchor && anchor && (
          <p>
            📌 {anchor}{" "}
            <button style={{ fontSize: "0.8rem", cursor: "pointer" }} onClick={() => setEditingAnchor(true)}>編集</button>
          </p>
        )}
        {!editingAnchor && !anchor && (
          <p style={{ color: "#888" }}>
            続けるコツ: 既にある日課に紐づけると忘れません（例: 朝コーヒーを淹れたら1ドリル）{" "}
            <button style={{ fontSize: "0.8rem", cursor: "pointer" }} onClick={() => setEditingAnchor(true)}>設定する</button>
          </p>
        )}
        {editingAnchor && (
          <p>
            <input
              value={anchorDraft}
              onChange={(e) => setAnchorDraft(e.target.value)}
              placeholder="朝コーヒーを淹れたら1ドリル"
              maxLength={200}
              style={{ width: "60%", padding: "0.4rem" }}
            />{" "}
            <button style={{ cursor: "pointer" }} onClick={onSaveAnchor}>保存</button>{" "}
            <button style={{ cursor: "pointer" }} onClick={() => { setEditingAnchor(false); setAnchorDraft(anchor); setSaveMsg(""); }}>やめる</button>
          </p>
        )}
        {saveMsg && <p style={{ color: "crimson" }}>{saveMsg}</p>}
      </div>
    </div>
  );
}
