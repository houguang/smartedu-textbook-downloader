<script setup lang="ts">
import { computed } from "vue";
import type { BookOutline, BookOutlineLesson, BookUnit, Textbook } from "../utils/types";
import {
  collectDownloadableTypes,
  countMatchingFiles,
  lessonSourceUrl,
  resourceTypeName,
  unitDownloadableCount,
} from "../utils/lesson";

const props = defineProps<{
  book: Textbook;
  outline: BookOutline | null;
  loading: boolean;
  error: string;
  selectedLessonIds: Set<string>;
  selectedTypes: Set<string>;
}>();

const emit = defineEmits<{
  back: [];
  view: [];
  "update:selectedLessonIds": [value: Set<string>];
  "update:selectedTypes": [value: Set<string>];
}>();

const units = computed(() => props.outline?.units || []);
const allTypes = computed(() => (props.outline ? collectDownloadableTypes(props.outline) : []));
const allLessonIds = computed(() => units.value.flatMap((unit) => unit.lessons.map((lesson) => lesson.id)));
const selectedCount = computed(() => allLessonIds.value.filter((id) => props.selectedLessonIds.has(id)).length);
const selectedUnitCount = computed(
  () => units.value.filter((unit) => unit.lessons.some((lesson) => props.selectedLessonIds.has(lesson.id))).length,
);

const selectedPdfCount = computed(() =>
  units.value.reduce((sum, unit) => {
    return (
      sum +
      unit.lessons
        .filter((lesson) => props.selectedLessonIds.has(lesson.id))
        .reduce((inner, lesson) => inner + countMatchingFiles(lesson, props.selectedTypes), 0)
    );
  }, 0),
);

function setSelected(next: Set<string>) {
  emit("update:selectedLessonIds", next);
}

