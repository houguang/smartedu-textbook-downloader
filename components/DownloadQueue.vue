<script setup lang="ts">
import type { QueueItem } from "../utils/types";

defineProps<{
  items: QueueItem[];
  busy: boolean;
  stats: {
    total: number;
    done: number;
    failed: number;
    percent: number;
  };
}>();

const emit = defineEmits<{
  retry: [item: QueueItem];
  clear: [];
  "show-folder": [];
}>();

function statusText(item: QueueItem): string {
  if (item.status === "running") return `${Math.round(item.progress * 100)}%`;
  if (item.status === "done") return "完成";
  if (item.status === "error") return item.error || "失败";
  return "等待";
}

function statusClass(item: QueueItem): string {
  if (item.status === "done") return "text-emerald-600";
  if (item.status === "error") return "text-red-600";
  if (item.status === "running") return "text-blue-600";
  return "text-slate-500";
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
          <button class="text-sm text-slate-500 hover:text-slate-800" type="button" @click="emit('clear')">
            清空
          </button>
        </div>
      </div>
      <div v-if="stats.total" class="mt-3 space-y-1.5">
        <div class="flex items-center justify-between text-sm text-slate-600">
          <span>
            已完成 {{ stats.done }}/{{ stats.total }}
            <span v-if="stats.failed" class="text-red-500"> · 失败 {{ stats.failed }}</span>
          </span>
          <span class="font-medium text-slate-800">{{ stats.percent }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full bg-blue-500 transition-all"
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
            {{ item.kind === "audio" ? "[音频] " : "" }}{{ item.title }}
          </p>
          <span class="shrink-0 text-sm" :class="statusClass(item)">{{ statusText(item) }}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            class="h-full rounded-full transition-all"
            :class="item.status === 'error' ? 'bg-red-400' : 'bg-blue-500'"
            :style="{ width: `${Math.round(item.progress * 100)}%` }"
          />
        </div>
        <p v-if="item.error" class="mt-1 line-clamp-2 text-sm text-red-500">{{ item.error }}</p>
        <button
          v-if="item.status === 'error'"
          class="mt-2 text-sm text-blue-600 hover:underline"
          type="button"
          @click="emit('retry', item)"
        >
          重试
        </button>
      </article>
    </div>
    <p v-if="busy" class="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      正在下载 {{ stats.done }}/{{ stats.total }}（{{ stats.percent }}%），请保持此页面打开
    </p>
  </aside>
</template>
