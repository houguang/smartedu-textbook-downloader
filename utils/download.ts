import { fetchBinaryWithFallback, fetchTextbookDetail } from "./api";
import {
  beginItem,
  checkpoint,
  DownloadCancelledError,
  endItem,
  isCancelledError,
  isDownloadCancelled,
  isItemCancelled,
  resetDownloadControl,
} from "./download-control";
import { fetchBookLessons, fetchLessonDetail, fileMatchesTypes, lessonQueueId, parseLessonQueueId } from "./lesson";
import { bookFolderPath, buildDownloadPath, downloadBasename, folderFromDownloadPath, lessonFolderPath } from "./filename";
import type { RuntimeMessage } from "./messages";
import type { LessonDetail, LessonFile, QueueItem, Textbook, TokenCredentials } from "./types";

let keepAlivePort: { disconnect: () => void } | null = null;
let keepAliveCount = 0;

export function beginDownloadSession(): void {
  if (keepAliveCount === 0) resetDownloadControl();
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

function cancelledItem(item: QueueItem): QueueItem {
  return { ...item, status: "cancelled", error: undefined };
}

async function saveBuffer(buffer: ArrayBuffer | Uint8Array, filename: string, mime: string): Promise<number> {
  return enqueueSave(async () => {
    await checkpoint();
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
  const baseItem: QueueItem = {
    id: pdfItemId,
    bookId: book.id,
    title: book.title,
    kind: "pdf",
    filename: buildDownloadPath(book.title, "pdf", folder),
    status: "pending",
    progress: 0,
  };
  if (isItemCancelled(pdfItemId)) {
    onItem(cancelledItem(baseItem));
    return;
  }

  const signal = beginItem(pdfItemId);
  onItem({ ...baseItem, status: "running", progress: 0.02 });

  try {
    await checkpoint(pdfItemId);
    const detail = await fetchTextbookDetail(book.id, credentials, { bookmarks: addBookmarks });
    if (!detail.pdf) throw new Error("未找到教材 PDF");
    const pdfPath = buildDownloadPath(detail.title || book.title, guessExt(detail.pdf.format, "pdf"), folder);
    let buffer: ArrayBuffer | Uint8Array = await fetchBinaryWithFallback(
      [detail.pdf.url, ...detail.pdf.fallbackUrls],
      credentials,
      (ratio) => {
        onItem({
          ...baseItem,
          title: book.title,
          filename: pdfPath,
          status: "running",
          progress: 0.05 + ratio * 0.8,
        });
      },
      signal,
    );

    await checkpoint(pdfItemId);
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
      ...baseItem,
      title: detail.title || book.title,
      filename: pdfPath,
      status: "done",
      progress: 1,
      downloadId,
    });

    if (!downloadAudio || !detail.audios.length) return;

    for (const [index, audio] of detail.audios.entries()) {
      const audioId = `${book.id}-audio-${index}`;
      if (isItemCancelled(audioId) || isDownloadCancelled()) {
        onItem(
          cancelledItem({
            id: audioId,
            bookId: book.id,
            title: audio.title,
            kind: "audio",
            filename: buildDownloadPath(audio.title, guessExt(audio.format, "mp3"), folder),
            status: "pending",
            progress: 0,
          }),
        );
        continue;
      }
      const audioPath = buildDownloadPath(audio.title, guessExt(audio.format, "mp3"), folder);
      const audioItem: QueueItem = {
        id: audioId,
        bookId: book.id,
        title: audio.title,
        kind: "audio",
        filename: audioPath,
        status: "running",
        progress: 0,
      };
      onItem(audioItem);
      const audioSignal = beginItem(audioId);
      try {
        await checkpoint(audioId);
        const audioBuffer = await fetchBinaryWithFallback(
          [audio.url, ...audio.fallbackUrls],
          credentials,
          (ratio) => {
            onItem({ ...audioItem, status: "running", progress: ratio });
          },
          audioSignal,
        );
        const downloadId = await saveBuffer(audioBuffer, audioPath, "audio/mpeg");
        onItem({ ...audioItem, status: "done", progress: 1, downloadId });
      } catch (error) {
        onItem(
          isCancelledError(error) || isItemCancelled(audioId)
            ? cancelledItem(audioItem)
            : {
                ...audioItem,
                status: "error",
                progress: 0,
                error: error instanceof Error ? error.message : String(error),
              },
        );
      } finally {
        endItem(audioId);
      }
    }
  } catch (error) {
    onItem(
      isCancelledError(error) || isItemCancelled(pdfItemId)
        ? cancelledItem(baseItem)
        : {
            ...baseItem,
            status: "error",
            progress: 0,
            error: error instanceof Error ? error.message : String(error),
          },
    );
  } finally {
    endItem(pdfItemId);
  }
}

function pendingLessonItem(detail: LessonDetail, file: LessonFile, folder: string): QueueItem {
  const name = `${detail.title}-${file.alias || file.title}`;
  return {
    id: lessonQueueId(detail.id, file.id),
    bookId: detail.bookId || detail.id,
    title: name,
    kind: "lesson",
    filename: buildDownloadPath(name, "pdf", folder),
    status: "pending",
    progress: 0,
  };
}

export async function downloadLessonFile(
  detail: LessonDetail,
  file: LessonFile,
  credentials: TokenCredentials | null,
  onItem: (item: QueueItem) => void,
  folder = lessonFolderPath(detail),
): Promise<void> {
  const item = pendingLessonItem(detail, file, folder);
  if (isItemCancelled(item.id)) {
    onItem(cancelledItem(item));
    return;
  }
  const signal = beginItem(item.id);
  onItem({ ...item, status: "running", progress: 0.02 });
  try {
    await checkpoint(item.id);
    const buffer = await fetchBinaryWithFallback(
      [file.file.url, ...file.file.fallbackUrls],
      credentials,
      (ratio) => {
        onItem({ ...item, status: "running", progress: ratio });
      },
      signal,
    );
    await checkpoint(item.id);
    const downloadId = await saveBuffer(buffer, item.filename, "application/pdf");
    onItem({ ...item, status: "done", progress: 1, downloadId });
  } catch (error) {
    onItem(
      isCancelledError(error) || isItemCancelled(item.id)
        ? cancelledItem(item)
        : {
            ...item,
            status: "error",
            progress: 0,
            error: error instanceof Error ? error.message : String(error),
          },
    );
  } finally {
    endItem(item.id);
  }
}

export async function downloadLesson(
  detail: LessonDetail,
  credentials: TokenCredentials | null,
  onItem: (item: QueueItem) => void,
  folder = lessonFolderPath(detail),
): Promise<void> {
  if (!detail.files.length) return;
  await runPool(detail.files, 2, async (file) => {
    await downloadLessonFile(detail, file, credentials, onItem, folder);
  });
}

export async function retryLessonFile(
  item: QueueItem,
  credentials: TokenCredentials | null,
  onItem: (item: QueueItem) => void,
): Promise<void> {
  const parsed = parseLessonQueueId(item.id);
  if (!parsed) throw new Error("无法重试该课程文件");
  const detail = await fetchLessonDetail(parsed.activityId);
  const file = detail.files.find((entry) => entry.id === parsed.resourceId);
  if (!file) throw new Error("未找到该课程文件");
  await downloadLessonFile(detail, file, credentials, onItem, folderFromDownloadPath(item.filename));
}

export interface LessonDownloadTask {
  detail: LessonDetail;
  file: LessonFile;
  folder: string;
}

export function lessonTasksFromDetail(
  detail: LessonDetail,
  chapterTitles: string[] = [],
  types?: Set<string> | null,
): LessonDownloadTask[] {
  const folder = lessonFolderPath(detail, chapterTitles);
  const files = types == null ? detail.files : detail.files.filter((file) => fileMatchesTypes(file, types));
  return files.map((file) => ({ detail, file, folder }));
}

export function pendingItemsFromTasks(tasks: LessonDownloadTask[]): QueueItem[] {
  return tasks.map((task) => pendingLessonItem(task.detail, task.file, task.folder));
}

export async function collectLessonBookTasks(bookId: string): Promise<LessonDownloadTask[]> {
  const lessons = await fetchBookLessons(bookId);
  if (!lessons.length) throw new Error("该册没有国家课");
  const grouped = new Map<string, LessonDownloadTask[]>();
  const errors: string[] = [];
  await runPool(lessons, 3, async (lesson) => {
    try {
      await checkpoint();
      const detail = await fetchLessonDetail(lesson.id);
      grouped.set(lesson.id, lessonTasksFromDetail(detail, lesson.chapterTitles));
    } catch (error) {
      if (isCancelledError(error)) throw error;
      errors.push(`${lesson.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (isDownloadCancelled()) throw new DownloadCancelledError();
  const tasks = lessons.flatMap((lesson) => grouped.get(lesson.id) || []);
  if (!tasks.length) {
    throw new Error(errors[0] || "该册没有可下载的 PDF");
  }
  return tasks;
}

export async function downloadLessonTasks(
  tasks: LessonDownloadTask[],
  credentials: TokenCredentials | null,
  onItem: (item: QueueItem) => void,
): Promise<void> {
  await runPool(tasks, 2, async (task) => {
    await downloadLessonFile(task.detail, task.file, credentials, onItem, task.folder);
  });
}

export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      if (isDownloadCancelled()) return;
      try {
        await checkpoint();
      } catch {
        return;
      }
      if (isDownloadCancelled()) return;
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
