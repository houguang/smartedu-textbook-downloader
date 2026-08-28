import { fetchJsonWithFallback, toResource, withFileCdnHosts, zhText, type TiItem } from "./api";
import {
  CLASSROOM_URL,
  type BookLessonRef,
  type BookOutline,
  type BookOutlineLesson,
  type BookUnit,
  type ClassActivityRef,
  type LessonDetail,
  type LessonFile,
  type LessonResource,
  type TagInfo,
} from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKIP_FLAGS = /^(m3u8|folder|superboard|thumbnail)/i;
const UNGROUPED_UNIT_ID = "_ungrouped";

interface RawCourseResource {
  id?: string;
  title?: string;
  alias_name?: string;
  global_title?: Record<string, string> | string;
  resource_type_code?: string;
  resource_type_code_name?: string;
  ti_items?: TiItem[];
}

interface RawLessonDetail {
  id?: string;
  title?: string;
  global_title?: Record<string, string> | string;
  teachingmaterial_id?: string;
  teachmeterial_ids?: string[];
  tag_list?: Array<{ tag_id?: string; tag_name?: string; tag_dimension_id?: string }>;
  custom_properties?: {
    teachingmaterial_info?: {
      title?: string;
      global_title?: Record<string, string> | string;
    };
  };
  relations?: {
    national_course_resource?: RawCourseResource[];
  };
}

interface RawPartItem {
  id?: string;
  title?: string;
  global_title?: Record<string, string> | string;
  resource_type_code?: string;
  chapter_ids?: string[];
  chapter_paths?: string[];
}

interface TreeNode {
  id?: string;
  title?: string;
  child_nodes?: TreeNode[] | null;
}

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseClassActivityUrl(link: string): ClassActivityRef | null {
  const text = link.trim();
  if (!text) return null;
  if (looksLikeUuid(text)) {
    return { activityId: text, teachingmaterialId: null, chapterId: null };
  }
  try {
    const url = new URL(text);
    const activityId = url.searchParams.get("activityId")?.trim();
    if (!activityId) return null;
    return {
      activityId,
      teachingmaterialId: url.searchParams.get("teachingmaterialId")?.trim() || null,
      chapterId: url.searchParams.get("chapterId")?.trim() || null,
    };
  } catch {
    return null;
  }
}

export function parseClassActivityLines(text: string): ClassActivityRef[] {
  const seen = new Set<string>();
  const refs: ClassActivityRef[] = [];
  for (const line of text.split(/\r?\n/)) {
    const ref = parseClassActivityUrl(line);
    if (!ref || seen.has(ref.activityId)) continue;
    seen.add(ref.activityId);
    refs.push(ref);
  }
  return refs;
}

export function buildClassActivityUrl(
  activityId: string,
  teachingmaterialId?: string | null,
  chapterId?: string | null,
): string {
  const url = new URL(`${CLASSROOM_URL}/classActivity`);
  url.searchParams.set("activityId", activityId);
  if (teachingmaterialId) url.searchParams.set("teachingmaterialId", teachingmaterialId);
  if (chapterId) url.searchParams.set("chapterId", chapterId);
  url.searchParams.set("fromPrepare", "0");
  return url.toString();
}

export function lessonSourceUrl(lesson: BookOutlineLesson, bookId: string): string {
  const chapterId = lesson.chapterIds.at(-1) || lesson.chapterIds[0] || null;
  return buildClassActivityUrl(lesson.id, bookId, chapterId);
}

export function lessonQueueId(activityId: string, resourceId: string): string {
  return `${activityId}::${resourceId}`;
}

export function parseLessonQueueId(id: string): { activityId: string; resourceId: string } | null {
  const index = id.indexOf("::");
  if (index <= 0 || index === id.length - 2) return null;
  return { activityId: id.slice(0, index), resourceId: id.slice(index + 2) };
}

function pickPdfItem(items: TiItem[]): TiItem | undefined {
  return items.find((item) => {
    const flag = item.ti_file_flag || "";
    if (SKIP_FLAGS.test(flag)) return false;
    return flag === "pdf" && item.ti_format === "pdf";
  });
}

function isVideoResource(raw: RawCourseResource): boolean {
  if (raw.resource_type_code === "micro_lesson_video") return true;
  return (raw.ti_items || []).some((item) => {
    const flag = item.ti_file_flag || "";
    const format = item.ti_format || "";
    return format === "m3u8" || flag.toLowerCase().includes("m3u8");
  });
}

