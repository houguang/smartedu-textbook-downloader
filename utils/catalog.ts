import { DIMENSIONS, GRADE_ORDER, STAGE_ORDER, VOLUME_ORDER, type TagInfo, type Textbook } from "./types";

const TAGS_URL = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json";
const VERSION_URL =
  "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json";

interface RawTagNode {
  tag_id?: string;
  tag_name?: string;
  tag_dimension_id?: string;
  children?: RawTagNode[];
  hierarchies?: RawTagNode[];
}

interface RawBook {
  id?: string;
  title?: string;
  global_title?: Record<string, string> | string;
  tag_list?: Array<{
    tag_id?: string;
    tag_name?: string;
    tag_dimension_id?: string;
  }>;
  tag_paths?: string[];
  custom_properties?: {
    thumbnails?: string[];
  };
}

export interface FilterState {
  stage: string | null;
  grade: string | null;
  subject: string | null;
  edition: string | null;
  volume: string | null;
}

function zhTitle(value: RawBook["global_title"] | string | undefined, fallback = ""): string {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value["zh-CN"] || value["en"] || Object.values(value)[0] || fallback;
}

function walkTags(nodes: RawTagNode[] | undefined, map: Map<string, TagInfo>): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.tag_id && node.tag_name) {
      map.set(node.tag_id, {
        id: node.tag_id,
        name: node.tag_name,
        dimension: node.tag_dimension_id || "",
      });
    }
    walkTags(node.children, map);
    walkTags(node.hierarchies, map);
  }
}

function compareByOrder(a: string, b: string, preferred: string[]): number {
  const ia = preferred.indexOf(a);
  const ib = preferred.indexOf(b);
  if (ia !== -1 || ib !== -1) {
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  }
  return a.localeCompare(b, "zh-CN");
}

export function sortTagNames(names: string[], dimension: string): string[] {
  const preferred =
    dimension === DIMENSIONS.stage
      ? STAGE_ORDER
      : dimension === DIMENSIONS.grade
        ? GRADE_ORDER
        : dimension === DIMENSIONS.volume
          ? VOLUME_ORDER
          : [];
  return [...names].sort((a, b) => compareByOrder(a, b, preferred));
}

function mergeTag(tagMap: Record<string, TagInfo>, tags: TagInfo[], info: TagInfo): void {
  if (!tagMap[info.dimension]) {
    tags.push(info);
    tagMap[info.dimension] = info;
    return;
  }
  if (!tags.some((tag) => tag.id === info.id)) tags.push(info);
}

export function normalizeTextbook(raw: RawBook, catalogTags?: Map<string, TagInfo>): Textbook | null {
  const id = raw.id;
  if (!id) return null;
  const title = zhTitle(raw.global_title, raw.title || id);
  const tags: TagInfo[] = [];
  const tagMap: Record<string, TagInfo> = {};
  for (const tag of raw.tag_list || []) {
    if (!tag.tag_id || !tag.tag_name || !tag.tag_dimension_id) continue;
    mergeTag(tagMap, tags, {
      id: tag.tag_id,
      name: tag.tag_name,
      dimension: tag.tag_dimension_id,
    });
  }
  if (catalogTags) {
    for (const path of raw.tag_paths || []) {
      for (const tagId of path.split("/").filter(Boolean)) {
        const info = catalogTags.get(tagId);
        if (info) mergeTag(tagMap, tags, info);
      }
    }
  }
  const cover = raw.custom_properties?.thumbnails?.[0];
  return { id, title, cover, tags, tagMap };
}

export async function fetchCatalog(): Promise<{ books: Textbook[]; tagMap: Map<string, TagInfo> }> {
  const [tagsRes, versionRes] = await Promise.all([fetch(TAGS_URL), fetch(VERSION_URL)]);
  if (!tagsRes.ok) throw new Error(`分类接口失败 HTTP ${tagsRes.status}`);
  if (!versionRes.ok) throw new Error(`教材列表版本接口失败 HTTP ${versionRes.status}`);

  const tagsJson = (await tagsRes.json()) as { hierarchies?: RawTagNode[] };
  const tagMap = new Map<string, TagInfo>();
  walkTags(tagsJson.hierarchies, tagMap);

  const versionJson = (await versionRes.json()) as { urls?: string };
  const urls = (versionJson.urls || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!urls.length) throw new Error("教材列表地址为空");

  const parts = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`教材分片失败 HTTP ${response.status}`);
      return (await response.json()) as RawBook[];
    }),
  );

  const books: Textbook[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const raw of part || []) {
      const book = normalizeTextbook(raw, tagMap);
      if (!book || seen.has(book.id)) continue;
      seen.add(book.id);
      books.push(book);
    }
  }
  return { books, tagMap };
}

