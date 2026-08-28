<script setup lang="ts">
import { DIMENSIONS, type Textbook } from "../utils/types";
import { tagLabel } from "../utils/catalog";

withDefaults(
  defineProps<{
    book: Textbook;
    selected: boolean;
    viewing?: boolean;
    selectable?: boolean;
    openable?: boolean;
  }>(),
  {
    selectable: true,
    openable: false,
  },
);

const emit = defineEmits<{
  toggle: [];
  view: [];
  open: [];
}>();
</script>

<template>
  <article
    class="group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    :class="selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'"
  >
    <div
      class="relative aspect-[3/4] cursor-pointer bg-slate-100"
      @click="selectable ? emit('toggle') : emit('open')"
    >
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
        v-if="selectable"
        class="absolute top-2.5 left-2.5 h-5 w-5 accent-blue-600"
        type="checkbox"
        :checked="selected"
        @click.stop
        @change="emit('toggle')"
      />
    </div>
    <div class="flex flex-1 flex-col gap-2 p-3">
      <h3
        class="line-clamp-2 text-base font-medium text-slate-900"
        :class="openable ? 'cursor-pointer hover:text-blue-700' : ''"
        :title="book.title"
        @click="openable && emit('open')"
      >
        {{ book.title }}
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="dim in [DIMENSIONS.stage, DIMENSIONS.grade, DIMENSIONS.subject, DIMENSIONS.edition, DIMENSIONS.volume, DIMENSIONS.oldNew]"
          :key="dim"
          v-show="tagLabel(book, dim)"
          class="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
        >
          {{ tagLabel(book, dim) }}
        </span>
      </div>
      <div class="mt-auto flex flex-col gap-1.5">
        <button
          v-if="openable"
          class="w-full rounded-lg bg-blue-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          type="button"
          @click.stop="emit('open')"
        >
          查看资源
        </button>
        <button
          class="w-full rounded-lg border px-2 py-1.5 text-sm font-medium"
          :class="
            openable
              ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-70'
          "
          type="button"
          :disabled="viewing"
          @click.stop="emit('view')"
        >
          {{ viewing ? "打开中…" : "在线查看" }}
        </button>
      </div>
    </div>
  </article>
</template>
