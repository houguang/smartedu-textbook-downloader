<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import BookCard from "../../components/BookCard.vue";
import DownloadQueue from "../../components/DownloadQueue.vue";
import FilterGroup from "../../components/FilterGroup.vue";
import LessonBookView from "../../components/LessonBookView.vue";
import { fetchPdfViewUrl } from "../../utils/api";
import { isLoggedIn } from "../../utils/auth";
import {
  applyDefaultTag,
  applyPreferredFilters,
  applyPreferredLessonFilters,
  availableTags,
  bookMatches,
  classroomDefaultTag,
  emptyFilters,
  fetchCatalog,
  fetchLessonCatalog,
  pruneFilters,
} from "../../utils/catalog";
import {
  beginDownloadSession,
  collectLessonBookTasks,
  downloadLessonTasks,
  downloadTextbook,
  endDownloadSession,
  lessonTasksFromDetail,
  pendingItemsFromTasks,
  retryLessonFile,
  runPool,
  type LessonDownloadTask,
} from "../../utils/download";
import {
  cancelAllDownloads,
  cancelDownloadItem,
  isCancelledError,
  isDownloadCancelled,
  isDownloadPaused,
  onDownloadControlChange,
  pauseDownload,
  resumeDownload,
} from "../../utils/download-control";
import { bookFolderPath, buildDownloadPath } from "../../utils/filename";
import { fetchLessonDetail, fetchBookOutline, parseLessonQueueId, collectDownloadableTypes, countMatchingFiles } from "../../utils/lesson";
import {
  loadCredentials,
  loadDefaultTag,
  loadSettings,
  onStorageChanged,
  saveSettings,
} from "../../utils/storage";
import {
  AUTH_URL,
  CLASSROOM_URL,
  DIMENSIONS,
  LOGIN_URL,
  type BookOutline,
  type QueueItem,
  type Textbook,
  type TokenCredentials,
} from "../../utils/types";

const activeTab = ref<"textbook" | "lesson">("textbook");
const loading = ref(true);
const lessonLoading = ref(true);
const textbookError = ref("");
const lessonError = ref("");
const actionError = ref("");
const books = ref<Textbook[]>([]);
const lessonBooks = ref<Textbook[]>([]);
const filters = reactive(emptyFilters());
const lessonFilters = reactive(emptyFilters());
const selectedIds = ref(new Set<string>());
const lessonSelectedIds = ref(new Set<string>());
const credentials = ref<TokenCredentials | null>(null);
const addBookmarks = ref(false);
const downloadAudio = ref(false);
const queue = ref<QueueItem[]>([]);
const batchItemIds = ref<string[]>([]);
const busy = ref(false);
const paused = ref(false);
const showLoginDialog = ref(false);
const copied = ref(false);
const viewingId = ref<string | null>(null);
const openedBook = ref<Textbook | null>(null);
const bookOutline = ref<BookOutline | null>(null);
const outlineLoading = ref(false);
const outlineError = ref("");
const selectedLessonIds = ref(new Set<string>());
const selectedResourceTypes = ref(new Set<string>());
const outlineCache = new Map<string, BookOutline>();

const isLessonTab = computed(() => activeTab.value === "lesson");
const catalogError = computed(() => (isLessonTab.value ? lessonError.value : textbookError.value));
const catalogBooks = computed(() => (isLessonTab.value ? lessonBooks.value : books.value));
const catalogLoading = computed(() => (isLessonTab.value ? lessonLoading.value : loading.value));
const currentFilters = computed(() => (isLessonTab.value ? lessonFilters : filters));
const visibleBooks = computed(() => catalogBooks.value.filter((book) => bookMatches(book, currentFilters.value)));
const currentSelectedIds = computed(() => (isLessonTab.value ? lessonSelectedIds.value : selectedIds.value));
const selectedBooks = computed(() => visibleBooks.value.filter((book) => currentSelectedIds.value.has(book.id)));
const loggedIn = computed(() => isLoggedIn(credentials.value));

