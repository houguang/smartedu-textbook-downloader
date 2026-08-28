export class DownloadCancelledError extends Error {
  constructor(message = "已取消下载") {
    super(message);
    this.name = "DownloadCancelledError";
  }
}

type Listener = () => void;

let paused = false;
let cancelled = false;
let abort = new AbortController();
let resumeWaiters: Array<() => void> = [];
const skipped = new Set<string>();
const itemAborts = new Map<string, AbortController>();
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function wakeWaiters(): void {
  const waiters = resumeWaiters;
  resumeWaiters = [];
  for (const waiter of waiters) waiter();
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export function isDownloadPaused(): boolean {
  return paused && !cancelled;
}

export function isDownloadCancelled(): boolean {
  return cancelled;
}

export function downloadSignal(): AbortSignal {
  return abort.signal;
}

export function onDownloadControlChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDownloadControl(): void {
  paused = false;
  cancelled = false;
  skipped.clear();
  for (const controller of itemAborts.values()) controller.abort();
  itemAborts.clear();
  wakeWaiters();
  abort = new AbortController();
  notify();
}

export function pauseDownload(): void {
  if (cancelled) return;
  paused = true;
  notify();
}

export function resumeDownload(): void {
  if (cancelled) return;
  paused = false;
  wakeWaiters();
  notify();
}

export function cancelAllDownloads(): void {
  cancelled = true;
  paused = false;
  abort.abort();
  for (const controller of itemAborts.values()) controller.abort();
  wakeWaiters();
  notify();
}

export function cancelDownloadItem(id: string): void {
  skipped.add(id);
  itemAborts.get(id)?.abort();
  wakeWaiters();
  notify();
}

export function isItemCancelled(id: string): boolean {
  return cancelled || skipped.has(id);
}

export function beginItem(id: string): AbortSignal {
  const controller = new AbortController();
  itemAborts.set(id, controller);
  return combineSignals([controller.signal, abort.signal]);
}

export function endItem(id: string): void {
  itemAborts.delete(id);
}

export async function checkpoint(itemId?: string): Promise<void> {
  while (true) {
    if (cancelled || (itemId && skipped.has(itemId))) {
      throw new DownloadCancelledError();
    }
    if (!paused) return;
    await new Promise<void>((resolve) => {
      resumeWaiters.push(resolve);
    });
  }
}

export function isCancelledError(error: unknown): boolean {
  if (error instanceof DownloadCancelledError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && (error.name === "AbortError" || error.message === "已取消下载")) return true;
  return false;
}
