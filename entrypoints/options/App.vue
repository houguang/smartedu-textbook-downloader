<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import BookCard from "../../components/BookCard.vue";
import DownloadQueue from "../../components/DownloadQueue.vue";
import FilterGroup from "../../components/FilterGroup.vue";
import {
  applyPreferredFilters,
  availableTags,
  bookMatches,
  emptyFilters,
  fetchCatalog,
  pruneFilters,
} from "../../utils/catalog";
import { fetchPdfViewUrl } from "../../utils/api";
import { isLoggedIn } from "../../utils/auth";
import { beginDownloadSession, downloadTextbook, endDownloadSession, runPool } from "../../utils/download";
import { bookFolderPath, buildDownloadPath } from "../../utils/filename";
import {
  loadCredentials,
  loadSettings,
  onStorageChanged,
  saveSettings,
} from "../../utils/storage";
import { AUTH_URL, DIMENSIONS, LOGIN_URL, type QueueItem, type TagInfo, type Textbook, type TokenCredentials } from "../../utils/types";

const loading = ref(true);
const error = ref("");
const books = ref<Textbook[]>([]);
const tagMap = ref(new Map<string, TagInfo>());
const filters = reactive(emptyFilters());
const selectedIds = ref(new Set<string>());
const credentials = ref<TokenCredentials | null>(null);
const addBookmarks = ref(false);
const downloadAudio = ref(false);
const queue = ref<QueueItem[]>([]);
const batchBookIds = ref<string[]>([]);
const busy = ref(false);
const showLoginDialog = ref(false);
const copied = ref(false);
const viewingId = ref<string | null>(null);

const visibleBooks = computed(() => books.value.filter((book) => bookMatches(book, filters)));
const selectedBooks = computed(() => visibleBooks.value.filter((book) => selectedIds.value.has(book.id)));
const loggedIn = computed(() => isLoggedIn(credentials.value));

const stageTags = computed(() => availableTags(books.value, filters, DIMENSIONS.stage));
const gradeTags = computed(() => availableTags(books.value, filters, DIMENSIONS.grade));
const subjectTags = computed(() => availableTags(books.value, filters, DIMENSIONS.subject));
const editionTags = computed(() => availableTags(books.value, filters, DIMENSIONS.edition));
const volumeTags = computed(() => availableTags(books.value, filters, DIMENSIONS.volume));

function pdfItemFor(bookId: string): QueueItem | undefined {
  return queue.value.find((item) => item.bookId === bookId && item.kind === "pdf");
}

function bookProgress(bookId: string): number {
  const pdf = pdfItemFor(bookId);
  if (!pdf) return 0;
  if (pdf.status === "done" || pdf.status === "error") return 1;
  return Math.max(0, Math.min(1, pdf.progress));
}

const queueStats = computed(() => {
  const ids = batchBookIds.value.length
    ? batchBookIds.value
    : [...new Set(queue.value.filter((item) => item.kind === "pdf").map((item) => item.bookId))];
  const total = ids.length;
  const done = ids.filter((id) => pdfItemFor(id)?.status === "done").length;
  const failed = ids.filter((id) => pdfItemFor(id)?.status === "error").length;
  const weighted = ids.reduce((sum, id) => sum + bookProgress(id), 0);
  const percent = total ? Math.round((weighted / total) * 100) : 0;
  return { total, done, failed, percent };
});

watch(
  () => [filters.stage, filters.subject, filters.edition, filters.grade],
  () => {
    pruneFilters(books.value, filters);
  },
);

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function selectAllVisible() {
  selectedIds.value = new Set(visibleBooks.value.map((book) => book.id));
}

function clearSelected() {
  selectedIds.value = new Set();
}

function clearQueue() {
  queue.value = [];
  batchBookIds.value = [];
}

function upsertQueue(item: QueueItem) {
  const index = queue.value.findIndex((entry) => entry.id === item.id);
  if (index === -1) queue.value = [item, ...queue.value];
  else queue.value.splice(index, 1, item);
}