const stageTags = computed(() => availableTags(catalogBooks.value, currentFilters.value, DIMENSIONS.stage));
const gradeTags = computed(() => availableTags(catalogBooks.value, currentFilters.value, DIMENSIONS.grade));
const subjectTags = computed(() => availableTags(catalogBooks.value, currentFilters.value, DIMENSIONS.subject));
const editionTags = computed(() => availableTags(catalogBooks.value, currentFilters.value, DIMENSIONS.edition));
const volumeTags = computed(() => availableTags(catalogBooks.value, currentFilters.value, DIMENSIONS.volume));
const oldNewTags = computed(() => availableTags(lessonBooks.value, lessonFilters, DIMENSIONS.oldNew));
const showingBookResources = computed(() => isLessonTab.value && Boolean(openedBook.value));
const outlineLessons = computed(() => bookOutline.value?.units.flatMap((unit) => unit.lessons) || []);
const selectedOutlineLessons = computed(() =>
  outlineLessons.value.filter((lesson) => selectedLessonIds.value.has(lesson.id)),
);
const selectedUnitCount = computed(
  () => bookOutline.value?.units.filter((unit) => unit.lessons.some((lesson) => selectedLessonIds.value.has(lesson.id))).length || 0,
);

const selectedLessonPdfCount = computed(() => {
  if (!bookOutline.value) return 0;
  const types = selectedResourceTypes.value;
  return bookOutline.value.units.reduce((sum, unit) => {
    return (
      sum +
      unit.lessons
        .filter((lesson) => selectedLessonIds.value.has(lesson.id))
        .reduce((inner, lesson) => inner + countMatchingFiles(lesson, types), 0)
    );
  }, 0);
});

function queueItemById(id: string): QueueItem | undefined {
  return queue.value.find((item) => item.id === id);
}

function itemProgress(id: string): number {
  const item = queueItemById(id);
  if (!item) return 0;
  if (item.status === "done" || item.status === "error" || item.status === "cancelled") return 1;
  return Math.max(0, Math.min(1, item.progress));
}

const queueStats = computed(() => {
  const ids = batchItemIds.value.length
    ? batchItemIds.value
    : queue.value.filter((item) => item.kind !== "audio").map((item) => item.id);
  const total = ids.length;
  const done = ids.filter((id) => queueItemById(id)?.status === "done").length;
  const failed = ids.filter((id) => queueItemById(id)?.status === "error").length;
  const cancelled = ids.filter((id) => queueItemById(id)?.status === "cancelled").length;
  const weighted = ids.reduce((sum, id) => sum + itemProgress(id), 0);
  const percent = total ? Math.round((weighted / total) * 100) : 0;
  return { total, done, failed, cancelled, percent };
});

watch(
  () => [filters.stage, filters.subject, filters.edition, filters.grade],
  () => {
    pruneFilters(books.value, filters);
  },
);

watch(
  () => [lessonFilters.stage, lessonFilters.subject, lessonFilters.edition, lessonFilters.grade, lessonFilters.volume, lessonFilters.oldNew],
  () => {
    pruneFilters(lessonBooks.value, lessonFilters);
    if (!openedBook.value) return;
    const visible = lessonBooks.value.filter((book) => bookMatches(book, lessonFilters));
    if (!visible.some((book) => book.id === openedBook.value?.id)) closeLessonBook();
  },
);

function toggleSelect(id: string) {
  const source = isLessonTab.value ? lessonSelectedIds.value : selectedIds.value;
  const next = new Set(source);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  if (isLessonTab.value) lessonSelectedIds.value = next;
  else selectedIds.value = next;
}

function selectAllVisible() {
  const ids = new Set(visibleBooks.value.map((book) => book.id));
  if (isLessonTab.value) lessonSelectedIds.value = ids;
  else selectedIds.value = ids;
}

