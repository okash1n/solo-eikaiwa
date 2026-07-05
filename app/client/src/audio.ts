export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
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
  await audio.play();
  await new Promise<void>((resolve) => { audio.onended = () => resolve(); });
  URL.revokeObjectURL(url);
}