function toggleLesson(id: string) {
  const next = new Set(props.selectedLessonIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSelected(next);
}

function unitSelectedCount(unit: BookUnit): number {
  return unit.lessons.filter((lesson) => props.selectedLessonIds.has(lesson.id)).length;
}

function isUnitChecked(unit: BookUnit): boolean {
  return unit.lessons.length > 0 && unit.lessons.every((lesson) => props.selectedLessonIds.has(lesson.id));
}

function isUnitIndeterminate(unit: BookUnit): boolean {
  const count = unitSelectedCount(unit);
  return count > 0 && count < unit.lessons.length;
}

function toggleUnit(unit: BookUnit) {
  const next = new Set(props.selectedLessonIds);
  if (isUnitChecked(unit)) {
    for (const lesson of unit.lessons) next.delete(lesson.id);
  } else {
    for (const lesson of unit.lessons) next.add(lesson.id);
  }
  setSelected(next);
}

function selectAllUnits() {
  setSelected(new Set(allLessonIds.value));
}

function clearUnits() {
  setSelected(new Set());
}

function toggleGlobalType(typeName: string) {
  const next = new Set(props.selectedTypes);
  if (next.has(typeName)) next.delete(typeName);
  else next.add(typeName);
  emit("update:selectedTypes", next);
}

function resourceClass(kind: string, downloadable: boolean, active: boolean): string {
  if (!downloadable) return "bg-slate-100 text-slate-400";
  if (!active) return "bg-slate-100 text-slate-400";
  if (kind === "pdf") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-500";
}

function lessonTypeActive(typeName: string): boolean {
  return props.selectedTypes.has(typeName);
}

function selectedTypeCount(unit: BookUnit): number {
  return unit.lessons
    .filter((lesson) => props.selectedLessonIds.has(lesson.id))
    .reduce((sum, lesson) => sum + countMatchingFiles(lesson, props.selectedTypes), 0);
}

function sourceUrl(lesson: BookOutlineLesson): string {
  return lessonSourceUrl(lesson, props.book.id);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
      <button
        class="rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        type="button"
        @click="emit('back')"
      >
        ← 返回目录
      </button>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-base font-semibold text-slate-900" :title="book.title">{{ book.title }}</h2>
        <p class="text-sm text-slate-500">
          {{ units.length }} 个单元 · 已选 {{ selectedUnitCount }} 个单元 / {{ selectedCount }} 课时
          · 将下载 PDF {{ selectedPdfCount }} 个
        </p>
      </div>
      <button
        class="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
        type="button"
        @click="emit('view')"
      >
        在线查看
      </button>
    </div>

    <div class="space-y-3 border-b border-slate-100 px-5 py-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span class="text-slate-600">选择需要下载的资源类型：</span>
          <label
            v-for="typeName in allTypes"
            :key="typeName"
            class="flex cursor-pointer items-center gap-1.5 text-slate-800"
          >
            <input
              class="h-4 w-4 accent-blue-600"
              type="checkbox"
              :checked="selectedTypes.has(typeName)"
              @change="toggleGlobalType(typeName)"
            />
            {{ typeName }}
          </label>
          <label class="flex cursor-not-allowed items-center gap-1.5 text-slate-400">
            <input class="h-4 w-4" type="checkbox" disabled />
            视频
          </label>
        </div>
        <div class="flex gap-2">
          <button class="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" type="button" @click="selectAllUnits">
            全选单元
          </button>
          <button class="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" type="button" @click="clearUnits">
            取消选择
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-5">
      <p v-if="loading" class="py-20 text-center text-base text-slate-500">正在加载本册课时与资源…</p>
      <p v-else-if="error" class="py-20 text-center text-base text-red-600">{{ error }}</p>
      <p v-else-if="!units.length" class="py-20 text-center text-base text-slate-500">该册没有课时资源</p>
      <div v-else class="space-y-4">
        <section v-for="unit in units" :key="unit.id" class="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div class="bg-slate-50 px-4 py-3">
            <label class="flex cursor-pointer items-start gap-3">
              <input
                class="mt-1 h-4 w-4 accent-blue-600"
                type="checkbox"
                :checked="isUnitChecked(unit)"
                :indeterminate="isUnitIndeterminate(unit)"
                @change="toggleUnit(unit)"
              />
              <div class="min-w-0 flex-1">
                <h3 class="text-base font-semibold text-slate-900">{{ unit.title }}</h3>
                <p class="text-sm text-slate-500">
                  {{ unit.lessons.length }} 课时 · 可下载 PDF {{ unitDownloadableCount(unit) }} 个
                  · 已选 {{ unitSelectedCount(unit) }} 课时 · 将下载 {{ selectedTypeCount(unit) }} 个
                </p>
              </div>
            </label>
          </div>
          <ul class="divide-y divide-slate-100">
            <li v-for="lesson in unit.lessons" :key="lesson.id" class="px-4 py-3">
              <div class="flex items-start gap-3">
                <input
                  class="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                  type="checkbox"
                  :checked="selectedLessonIds.has(lesson.id)"
                  @change="toggleLesson(lesson.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-medium text-slate-800">{{ lesson.detail?.title || lesson.title }}</p>
                    <a
                      class="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:border-blue-300 hover:bg-blue-50"
                      :href="sourceUrl(lesson)"
                      target="_blank"
                      rel="noreferrer"
                      @click.stop
                    >
                      查看来源
                    </a>
                  </div>
                  <p v-if="lesson.error" class="mt-1 text-sm text-red-500">{{ lesson.error }}</p>
                  <div v-else class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-for="resource in lesson.detail?.resources || []"
                      :key="resource.id"
                      class="rounded-md px-1.5 py-0.5 text-xs"
                      :class="
                        resourceClass(
                          resource.kind,
                          resource.downloadable,
                          !resource.downloadable || lessonTypeActive(resourceTypeName(resource)),
                        )
                      "
                    >
                      {{ resource.title }}
                    </span>
                    <span v-if="!lesson.detail?.resources?.length" class="text-xs text-slate-400">暂无资源</span>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
