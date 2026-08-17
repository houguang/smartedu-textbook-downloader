import { fetchBinaryWithFallback, fetchTextbookDetail } from "./api";
import { bookFolderPath, buildDownloadPath, downloadBasename } from "./filename";
import type { RuntimeMessage } from "./messages";
import type { QueueItem, Textbook, TokenCredentials } from "./types";

let keepAlivePort: { disconnect: () => void } | null = null;
let keepAliveCount = 0;

export function beginDownloadSession(): void {
  keepAliveCount += 1;
  if (!keepAlivePort) {
    keepAlivePort = browser.runtime.connect({ name: "download-keepalive" });
  }
}

export function endDownloadSession(): void {
  keepAliveCount = Math.max(0, keepAliveCount - 1);
  if (keepAliveCount === 0 && keepAlivePort) {
    keepAlivePort.disconnect();
    keepAlivePort = null;
  }
}

export interface DownloadRequest {
  book: Textbook;
  addBookmarks: boolean;
  downloadAudio: boolean;
}

function guessExt(format: string, fallback: string): string {
  const normalized = (format || fallback).toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("mp3")) return "mp3";
  return fallback;
}

let saveChain = Promise.resolve();

function enqueueSave<T>(task: () => Promise<T>): Promise<T> {
  const run = saveChain.then(task, task);
  saveChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function saveBuffer(buffer: ArrayBuffer | Uint8Array, filename: string, mime: string): Promise<number> {
  return enqueueSave(async () => {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const file = new File([bytes as BlobPart], downloadBasename(filename), { type: mime });
    const url = URL.createObjectURL(file);
    await browser.runtime.sendMessage({
      type: "REGISTER_DOWNLOAD_NAME",
      url,
      filename,
    } satisfies RuntimeMessage);
    try {
      return await browser.downloads.download({
        url,
        filename,
        saveAs: false,
        conflictAction: "uniquify",
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  });
}

export async function downloadTextbook(
  request: DownloadRequest,
  credentials: TokenCredentials | null,
  onItem: (item: QueueItem) => void,
): Promise<void> {
  const { book, addBookmarks, downloadAudio } = request;
  const folder = bookFolderPath(book);
  const pdfItemId = `${book.id}-pdf`;
  onItem({
    id: pdfItemId,
    bookId: book.id,
    title: book.title,
    kind: "pdf",
    filename: buildDownloadPath(book.title, "pdf", folder),
    status: "running",
    progress: 0.02,
  });

  try {
    const detail = await fetchTextbookDetail(book.id, credentials, { bookmarks: addBookmarks });
    if (!detail.pdf) throw new Error("未找到教材 PDF");
    const pdfPath = buildDownloadPath(detail.title || book.title, guessExt(detail.pdf.format, "pdf"), folder);
    let buffer: ArrayBuffer | Uint8Array = await fetchBinaryWithFallback(
      [detail.pdf.url, ...detail.pdf.fallbackUrls],
      credentials,
      (ratio) => {
        onItem({
          id: pdfItemId,
          bookId: book.id,
          title: book.title,
          kind: "pdf",
          filename: pdfPath,
          status: "running",
          progress: 0.05 + ratio * 0.8,
        });
      },
    );

    if (addBookmarks && detail.chapters.length) {
      try {
        const { injectOutlines } = await import("./bookmarks");
        buffer = await injectOutlines(buffer, detail.chapters);
      } catch {
        /* keep original pdf */
      }
    }

    const downloadId = await saveBuffer(buffer, pdfPath, "application/pdf");
    onItem({
      id: pdfItemId,
      bookId: book.id,
      title: detail.title || book.title,
      kind: "pdf",
      filename: pdfPath,
      status: "done",
      progress: 1,
      downloadId,
    });

    if (!downloadAudio || !detail.audios.length) return;

    for (const [index, audio] of detail.audios.entries()) {
      const audioId = `${book.id}-audio-${index}`;
      const audioPath = buildDownloadPath(audio.title, guessExt(audio.format, "mp3"), folder);
      onItem({
        id: audioId,
        bookId: book.id,
        title: audio.title,
        kind: "audio",
        filename: audioPath,
        status: "running",
        progress: 0,
      });
      try {
        const audioBuffer = await fetchBinaryWithFallback(
          [audio.url, ...audio.fallbackUrls],
          credentials,
          (ratio) => {
            onItem({
              id: audioId,
              bookId: book.id,
              title: audio.title,
              kind: "audio",
              filename: audioPath,
              status: "running",
              progress: ratio,
            });
          },
        );
        const downloadId = await saveBuffer(audioBuffer, audioPath, "audio/mpeg");
        onItem({
          id: audioId,
          bookId: book.id,
          title: audio.title,
          kind: "audio",
          filename: audioPath,
          status: "done",
          progress: 1,
          downloadId,
        });
      } catch (error) {
        onItem({
          id: audioId,
          bookId: book.id,
          title: audio.title,
          kind: "audio",
          filename: audioPath,
          status: "error",
          progress: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    onItem({
      id: pdfItemId,
      bookId: book.id,
      title: book.title,
      kind: "pdf",
      filename: buildDownloadPath(book.title, "pdf", folder),
      status: "error",
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
