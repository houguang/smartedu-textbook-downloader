<script setup lang="ts">
import type { TagInfo } from "../utils/types";

const props = defineProps<{
  title: string;
  tags: TagInfo[];
  modelValue: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

function toggle(id: string) {
  emit("update:modelValue", props.modelValue === id ? null : id);
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-slate-800">{{ title }}</h3>
      <button
        v-if="modelValue"
        class="text-sm text-blue-600 hover:text-blue-700"
        type="button"
        @click="emit('update:modelValue', null)"
      >
        清除
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="tag in tags"
        :key="tag.id"
        type="button"
        class="rounded-lg border px-2.5 py-2 text-left text-sm leading-snug transition"
        :class="
          modelValue === tag.id
            ? 'border-blue-600 bg-blue-600 font-medium text-white'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-white hover:text-blue-700'
        "
        @click="toggle(tag.id)"
      >
        {{ tag.name }}
      </button>
      <p v-if="!tags.length" class="col-span-2 text-sm text-slate-400">暂无选项</p>
    </div>
  </section>
</template>