export function emptyFilters(): FilterState {
  return {
    stage: null,
    grade: null,
    subject: null,
    edition: null,
    volume: null,
  };
}

export function applyDefaultTag(
  tagPath: string | null,
  tagMap: Map<string, TagInfo>,
  current: FilterState,
): FilterState {
  if (!tagPath) return current;
  const next = { ...current };
  for (const id of tagPath.split("/").map((item) => item.trim()).filter(Boolean)) {
    const tag = tagMap.get(id);
    if (!tag) continue;
    if (tag.dimension === DIMENSIONS.stage) next.stage = tag.id;
    if (tag.dimension === DIMENSIONS.grade) next.grade = tag.id;
    if (tag.dimension === DIMENSIONS.subject) next.subject = tag.id;
    if (tag.dimension === DIMENSIONS.edition) next.edition = tag.id;
    if (tag.dimension === DIMENSIONS.volume) next.volume = tag.id;
  }
  return next;
}

const DEFAULT_FILTER_NAMES: Array<{ dimension: string; name: string; key: keyof FilterState }> = [
  { dimension: DIMENSIONS.stage, name: "小学", key: "stage" },
  { dimension: DIMENSIONS.subject, name: "语文", key: "subject" },
  { dimension: DIMENSIONS.edition, name: "统编版", key: "edition" },
];

function findTagId(
  dimension: string,
  name: string,
  tagMap: Map<string, TagInfo>,
  books: Textbook[],
): string | null {
  for (const tag of tagMap.values()) {
    if (tag.dimension === dimension && tag.name === name) return tag.id;
  }
  for (const book of books) {
    const tag = book.tagMap[dimension];
    if (tag?.name === name) return tag.id;
  }
  return null;
}

export function applyPreferredFilters(
  books: Textbook[],
  tagMap: Map<string, TagInfo>,
  current: FilterState,
): FilterState {
  const next = { ...current };
  for (const item of DEFAULT_FILTER_NAMES) {
    const id = findTagId(item.dimension, item.name, tagMap, books);
    if (id) next[item.key] = id;
  }
  return next;
}

export function bookMatches(book: Textbook, filters: FilterState): boolean {
  if (filters.stage && book.tagMap[DIMENSIONS.stage]?.id !== filters.stage) return false;
  if (filters.grade && book.tagMap[DIMENSIONS.grade]?.id !== filters.grade) return false;
  if (filters.subject && book.tagMap[DIMENSIONS.subject]?.id !== filters.subject) return false;
  if (filters.edition && book.tagMap[DIMENSIONS.edition]?.id !== filters.edition) return false;
  if (filters.volume && book.tagMap[DIMENSIONS.volume]?.id !== filters.volume) return false;
  return true;
}

function parentScope(filters: FilterState, dimension: string): FilterState {
  const scoped = emptyFilters();
  if (dimension === DIMENSIONS.stage) return scoped;
  scoped.stage = filters.stage;
  if (dimension === DIMENSIONS.subject) return scoped;
  scoped.subject = filters.subject;
  if (dimension === DIMENSIONS.edition) return scoped;
  scoped.edition = filters.edition;
  if (dimension === DIMENSIONS.grade) return scoped;
  scoped.grade = filters.grade;
  return scoped;
}

export function availableTags(
  books: Textbook[],
  filters: FilterState,
  dimension: string,
): TagInfo[] {
  const scoped = parentScope(filters, dimension);
  const map = new Map<string, TagInfo>();
  for (const book of books) {
    if (!bookMatches(book, scoped)) continue;
    const tag = book.tagMap[dimension];
    if (tag) map.set(tag.id, tag);
  }
  const list = [...map.values()];
  const names = sortTagNames(
    list.map((tag) => tag.name),
    dimension,
  );
  return list.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
}

export function pruneFilters(books: Textbook[], filters: FilterState): void {
  const keep = (dimension: string, current: string | null): string | null => {
    if (!current) return null;
    return availableTags(books, filters, dimension).some((tag) => tag.id === current) ? current : null;
  };
  filters.subject = keep(DIMENSIONS.subject, filters.subject);
  filters.edition = keep(DIMENSIONS.edition, filters.edition);
  filters.grade = keep(DIMENSIONS.grade, filters.grade);
  filters.volume = keep(DIMENSIONS.volume, filters.volume);
}

export function tagLabel(book: Textbook, dimension: string): string {
  return book.tagMap[dimension]?.name || "";
}