async function refreshAuth() {
  credentials.value = await loadCredentials();
}

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const catalog = await fetchCatalog();
    books.value = catalog.books;
    tagMap.value = catalog.tagMap;
    Object.assign(filters, applyPreferredFilters(catalog.books, catalog.tagMap, emptyFilters()));
    pruneFilters(books.value, filters);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function startDownload(targets: Textbook[]) {
  if (!targets.length) return;
  if (!loggedIn.value) {
    error.value = "请先登录智慧教育平台，再回来下载。";
    return;
  }
  busy.value = true;
  error.value = "";
  const targetIds = new Set(targets.map((book) => book.id));
  batchBookIds.value = targets.map((book) => book.id);
  queue.value = [
    ...targets.map((book) => ({
      id: `${book.id}-pdf`,
      bookId: book.id,
      title: book.title,
      kind: "pdf" as const,
      filename: buildDownloadPath(book.title, "pdf", bookFolderPath(book)),
      status: "pending" as const,
      progress: 0,
    })),
    ...queue.value.filter((item) => !targetIds.has(item.bookId)),
  ];
  beginDownloadSession();
  try {
    await runPool(targets, 2, async (book) => {
      await downloadTextbook(
        { book, addBookmarks: addBookmarks.value, downloadAudio: downloadAudio.value },
        credentials.value,
        upsertQueue,
      );
    });
  } finally {
    endDownloadSession();
    busy.value = false;
  }
}

async function retryItem(item: QueueItem) {
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
  void browser.tabs.create({ url: LOGIN_URL });
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
  if (!loggedIn.value) {
    showLoginDialog.value = true;
    return;
  }
  viewingId.value = book.id;
  error.value = "";
  try {
    const url = await fetchPdfViewUrl(book.id, credentials.value);
    await browser.tabs.create({ url });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
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

onMounted(async () => {
  const settings = await loadSettings();
  addBookmarks.value = settings.addBookmarks;
  downloadAudio.value = settings.downloadAudio;
  await refreshAuth();
  await loadData();
  stopWatch = onStorageChanged(() => {
    void refreshAuth();
  });
});

onUnmounted(() => stopWatch?.());
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
        <label class="flex items-center gap-1.5 text-sm text-slate-600">
          <input v-model="addBookmarks" class="h-4 w-4 accent-blue-600" type="checkbox" @change="persistSettings" />
          PDF 书签
        </label>
        <label class="flex items-center gap-1.5 text-sm text-slate-600">
          <input v-model="downloadAudio" class="h-4 w-4 accent-blue-600" type="checkbox" @change="persistSettings" />
          配套音频
        </label>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-base font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          type="button"
          :disabled="busy || !selectedBooks.length"
          @click="startDownload(selectedBooks)"
        >
          {{ busy && queueStats.total ? `下载中 ${queueStats.done}/${queueStats.total}（${queueStats.percent}%）` : `下载已选 (${selectedBooks.length})` }}
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
      <aside class="w-80 shrink-0 space-y-6 overflow-y-auto border-r border-slate-200 bg-white px-4 py-5">
        <FilterGroup v-model="filters.stage" title="学段" :tags="stageTags" />
        <FilterGroup v-model="filters.subject" title="学科" :tags="subjectTags" />
        <FilterGroup v-model="filters.edition" title="版本" :tags="editionTags" />
        <FilterGroup v-model="filters.grade" title="年级" :tags="gradeTags" />
        <FilterGroup v-model="filters.volume" title="册次" :tags="volumeTags" />
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
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
          <p v-if="loading" class="py-20 text-center text-base text-slate-500">正在加载教材目录…</p>
          <p v-else-if="error" class="py-20 text-center text-base text-red-600">{{ error }}</p>
          <p v-else-if="!visibleBooks.length" class="py-20 text-center text-base text-slate-500">没有符合筛选条件的教材</p>
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            <BookCard
              v-for="book in visibleBooks"
              :key="book.id"
              :book="book"
              :selected="selectedIds.has(book.id)"
              :viewing="viewingId === book.id"
              @toggle="toggleSelect(book.id)"
              @view="openOnline(book)"
            />
          </div>
        </div>
      </main>

      <DownloadQueue
        :items="queue"
        :busy="busy"
        :stats="queueStats"
        @retry="retryItem"
        @clear="clearQueue"
        @show-folder="showFolder"
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
