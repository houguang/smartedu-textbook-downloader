export interface TokenCredentials {
  access_token: string;
  mac_key: string | null;
  diff: number;
}

export interface TagInfo {
  id: string;
  name: string;
  dimension: string;
}

export interface Textbook {
  id: string;
  title: string;
  cover?: string;
  tags: TagInfo[];
  tagMap: Record<string, TagInfo>;
}

export interface Chapter {
  title: string;
  page_index: number | null;
  children?: Chapter[];
}

export interface ResourceFile {
  title: string;
  url: string;
  fallbackUrls: string[];
  format: string;
  size?: number;
}

export interface TextbookDetail {
  id: string;
  title: string;
  edition?: string;
  pdf?: ResourceFile;
  mappingUrl?: string;
  mappingFallbackUrls?: string[];
  audios: ResourceFile[];
  chapters: Chapter[];
}

export type QueueStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface QueueItem {
  id: string;
  bookId: string;
  title: string;
  kind: "pdf" | "audio" | "lesson";
  filename: string;
  status: QueueStatus;
  progress: number;
  error?: string;
  downloadId?: number;
}

export interface LessonFile {
  id: string;
  title: string;
  alias: string;
  file: ResourceFile;
}

export type LessonResourceKind = "pdf" | "video" | "other";

export interface LessonResource {
  id: string;
  title: string;
  alias: string;
  kind: LessonResourceKind;
  downloadable: boolean;
  file?: ResourceFile;
}

export interface LessonDetail {
  id: string;
  title: string;
  bookId: string;
  bookTitle: string;
  tags: TagInfo[];
  tagMap: Record<string, TagInfo>;
  files: LessonFile[];
  resources: LessonResource[];
}

export interface ClassActivityRef {
  activityId: string;
  teachingmaterialId: string | null;
  chapterId: string | null;
}

export interface BookLessonRef {
  id: string;
  title: string;
  chapterIds: string[];
  chapterTitles: string[];
}

export interface BookOutlineLesson {
  id: string;
  title: string;
  chapterIds: string[];
  chapterTitles: string[];
  detail: LessonDetail | null;
  error?: string;
}

export interface BookUnit {
  id: string;
  title: string;
  lessons: BookOutlineLesson[];
}

export interface BookOutline {
  bookId: string;
  units: BookUnit[];
}

export interface AppSettings {
  addBookmarks: boolean;
  downloadAudio: boolean;
}

export const DIMENSIONS = {
  stage: "zxxxd",
  grade: "zxxnj",
  subject: "zxxxk",
  edition: "zxxbb",
  volume: "zxxcc",
  oldNew: "zxxxjjc",
} as const;

export const STAGE_ORDER = [
  "小学",
  "初中",
  "小学（五·四学制）",
  "初中（五·四学制）",
  "高中",
  "特殊教育",
];
export const GRADE_ORDER = [
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
  "高一",
  "高二",
  "高三",
];
export const VOLUME_ORDER = ["上册", "下册", "全一册"];
export const OLD_NEW_ORDER = ["新教材", "旧教材"];

export const LOGIN_URL = "https://basic.smartedu.cn/tchMaterial";
export const CLASSROOM_URL = "https://basic.smartedu.cn/syncClassroom";
export const AUTH_URL = "https://auth.smartedu.cn/uias/login";
