<script setup lang="ts">
import type { QueueItem } from "../utils/types";

defineProps<{
  items: QueueItem[];
  busy: boolean;
  paused: boolean;
  stats: {
    total: number;
    done: number;
    failed: number;
    cancelled: number;
    percent: number;
  };
}>();

const emit = defineEmits<{
  retry: [item: QueueItem];
  clear: [];
  "show-folder": [];
  pause: [];
  resume: [];
  cancel: [];
  "cancel-item": [item: QueueItem];
}>();

function statusText(item: QueueItem, paused: boolean): string {
  if (item.status === "running") return paused ? "已暂停" : `${Math.round(item.progress * 100)}%`;
  if (item.status === "done") return "完成";
  if (item.status === "error") return item.error || "失败";
  if (item.status === "cancelled") return "已取消";
  return paused ? "已暂停" : "等待";
}

function statusClass(item: QueueItem, paused: boolean): string {
  if (item.status === "done") return "text-emerald-600";
  if (item.status === "error") return "text-red-600";
  if (item.status === "cancelled") return "text-slate-400";
  if (item.status === "running") return paused ? "text-amber-600" : "text-blue-600";
  return paused ? "text-amber-600" : "text-slate-500";
}

function canCancelItem(item: QueueItem): boolean {
  return item.status === "pending" || item.status === "running";
}
</script>

<template>
  <aside class="flex h-full w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
    <div class="border-b border-slate-100 px-4 py-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-slate-800">下载队列</h2>
        <div class="flex gap-3">
          <button class="text-sm text-slate-500 hover:text-slate-800" type="button" @click="emit('show-folder')">
            打开目录
          </button>
          <button
            class="text-sm text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300"
            type="button"
            :disabled="busy"
            @click="emit('clear')"
          >
            清空
          </button>
        </div>
      </div>
      <div v-if="busy" class="mt-3 flex gap-2">
        <button
          class="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="paused ? emit('resume') : emit('pause')"
        >
          {{ paused ? "继续下载" : "暂停下载" }}
        </button>
        <button
          class="flex-1 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          type="button"
          @click="emit('cancel')"
        >
          取消下载
        </button>
      </div>
      <div v-if="stats.total" class="mt-3 space-y-1.5">
        <div class="flex items-center justify-between text-sm text-slate-600">
          <span>
            已完成 {{ stats.done }}/{{ stats.total }}
            <span v-if="stats.failed" class="text-red-500"> · 失败 {{ stats.failed }}</span>
            <span v-if="stats.cancelled" class="text-slate-400"> · 取消 {{ stats.cancelled }}</span>
          </span>
          <span class="font-medium text-slate-800">{{ stats.percent }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full transition-all"
            :class="paused ? 'bg-amber-500' : 'bg-blue-500'"
            :style="{ width: `${stats.percent}%` }"
          />
        </div>
      </div>
    </div>
    <div class="flex-1 space-y-3 overflow-y-auto p-3">
      <p v-if="!items.length" class="pt-8 text-center text-base text-slate-400">还没有下载任务</p>
      <article
        v-for="item in items"
        :key="item.id"
        class="rounded-lg border border-slate-100 bg-slate-50 p-3"
      >
        <div class="mb-1.5 flex items-start justify-between gap-2">
          <p class="line-clamp-2 text-sm font-medium text-slate-800" :title="item.title">
            {{ item.kind === "audio" ? "[音频] " : item.kind === "lesson" ? "[课程] " : "" }}{{ item.title }}
          </p>
          <div class="flex shrink-0 items-center gap-1.5">
            <span class="text-sm" :class="statusClass(item, paused)">{{ statusText(item, paused) }}</span>
            <button
              v-if="canCancelItem(item)"
              class="rounded px-1 text-sm leading-none text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              type="button"
              title="取消此项"
              @click="emit('cancel-item', item)"
            >
              ×
            </button>
          </div>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full transition-all"
            :class="item.status === 'error' ? 'bg-red-400' : item.status === 'cancelled' ? 'bg-slate-300' : paused ? 'bg-amber-400' : 'bg-blue-500'"
            :style="{ width: `${Math.round(item.progress * 100)}%` }"
          />
        </div>
        <p v-if="item.error" class="mt-1 line-clamp-2 text-sm text-red-500">{{ item.error }}</p>
        <button
          v-if="item.status === 'error' || item.status === 'cancelled'"
          class="mt-2 text-sm text-blue-600 hover:underline"
          type="button"
          @click="emit('retry', item)"
        >
          重试
        </button>
      </article>
    </div>
    <p v-if="busy" class="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      {{
        paused
          ? "已暂停下载，点击继续后恢复"
          : `正在下载 ${stats.done}/${stats.total}（${stats.percent}%），请保持此页面打开`
      }}
    </p>
  </aside>
</template>
