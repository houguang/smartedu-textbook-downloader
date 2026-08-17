<script setup lang="ts">
import { DIMENSIONS, type Textbook } from "../utils/types";
import { tagLabel } from "../utils/catalog";

defineProps<{
  book: Textbook;
  selected: boolean;
  viewing?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  view: [];
}>();
</script>

<template>
  <article
    class="group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    :class="selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'"
  >
    <label class="relative block aspect-[3/4] cursor-pointer bg-slate-100">
      <img
        v-if="book.cover"
        :src="book.cover"
        :alt="book.title"
        class="h-full w-full object-cover"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
      <div v-else class="flex h-full items-center justify-center text-base text-slate-400">暂无封面</div>
      <input
        class="absolute top-2.5 left-2.5 h-5 w-5 accent-blue-600"
        type="checkbox"
        :checked="selected"
        @change="emit('toggle')"
      />
    </label>
    <div class="flex flex-1 flex-col gap-2 p-3">
      <h3 class="line-clamp-2 text-base font-medium text-slate-900" :title="book.title">{{ book.title }}</h3>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="dim in [DIMENSIONS.stage, DIMENSIONS.grade, DIMENSIONS.subject, DIMENSIONS.edition, DIMENSIONS.volume]"
          :key="dim"
          v-show="tagLabel(book, dim)"
          class="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
        >
          {{ tagLabel(book, dim) }}
        </span>
      </div>
      <button
        class="mt-auto w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-70"
        type="button"
        :disabled="viewing"
        @click="emit('view')"
      >
        {{ viewing ? "打开中…" : "在线查看" }}
      </button>
    </div>
  </article>
</template>
