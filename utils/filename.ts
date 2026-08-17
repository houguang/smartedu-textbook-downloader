import { DIMENSIONS, type Textbook } from "./types";

const INVALID = /[\\/:*?"<>|]/g;

export function sanitizeName(name: string): string {
  const cleaned =
    name
      .replace(INVALID, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim() || "未命名";
  if (cleaned.length <= 120) return cleaned;
  return cleaned.slice(0, 120).replace(/[. ]+$/g, "") || "未命名";
}

export function buildFilterFolder(names: Array<string | null | undefined>): string {
  return names.map((name) => sanitizeName(name?.trim() || "未分类")).join("/");
}

export function bookFolderPath(book: Textbook): string {
  return buildFilterFolder([
    book.tagMap[DIMENSIONS.stage]?.name,
    book.tagMap[DIMENSIONS.subject]?.name,
    book.tagMap[DIMENSIONS.edition]?.name,
  ]);
}

export function buildDownloadPath(name: string, ext: string, folder = ""): string {
  const file = `${sanitizeName(name)}.${ext.replace(/^\./, "")}`;
  return folder ? `${folder}/${file}` : file;
}

export function downloadBasename(path: string): string {
  return path.split("/").pop() || path;
}