function clearSelected() {
  if (isLessonTab.value) lessonSelectedIds.value = new Set();
  else selectedIds.value = new Set();
}

function closeLessonBook() {
  openedBook.value = null;
  bookOutline.value = null;
  outlineError.value = "";
  outlineLoading.value = false;
  selectedLessonIds.value = new Set();
  selectedResourceTypes.value = new Set();
}

function initResourceTypes(outline: BookOutline) {
  selectedResourceTypes.value = new Set(collectDownloadableTypes(outline));
}

async function openLessonBookView(book: Textbook) {
  openedBook.value = book;
  selectedLessonIds.value = new Set();
  const cached = outlineCache.get(book.id);
  if (cached) {
    bookOutline.value = cached;
    initResourceTypes(cached);
    outlineError.value = "";
    outlineLoading.value = false;
    return;
  }
  bookOutline.value = null;
  outlineError.value = "";
  outlineLoading.value = true;
  try {
    const outline = await fetchBookOutline(book.id);
    outlineCache.set(book.id, outline);
    if (openedBook.value?.id !== book.id) return;
    bookOutline.value = outline;
    initResourceTypes(outline);
  } catch (err) {
    if (openedBook.value?.id !== book.id) return;
    outlineError.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (openedBook.value?.id === book.id) outlineLoading.value = false;
  }
}

function onSelectedLessonIds(value: Set<string>) {
  selectedLessonIds.value = value;
}

function onSelectedTypes(value: Set<string>) {
  selectedResourceTypes.value = value;
}

function markIncompleteCancelled() {
  queue.value = queue.value.map((item) =>
    item.status === "pending" || item.status === "running"
      ? { ...item, status: "cancelled" as const, error: undefined }
      : item,
  );
}

function pauseDownloads() {
  pauseDownload();
  paused.value = true;
}

function resumeDownloads() {
  resumeDownload();
  paused.value = false;
}

function cancelDownloads() {
  cancelAllDownloads();
  paused.value = false;
  markIncompleteCancelled();
}

function cancelQueueItem(item: QueueItem) {
  if (item.status !== "pending" && item.status !== "running") return;
  cancelDownloadItem(item.id);
  upsertQueue({ ...item, status: "cancelled", error: undefined });
}

function clearQueue() {
  queue.value = [];
  batchItemIds.value = [];
}

function upsertQueue(item: QueueItem) {
  const index = queue.value.findIndex((entry) => entry.id === item.id);
  if (index === -1) queue.value = [item, ...queue.value];
  else queue.value.splice(index, 1, item);
}

function enqueueBatch(items: QueueItem[]) {
  const ids = new Set(items.map((item) => item.id));
  batchItemIds.value = items.map((item) => item.id);
  queue.value = [...items, ...queue.value.filter((item) => !ids.has(item.id))];
}

function requireLogin(): boolean {
  if (loggedIn.value) return true;
  actionError.value = "请先登录智慧教育平台，再回来下载。";
  return false;
}

async function refreshAuth() {
  credentials.value = await loadCredentials();
}

