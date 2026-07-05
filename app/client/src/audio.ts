export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.mediaRecorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder;
      if (!mr) return reject(new Error("not recording"));
      mr.onstop = () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
      };
      mr.stop();
    });
  }

  /**
   * 画面離脱時などにマイクを即座に解放するための中断処理。録音中でなければ何もしない。
   * blob を resolve/reject せずに MediaRecorder とストリームトラックを止めるだけなので、
   * いつ呼んでも安全（冪等）。stop() のPromiseに結びついたハンドラは呼ばれないよう外す。
   */
  cancel(): void {
    const mr = this.mediaRecorder;
    if (!mr || mr.state === "inactive") return;
    mr.onstop = null;
    mr.ondataavailable = null;
    const stream = mr.stream;
    mr.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * 再生中の Audio 要素と、その playBlob() 呼び出しを待っている Promise の resolve を
 * ひと組で保持するレジストリ。stopPlayback() が「今何を止めるべきか」だけでなく
 * 「誰が待っているか」も分かるようにし、中断時に待ち手を解放できるようにする。
 */
type Playback = { audio: HTMLAudioElement; url: string; resolve: () => void };
let current: Playback | null = null;

export async function playBlob(blob: Blob): Promise<void> {
  stopPlayback();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      current = { audio, url, resolve };
      audio.onended = () => {
        current = null;
        resolve();
      };
      // デコード失敗等で onended が発火しない場合に "speaking" のまま固まらないよう、
      // reject して呼び出し側（App.tsxの既存catch）にエラーを伝搬させ復帰させる
      audio.onerror = () => {
        current = null;
        reject(new Error("audio playback failed"));
      };
      audio.play().catch((err) => {
        current = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  } finally {
    // 成功時・失敗時どちらでも url を解放しレジストリを掃除する（失敗時だけ登録が
    // 残って stopPlayback() が古い Audio を掴んだままになる不整合を防ぐ）
    URL.revokeObjectURL(url);
    if (current && current.audio === audio) {
      current = null;
    }
  }
}

/**
 * 画面離脱時・次の再生開始時などに再生中の音声を即座に止めるための中断処理。
 * 再生中でなければ何もしない（冪等）。
 *
 * 中断された playBlob() の Promise を resolve してから pause / revoke / レジストリ
 * クリアを行う（＝最後にボタンを押した操作が勝つ「last-click-wins」を「正常終了扱い」で
 * 表現する）。resolve せずに止めるだけだと、待っている側の await が二度と戻らず、
 * finally で戻すはずの UI 状態（例: 再生中インデックス）が固まってしまう。
 */
export function stopPlayback(): void {
  if (!current) return;
  const { audio, url, resolve } = current;
  current = null;
  audio.onended = null;
  audio.onerror = null;
  resolve();
  audio.pause();
  URL.revokeObjectURL(url);
}