function toLessonResource(raw: RawCourseResource): LessonResource | null {
  const id = raw.id;
  if (!id) return null;
  const title =
    raw.title ||
    raw.resource_type_code_name ||
    zhText(raw.global_title, "课程资源");
  const alias = (raw.alias_name || "").trim() || title;
  const pdfItem = pickPdfItem(raw.ti_items || []);
  if (pdfItem) {
    const file = toResource(alias, pdfItem, "pdf");
    if (file) return { id, title, alias, kind: "pdf", downloadable: true, file };
  }
  if (isVideoResource(raw)) {
    return { id, title, alias, kind: "video", downloadable: false };
  }
  const items = raw.ti_items || [];
  const onlySkipped = items.length > 0 && items.every((item) => SKIP_FLAGS.test(item.ti_file_flag || ""));
  if (onlySkipped) return null;
  return { id, title, alias, kind: "other", downloadable: false };
}

function toLessonFile(resource: LessonResource): LessonFile | null {
  if (!resource.downloadable || !resource.file) return null;
  return { id: resource.id, title: resource.title, alias: resource.alias, file: resource.file };
}

export async function fetchLessonDetail(activityId: string): Promise<LessonDetail> {
  const data = await fetchJsonWithFallback<RawLessonDetail>(
    withFileCdnHosts(`/zxx/ndrv2/national_lesson/resources/details/${activityId}.json`),
  );
  const id = data.id || activityId;
  const title = zhText(data.global_title, data.title || id);
  const material = data.custom_properties?.teachingmaterial_info;
  const bookTitle = zhText(material?.global_title, material?.title || "未分类教材");
  const bookId = data.teachingmaterial_id || data.teachmeterial_ids?.[0] || "";
  const tags: TagInfo[] = [];
  const tagMap: Record<string, TagInfo> = {};
  for (const tag of data.tag_list || []) {
    if (!tag.tag_id || !tag.tag_name || !tag.tag_dimension_id) continue;
    const info = { id: tag.tag_id, name: tag.tag_name, dimension: tag.tag_dimension_id };
    tags.push(info);
    if (!tagMap[info.dimension]) tagMap[info.dimension] = info;
  }
  const resources = (data.relations?.national_course_resource || [])
    .map(toLessonResource)
    .filter((item): item is LessonResource => Boolean(item));
  const files = resources.map(toLessonFile).filter((item): item is LessonFile => Boolean(item));
  return { id, title, bookId, bookTitle, tags, tagMap, files, resources };
}

function walkTreeTitles(nodes: TreeNode[] | undefined | null, map: Map<string, string>): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.id && node.title) map.set(node.id, node.title);
    walkTreeTitles(node.child_nodes, map);
  }
}

async function fetchLessonTreeNodes(bookId: string): Promise<TreeNode[]> {
  try {
    const tree = await fetchJsonWithFallback<TreeNode[] | { child_nodes?: TreeNode[] }>(
      withFileCdnHosts(`/zxx/ndrv2/national_lesson/trees/${bookId}.json`),
    );
    return Array.isArray(tree) ? tree : tree.child_nodes || [];
  } catch {
    return [];
  }
}

function chapterIdsFor(item: RawPartItem): string[] {
  const path = item.chapter_paths?.[0];
  return path ? path.split("/").filter(Boolean) : item.chapter_ids || [];
}

function chapterTitlesFor(ids: string[], titleMap: Map<string, string>): string[] {
  return ids.map((id) => titleMap.get(id)).filter((name): name is string => Boolean(name));
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, limit) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    }),
  );
}

export async function fetchBookLessons(bookId: string): Promise<BookLessonRef[]> {
  const partUrls = await fetchJsonWithFallback<string[]>(
    withFileCdnHosts(`/zxx/ndrs/national_lesson/teachingmaterials/${bookId}/resources/parts.json`),
  );
  if (!partUrls?.length) throw new Error("该册课时列表为空");
  const parts = await Promise.all(
    partUrls.map((url) => fetchJsonWithFallback<RawPartItem[]>(withFileCdnHosts(url))),
  );
  const nodes = await fetchLessonTreeNodes(bookId);
  const titleMap = new Map<string, string>();
  walkTreeTitles(nodes, titleMap);
  const lessons: BookLessonRef[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const raw of part || []) {
      if (raw.resource_type_code !== "national_lesson" || !raw.id || seen.has(raw.id)) continue;
      seen.add(raw.id);
      const chapterIds = chapterIdsFor(raw);
      lessons.push({
        id: raw.id,
        title: zhText(raw.global_title, raw.title || raw.id),
        chapterIds,
        chapterTitles: chapterTitlesFor(chapterIds, titleMap),
      });
    }
  }
  return lessons;
}