async function loadData(savedTag: string | null) {
  loading.value = true;
  textbookError.value = "";
  try {
    const catalog = await fetchCatalog();
    books.value = catalog.books;
    Object.assign(filters, applyDefaultTag(savedTag, catalog.tagMap, applyPreferredFilters(catalog.books, catalog.tagMap, emptyFilters())));
    filters.oldNew = null;
    pruneFilters(books.value, filters);
  } catch (err) {
    textbookError.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadLessonData(savedTag: string | null) {
  lessonLoading.value = true;
  lessonError.value = "";
  try {
    const catalog = await fetchLessonCatalog();
    lessonBooks.value = catalog.books;
    Object.assign(
      lessonFilters,
      applyDefaultTag(
        savedTag,
        catalog.tagMap,
        applyPreferredLessonFilters(catalog.books, catalog.tagMap, emptyFilters()),
      ),
    );
    pruneFilters(lessonBooks.value, lessonFilters);
  } catch (err) {
    lessonError.value = err instanceof Error ? err.message : String(err);
  } finally {
    lessonLoading.value = false;
  }
}

function finishDownloadSession() {
  endDownloadSession();
  busy.value = false;
  paused.value = false;
}

async function startDownload(targets: Textbook[]) {
  if (!targets.length) return;
  if (!requireLogin()) return;
  busy.value = true;
  paused.value = false;
  actionError.value = "";
  enqueueBatch(
    targets.map((book) => ({
      id: `${book.id}-pdf`,
      bookId: book.id,
      title: book.title,
      kind: "pdf" as const,
      filename: buildDownloadPath(book.title, "pdf", bookFolderPath(book)),
      status: "pending" as const,
      progress: 0,
    })),
  );
  beginDownloadSession();
  try {
    await runPool(targets, 2, async (book) => {
      await downloadTextbook(
        { book, addBookmarks: addBookmarks.value, downloadAudio: downloadAudio.value },
        credentials.value,
        upsertQueue,
      );
    });
  } catch (err) {
    if (!isCancelledError(err)) actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    finishDownloadSession();
  }
}

async function runLessonTasks(tasks: LessonDownloadTask[], extraItems: QueueItem[] = []) {
  const items = [...pendingItemsFromTasks(tasks), ...extraItems];
  if (!items.length) throw new Error("没有可下载的 PDF");
  enqueueBatch(items);
  await downloadLessonTasks(tasks, credentials.value, upsertQueue);
}

async function downloadSelectedUnits() {
  if (!selectedOutlineLessons.value.length) return;
  if (!requireLogin()) return;
  const types = selectedResourceTypes.value;
  const tasks = (bookOutline.value?.units || []).flatMap((unit) => {
    return unit.lessons.flatMap((lesson) => {
      if (!selectedLessonIds.value.has(lesson.id) || !lesson.detail) return [];
      return lessonTasksFromDetail(lesson.detail, lesson.chapterTitles, types);
    });
  });
  if (!tasks.length) {
    actionError.value = "已选课时在当前类型下没有可下载的 PDF。";
    return;
  }
  busy.value = true;
  paused.value = false;
  actionError.value = "";
  beginDownloadSession();
  try {
    await runLessonTasks(tasks);
  } catch (err) {
    if (!isCancelledError(err)) actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    finishDownloadSession();
  }
}

async function downloadSelectedLessonBooks() {
  const targets = selectedBooks.value;
  if (!targets.length) return;
  if (!requireLogin()) return;
  busy.value = true;
  paused.value = false;
  actionError.value = "";
  beginDownloadSession();
  try {
    const grouped = new Map<string, LessonDownloadTask[]>();
    const errors: string[] = [];
    await runPool(targets, 2, async (book) => {
      try {
        grouped.set(book.id, await collectLessonBookTasks(book.id));
      } catch (err) {
        if (isCancelledError(err)) throw err;
        errors.push(`${book.title}：${err instanceof Error ? err.message : String(err)}`);
      }
    });
    if (isDownloadCancelled()) return;
    const tasks = targets.flatMap((book) => grouped.get(book.id) || []);
    if (!tasks.length) throw new Error(errors[0] || "没有可下载的 PDF");
    await runLessonTasks(tasks);
    if (errors.length) actionError.value = `部分课程解析失败：${errors.join("；")}`;
  } catch (err) {
    if (!isCancelledError(err)) actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    finishDownloadSession();
  }
}

function startHeaderDownload() {
  if (showingBookResources.value) void downloadSelectedUnits();
  else if (isLessonTab.value) void downloadSelectedLessonBooks();
  else void startDownload(selectedBooks.value);
}

async function retryItem(item: QueueItem) {
  if (item.kind === "lesson") {
    if (!requireLogin()) return;
    const parsed = parseLessonQueueId(item.id);
    busy.value = true;
    paused.value = false;
    actionError.value = "";
    beginDownloadSession();
    try {
      if (parsed && (parsed.resourceId === "error" || parsed.resourceId === "empty")) {
        const detail = await fetchLessonDetail(parsed.activityId);
        const tasks = lessonTasksFromDetail(detail);
        if (!tasks.length) throw new Error("该课没有可下载的 PDF");
        await runLessonTasks(tasks);
        return;
      }
      batchItemIds.value = [item.id];
      await retryLessonFile(item, credentials.value, upsertQueue);
    } catch (err) {
      if (!isCancelledError(err)) actionError.value = err instanceof Error ? err.message : String(err);
    } finally {
      finishDownloadSession();
    }
    return;
  }
  const book = books.value.find((entry) => entry.id === item.bookId);
  if (book) await startDownload([book]);
}

async function persistSettings() {
  await saveSettings({
    addBookmarks: addBookmarks.value,
    downloadAudio: downloadAudio.value,
  });
}

function openLogin() {
  void browser.tabs.create({ url: AUTH_URL });
}

function openPlatform() {
  void browser.tabs.create({ url: isLessonTab.value ? CLASSROOM_URL : LOGIN_URL });
}

function onAuthBadgeClick() {
  if (!loggedIn.value) showLoginDialog.value = true;
}

async function copyLoginUrl() {
  try {
    await navigator.clipboard.writeText(AUTH_URL);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    copied.value = false;
  }
}

async function openOnline(book: Textbook) {
  if (isLessonTab.value) {
    const tag = classroomDefaultTag(book);
    const url = tag ? `${CLASSROOM_URL}?defaultTag=${tag}` : CLASSROOM_URL;
    await browser.tabs.create({ url });
    return;
  }
  if (!loggedIn.value) {
    showLoginDialog.value = true;
    return;
  }
  viewingId.value = book.id;
  actionError.value = "";
  try {
    const url = await fetchPdfViewUrl(book.id, credentials.value);
    await browser.tabs.create({ url });
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    viewingId.value = null;
  }
}

function showFolder() {
  const done = queue.value.find((item) => item.status === "done" && item.downloadId != null);
  if (done?.downloadId != null) {
    try {
      const shown = browser.downloads.show(done.downloadId) as void | Promise<void>;
      void Promise.resolve(shown).catch(() => {
        browser.downloads.showDefaultFolder();
      });
    } catch {
      browser.downloads.showDefaultFolder();
    }
    return;
  }
  browser.downloads.showDefaultFolder();
}

let stopWatch: (() => void) | undefined;
let stopControl: (() => void) | undefined;

onMounted(async () => {
  const settings = await loadSettings();
  addBookmarks.value = settings.addBookmarks;
  downloadAudio.value = settings.downloadAudio;
  await refreshAuth();
  const savedTag = await loadDefaultTag();
  await Promise.all([loadData(savedTag), loadLessonData(savedTag)]);
  stopWatch = onStorageChanged(() => {
    void refreshAuth();
  });
  stopControl = onDownloadControlChange(() => {
    paused.value = isDownloadPaused();
  });
});

onUnmounted(() => {
  stopWatch?.();
  stopControl?.();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-slate-50 text-base text-slate-900">
    <header class="flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-3.5">
      <img
        class="h-11 w-11 shrink-0 rounded-xl shadow-sm ring-1 ring-slate-200"
        src="/icon/128.png"
        width="44"
        height="44"
        alt=""
      />
      <div class="min-w-0">
        <h1 class="text-lg font-semibold">智慧教育平台教材下载</h1>
        <p class="text-sm text-slate-500">仅供个人学习与教学参考，请勿商用或二次分发</p>
      </div>
      <div class="ml-auto flex items-center justify-end gap-3">
        <label v-if="!isLessonTab" class="flex items-center gap-1.5 text-sm text-slate-600">
          <input v-model="addBookmarks" class="h-4 w-4 accent-blue-600" type="checkbox" @change="persistSettings" />
          PDF 书签
        </label>
        <label v-if="!isLessonTab" class="flex items-center gap-1.5 text-sm text-slate-600">
          <input v-model="downloadAudio" class="h-4 w-4 accent-blue-600" type="checkbox" @change="persistSettings" />
          配套音频
        </label>
        <template v-if="busy">
          <span class="rounded-lg bg-slate-100 px-4 py-2 text-base font-medium text-slate-700">
            {{
              queueStats.total
                ? `${paused ? "已暂停" : "下载中"} ${queueStats.done}/${queueStats.total}（${queueStats.percent}%）`
                : "正在解析…"
            }}
          </span>
          <button
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            type="button"
            @click="paused ? resumeDownloads() : pauseDownloads()"
          >
            {{ paused ? "继续" : "暂停" }}
          </button>
          <button
            class="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            type="button"
            @click="cancelDownloads"
          >
            取消
          </button>
        </template>
        <button
          v-else
          class="rounded-lg bg-blue-600 px-4 py-2 text-base font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          type="button"
          :disabled="showingBookResources ? !selectedLessonPdfCount : !selectedBooks.length"
          @click="startHeaderDownload"
        >
          {{
            showingBookResources
              ? `下载已选单元 (${selectedUnitCount})`
              : `下载已选 (${selectedBooks.length})`
          }}
        </button>
        <button
          class="rounded-full px-2.5 py-1 text-sm"
          :class="loggedIn ? 'bg-emerald-50 text-emerald-700' : 'cursor-pointer bg-amber-50 text-amber-700 hover:bg-amber-100'"
          type="button"
          @click="onAuthBadgeClick"
        >
          {{ loggedIn ? "已登录" : "未登录" }}
        </button>
      </div>
    </header>

    <div v-if="!loggedIn" class="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-base text-amber-800">
      <p>下载 PDF 需要登录国家中小学智慧教育平台。请先在浏览器中登录，本扩展会自动读取登录凭据。</p>
      <div class="flex gap-2">
        <button class="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-amber-300" type="button" @click="openLogin">
          去登录
        </button>
        <button class="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-amber-300" type="button" @click="openPlatform">
          打开平台
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1">
      <div class="flex min-h-0 shrink-0 border-r border-slate-200 bg-white">
        <nav class="flex w-14 shrink-0 flex-col items-stretch gap-1 bg-slate-800 px-1 py-3">
          <button
            class="flex flex-col items-center gap-1 rounded-md px-0.5 py-2 text-[11px] font-medium leading-tight"
            :class="!isLessonTab ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'"
            type="button"
            @click="activeTab = 'textbook'"
          >
            <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span class="w-[2em] text-center">教材</span>
          </button>
          <button
            class="flex flex-col items-center gap-1 rounded-md px-0.5 py-2 text-[11px] font-medium leading-tight"
            :class="isLessonTab ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'"
            type="button"
            @click="activeTab = 'lesson'"
          >
            <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
            <span class="w-[2em] text-center">课程教学</span>
          </button>
        </nav>
        <aside class="w-72 space-y-6 overflow-y-auto px-4 py-5">
          <FilterGroup v-if="!isLessonTab" v-model="filters.stage" title="学段" :tags="stageTags" />
          <FilterGroup v-else v-model="lessonFilters.stage" title="学段" :tags="stageTags" />
          <FilterGroup v-if="!isLessonTab" v-model="filters.subject" title="学科" :tags="subjectTags" />
          <FilterGroup v-else v-model="lessonFilters.subject" title="学科" :tags="subjectTags" />
          <FilterGroup v-if="!isLessonTab" v-model="filters.edition" title="版本" :tags="editionTags" />
          <FilterGroup v-else v-model="lessonFilters.edition" title="版本" :tags="editionTags" />
          <FilterGroup v-if="!isLessonTab" v-model="filters.grade" title="年级" :tags="gradeTags" />
          <FilterGroup v-else v-model="lessonFilters.grade" title="年级" :tags="gradeTags" />
          <FilterGroup v-if="!isLessonTab" v-model="filters.volume" title="册次" :tags="volumeTags" />
          <FilterGroup v-else v-model="lessonFilters.volume" title="册次" :tags="volumeTags" />
          <FilterGroup v-if="isLessonTab" v-model="lessonFilters.oldNew" title="新旧教材" :tags="oldNewTags" />
        </aside>
      </div>

      <main class="flex min-w-0 flex-1 flex-col">
        <p v-if="actionError" class="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{{ actionError }}</p>
        <LessonBookView
          v-if="openedBook && isLessonTab"
          :book="openedBook"
          :outline="bookOutline"
          :loading="outlineLoading"
          :error="outlineError"
          :selected-lesson-ids="selectedLessonIds"
          :selected-types="selectedResourceTypes"
          @back="closeLessonBook"
          @view="openOnline(openedBook)"
          @update:selected-lesson-ids="onSelectedLessonIds"
          @update:selected-types="onSelectedTypes"
        />
        <template v-else>
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <p class="text-base text-slate-600">
              当前 <span class="font-medium text-slate-900">{{ visibleBooks.length }}</span> 册
              · 已选 <span class="font-medium text-slate-900">{{ selectedBooks.length }}</span>
            </p>
            <div class="flex gap-2">
              <button class="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" type="button" @click="selectAllVisible">
                全选当前
              </button>
              <button class="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" type="button" @click="clearSelected">
                取消选择
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <p v-if="catalogLoading" class="py-20 text-center text-base text-slate-500">
              {{ isLessonTab ? "正在加载课程教学目录…" : "正在加载教材目录…" }}
            </p>
            <p v-else-if="catalogError" class="py-20 text-center text-base text-red-600">{{ catalogError }}</p>
            <p v-else-if="!visibleBooks.length" class="py-20 text-center text-base text-slate-500">
              {{ isLessonTab ? "没有符合筛选条件的课程教材" : "没有符合筛选条件的教材" }}
            </p>
            <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              <BookCard
                v-for="book in visibleBooks"
                :key="book.id"
                :book="book"
                :selected="currentSelectedIds.has(book.id)"
                :viewing="viewingId === book.id"
                :openable="isLessonTab"
                @toggle="toggleSelect(book.id)"
                @view="openOnline(book)"
                @open="openLessonBookView(book)"
              />
            </div>
          </div>
        </template>
      </main>

      <DownloadQueue
        :items="queue"
        :busy="busy"
        :paused="paused"
        :stats="queueStats"
        @retry="retryItem"
        @clear="clearQueue"
        @show-folder="showFolder"
        @pause="pauseDownloads"
        @resume="resumeDownloads"
        @cancel="cancelDownloads"
        @cancel-item="cancelQueueItem"
      />
    </div>
  </div>

  <div
    v-if="showLoginDialog"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    @click.self="showLoginDialog = false"
  >
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-semibold text-slate-900">需要先登录才能下载</h2>
      <p class="mt-2 text-base leading-relaxed text-slate-600">
        请在浏览器中打开以下网址，登录国家中小学智慧教育平台。登录成功后回到本页，扩展会自动读取登录凭据。
      </p>
      <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p class="break-all font-mono text-sm text-slate-800">{{ AUTH_URL }}</p>
      </div>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button
          class="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          type="button"
          @click="showLoginDialog = false"
        >
          关闭
        </button>
        <button
          class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 hover:bg-slate-200"
          type="button"
          @click="copyLoginUrl"
        >
          {{ copied ? "已复制" : "复制网址" }}
        </button>
        <button
          class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          type="button"
          @click="openLogin(); showLoginDialog = false"
        >
          打开登录页
        </button>
      </div>
    </div>
  </div>
</template>
