import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from "pdf-lib";
import type { Chapter } from "./types";

interface OutlineNode {
  title: string;
  pageIndex: number;
  children: OutlineNode[];
}

function toNodes(chapters: Chapter[], pageCount: number): OutlineNode[] {
  const result: OutlineNode[] = [];
  for (const chapter of chapters) {
    const rawIndex = chapter.page_index == null ? 0 : chapter.page_index - 1;
    const pageIndex = Math.min(Math.max(rawIndex, 0), Math.max(pageCount - 1, 0));
    result.push({
      title: chapter.title || "未命名章节",
      pageIndex,
      children: toNodes(chapter.children || [], pageCount),
    });
  }
  return result;
}

export async function injectOutlines(
  pdfBytes: ArrayBuffer | Uint8Array,
  chapters: Chapter[],
): Promise<Uint8Array> {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  if (!chapters.length) return bytes;
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  if (!pages.length) return await doc.save();

  const nodes = toNodes(chapters, pages.length);
  const context = doc.context;

  function createItem(node: OutlineNode, parentRef: PDFRef): { ref: PDFRef; count: number } {
    const page = pages[Math.min(node.pageIndex, pages.length - 1)]!;
    const dest = context.obj([page.ref, "Fit"]);
    const item = context.obj({
      Title: PDFHexString.fromText(node.title),
      Parent: parentRef,
      Dest: dest,
    });
    const ref = context.register(item);
    let descendant = 0;
    if (node.children.length) {
      const childRefs: PDFRef[] = [];
      for (const child of node.children) {
        const created = createItem(child, ref);
        childRefs.push(created.ref);
        descendant += created.count;
      }
      const firstChild = childRefs[0];
      const lastChild = childRefs[childRefs.length - 1];
      if (firstChild && lastChild) {
        item.set(PDFName.of("First"), firstChild);
        item.set(PDFName.of("Last"), lastChild);
      }
      item.set(PDFName.of("Count"), PDFNumber.of(descendant));
      for (let i = 0; i < childRefs.length; i++) {
        const current = childRefs[i];
        const prev = childRefs[i - 1];
        const next = childRefs[i + 1];
        if (!current) continue;
        const childDict = context.lookup(current, PDFDict);
        if (prev) childDict.set(PDFName.of("Prev"), prev);
        if (next) childDict.set(PDFName.of("Next"), next);
      }
    }
    return { ref, count: 1 + descendant };
  }

  const outlinesDict = context.obj({ Type: "Outlines" });
  const outlinesRef = context.register(outlinesDict);
  const topRefs: PDFRef[] = [];
  let total = 0;
  for (const node of nodes) {
    const created = createItem(node, outlinesRef);
    topRefs.push(created.ref);
    total += created.count;
  }
  if (topRefs.length) {
    const first = topRefs[0];
    const last = topRefs[topRefs.length - 1];
    if (first && last) {
      outlinesDict.set(PDFName.of("First"), first);
      outlinesDict.set(PDFName.of("Last"), last);
    }
    outlinesDict.set(PDFName.of("Count"), PDFNumber.of(total));
    for (let i = 0; i < topRefs.length; i++) {
      const current = topRefs[i];
      const prev = topRefs[i - 1];
      const next = topRefs[i + 1];
      if (!current) continue;
      const dict = context.lookup(current, PDFDict);
      if (prev) dict.set(PDFName.of("Prev"), prev);
      if (next) dict.set(PDFName.of("Next"), next);
    }
  }

  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  return await doc.save();
}