export async function fetchBookOutline(bookId: string): Promise<BookOutline> {
  const lessons = await fetchBookLessons(bookId);
  if (!lessons.length) throw new Error("该册没有国家课");
  const nodes = await fetchLessonTreeNodes(bookId);
  const titleMap = new Map<string, string>();
  walkTreeTitles(nodes, titleMap);

  const details = new Map<string, LessonDetail>();
  const errors = new Map<string, string>();
  await mapPool(lessons, 4, async (lesson) => {
    try {
      details.set(lesson.id, await fetchLessonDetail(lesson.id));
    } catch (error) {
      errors.set(lesson.id, error instanceof Error ? error.message : String(error));
    }
  });

  const unitMap = new Map<string, BookUnit>();
  for (const node of nodes) {
    if (!node.id) continue;
    unitMap.set(node.id, {
      id: node.id,
      title: node.title || titleMap.get(node.id) || "未命名单元",
      lessons: [],
    });
  }

  const ungrouped: BookOutlineLesson[] = [];
  for (const lesson of lessons) {
    const item: BookOutlineLesson = {
      ...lesson,
      detail: details.get(lesson.id) || null,
      error: errors.get(lesson.id),
    };
    const unitId = lesson.chapterIds[0];
    const unit = unitId ? unitMap.get(unitId) : undefined;
    if (unit) unit.lessons.push(item);
    else ungrouped.push(item);
  }

  const units = nodes
    .map((node) => (node.id ? unitMap.get(node.id) : undefined))
    .filter((unit): unit is BookUnit => Boolean(unit?.lessons.length));
  if (ungrouped.length) {
    units.push({ id: UNGROUPED_UNIT_ID, title: "其他课时", lessons: ungrouped });
  }
  if (!units.length) {
    units.push({
      id: UNGROUPED_UNIT_ID,
      title: "全部课时",
      lessons: lessons.map((lesson) => ({
        ...lesson,
        detail: details.get(lesson.id) || null,
        error: errors.get(lesson.id),
      })),
    });
  }
  return { bookId, units };
}

export function downloadableLessonCount(lesson: BookOutlineLesson): number {
  return lesson.detail?.files.length || 0;
}

export function unitDownloadableCount(unit: BookUnit): number {
  return unit.lessons.reduce((sum, lesson) => sum + downloadableLessonCount(lesson), 0);
}

export const PREFERRED_RESOURCE_TYPES = ["课件", "教学设计", "学习任务单", "课后练习"];

export function resourceTypeName(item: { title: string; alias?: string }): string {
  return (item.title || item.alias || "其他").trim();
}

export function sortResourceTypes(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = PREFERRED_RESOURCE_TYPES.indexOf(a);
    const ib = PREFERRED_RESOURCE_TYPES.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, "zh-CN");
  });
}

export function collectDownloadableTypes(outline: BookOutline): string[] {
  const names = new Set<string>();
  for (const unit of outline.units) {
    for (const lesson of unit.lessons) {
      for (const file of lesson.detail?.files || []) {
        names.add(resourceTypeName(file));
      }
    }
  }
  return sortResourceTypes([...names]);
}

export function fileMatchesTypes(file: { title: string; alias?: string }, types: Set<string>): boolean {
  if (!types.size) return false;
  return types.has(resourceTypeName(file));
}

export function countFilesByType(unit: BookUnit, typeName: string): number {
  return unit.lessons.reduce((sum, lesson) => {
    return sum + (lesson.detail?.files.filter((file) => resourceTypeName(file) === typeName).length || 0);
  }, 0);
}

export function countMatchingFiles(
  lesson: BookOutlineLesson,
  types: Set<string>,
): number {
  return lesson.detail?.files.filter((file) => fileMatchesTypes(file, types)).length || 0;
}
