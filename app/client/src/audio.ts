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
}

export async function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    // デコード失敗等で onended が発火しない場合に "speaking" のまま固まらないよう、
    // reject して呼び出し側（App.tsxの既存catch）にエラーを伝搬させ復帰させる
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("audio playback failed")); };
    audio.play().catch((err) => { URL.revokeObjectURL(url); reject(err instanceof Error ? err : new Error(String(err))); });
  });
  URL.revokeObjectURL(url);
}
