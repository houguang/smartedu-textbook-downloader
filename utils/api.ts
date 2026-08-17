import { buildNdAuth } from "./auth";
import type { Chapter, ResourceFile, TextbookDetail, TokenCredentials } from "./types";

const PRIVATE_CDN = "https://r1-ndr-private.ykt.cbern.com.cn";
const DETAIL_URL = (id: string) =>
  `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/${id}.json`;
const AUDIO_URL = (id: string) =>
  `https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/${id}/relation_audios.json`;
const TREE_URL = (ebookId: string) =>
  `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/national_lesson/trees/${ebookId}.json`;

interface TiItem {
  ti_file_flag?: string;
  ti_format?: string;
  ti_is_source_file?: boolean;
  ti_size?: number;
  ti_storage?: string;
  ti_storages?: string[];
}

interface RawDetail {
  id?: string;
  title?: string;
  global_title?: Record<string, string> | string;
  tag_list?: Array<{ tag_dimension_id?: string; tag_name?: string }>;
  ti_items?: TiItem[];
}

function zhText(value: Record<string, string> | string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value["zh-CN"] || value["en"] || Object.values(value)[0] || fallback;
}

function resolveStorage(item: TiItem | undefined): { url: string; fallbackUrls: string[] } | null {
  if (!item) return null;
  const fallbackUrls = (item.ti_storages || []).filter(Boolean);
  let url = item.ti_storage || "";
  if (url.startsWith("cs_path:${ref-path}")) {
    url = url.replace("cs_path:${ref-path}", PRIVATE_CDN);
  }
  if (!url) url = fallbackUrls[0] || "";
  if (!url) return null;
  const unique = [...new Set([url, ...fallbackUrls])];
  const primary = unique[0];
  if (!primary) return null;
  return { url: primary, fallbackUrls: unique.slice(1) };
}

function pickSourceFile(items: TiItem[]): TiItem | undefined {
  return (
    items.find((item) => item.ti_is_source_file && item.ti_format !== "folder") ||
    items.find((item) => ["source", "pdf"].includes(item.ti_file_flag || "") && item.ti_format !== "folder")
  );
}

function pickMapping(items: TiItem[]): TiItem | undefined {
  return items.find((item) => item.ti_file_flag === "ebook_mapping");
}

export async function signedHeaders(
  url: string,
  credentials: TokenCredentials | null,
): Promise<HeadersInit> {
  const ndAuth = await buildNdAuth(url, credentials);
  return {
    Authorization: `Bearer ${credentials?.access_token || "0"}`,
    "X-ND-AUTH": ndAuth,
  };
}

export async function fetchJson<T>(url: string, credentials?: TokenCredentials | null): Promise<T> {
  const headers = credentials ? await signedHeaders(url, credentials) : undefined;
  const response = await fetch(url, {
    headers,
    referrer: "https://basic.smartedu.cn/",
  });
  if (!response.ok) throw new Error(`请求失败 HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchBinary(
  url: string,
  credentials: TokenCredentials | null,
  onProgress?: (ratio: number) => void,
): Promise<ArrayBuffer> {
  const headers = await signedHeaders(url, credentials);
  const response = await fetch(url, {
    headers,
    referrer: "https://basic.smartedu.cn/",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401 || text.includes("401")) {
      throw new Error("鉴权失败，请重新登录智慧教育平台");
    }
    throw new Error(`下载失败 HTTP ${response.status}`);
  }
  if (!onProgress || !response.body) return await response.arrayBuffer();

  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      if (total) onProgress(Math.min(0.99, received / total));
    }
  }
  const output = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(1);
  return output.buffer;
}

async function fetchBinaryWithFallback(
  urls: string[],
  credentials: TokenCredentials | null,
  onProgress?: (ratio: number) => void,
): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await fetchBinary(url, credentials, onProgress);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("所有镜像均下载失败");
}

function toResource(title: string, item: TiItem, format = "pdf"): ResourceFile | undefined {
  const storage = resolveStorage(item);
  if (!storage) return undefined;
  return {
    title,
    url: storage.url,
    fallbackUrls: storage.fallbackUrls,
    format: item.ti_format || format,
    size: item.ti_size,
  };
}

interface TreeNode {
  id?: string;
  title?: string;
  child_nodes?: TreeNode[];
}

function processTreeNodes(
  nodes: TreeNode[] | undefined,
  pageMap: Map<string, number>,
): Chapter[] {
  if (!nodes?.length) return [];
  return nodes.map((node) => ({
    title: node.title || "未命名章节",
    page_index: node.id ? pageMap.get(node.id) ?? null : null,
    children: processTreeNodes(node.child_nodes, pageMap),
  }));
}

interface MappingData {
  ebook_id?: string;
  mappings?: Array<{ node_id?: string; page_number?: number }>;
}

async function loadChapters(
  mappingUrl: string,
  mappingFallback: string[],
  credentials: TokenCredentials | null,
): Promise<Chapter[]> {
  const mapData = await fetchJson<MappingData>(mappingUrl, credentials).catch(async () => {
    for (const url of mappingFallback) {
      try {
        return await fetchJson<MappingData>(url, credentials);
      } catch {
        /* try next */
      }
    }
    return null;
  });
  if (!mapData) return [];

  const pageMap = new Map<string, number>();
  for (const item of mapData.mappings || []) {
    if (item.node_id) pageMap.set(item.node_id, item.page_number || 1);
  }
  if (!mapData.ebook_id) {
    return [...pageMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([_, page], index) => ({
        title: `第 ${index + 1} 节 (P${page})`,
        page_index: page,
      }));
  }

  try {
    const treeData = await fetchJson<TreeNode[] | { child_nodes?: TreeNode[] }>(
      TREE_URL(mapData.ebook_id),
      credentials,
    );
    const nodes = Array.isArray(treeData) ? treeData : treeData.child_nodes;
    const chapters = processTreeNodes(nodes, pageMap);
    if (chapters.length) return chapters;
  } catch {
    /* fallback below */
  }

  return [...pageMap.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([_, page], index) => ({
      title: `第 ${index + 1} 节 (P${page})`,
      page_index: page,
    }));
}

function parseAudio(raw: Record<string, unknown>, rootTitle?: string): ResourceFile | null {
  const titleData = raw.global_title as Record<string, string> | string | undefined;
  const title = zhText(titleData, (raw.title as string) || (raw.id as string) || "配套音频");
  const items = (raw.ti_items as TiItem[] | undefined) || [];
  const audioItem =
    items.find((item) => ["href", "source"].includes(item.ti_file_flag || "") && item.ti_format === "mp3") ||
    items.find((item) => item.ti_format === "mp3");
  if (!audioItem) return null;
  const resource = toResource(rootTitle ? `${rootTitle} - ${title}` : title, audioItem, "mp3");
  return resource || null;
}

export async function fetchTextbookDetail(
  id: string,
  credentials: TokenCredentials | null,
  options?: { bookmarks?: boolean },
): Promise<TextbookDetail> {
  const data = await fetchJson<RawDetail>(DETAIL_URL(id));
  const title = zhText(data.global_title, data.title || id);
  const edition = data.tag_list?.find((tag) => tag.tag_dimension_id === "zxxbb")?.tag_name;
  const items = data.ti_items || [];
  const pdfItem = pickSourceFile(items);
  const mappingItem = pickMapping(items);
  const pdf = pdfItem ? toResource(title, pdfItem, pdfItem.ti_format || "pdf") : undefined;
  const mapping = mappingItem ? resolveStorage(mappingItem) : null;

  let chapters: Chapter[] = [];
  if (options?.bookmarks && mapping) {
    try {
      chapters = await loadChapters(mapping.url, mapping.fallbackUrls, credentials);
    } catch {
      chapters = [];
    }
  }

  let audios: ResourceFile[] = [];
  try {
    const audioJson = await fetchJson<Record<string, unknown>[]>(AUDIO_URL(id));
    audios = (audioJson || []).map((item) => parseAudio(item, title)).filter(Boolean) as ResourceFile[];
  } catch {
    audios = [];
  }

  return {
    id: data.id || id,
    title,
    edition,
    pdf,
    mappingUrl: mapping?.url,
    mappingFallbackUrls: mapping?.fallbackUrls,
    audios,
    chapters,
  };
}

function toPrivateCdn(url: string): string {
  return url.replace(
    /https:\/\/r(\d)-ndr(?:-private)?\.ykt\.cbern\.com\.cn/i,
    "https://r$1-ndr-private.ykt.cbern.com.cn",
  );
}

export function withAccessToken(url: string, accessToken: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("accessToken", accessToken);
  return parsed.toString();
}

function pickPdfViewUrl(urls: string[]): string | undefined {
  const privateUrls = urls.filter(Boolean).map(toPrivateCdn);
  return (
    privateUrls.find((item) => item.includes("r3-ndr-private")) ||
    privateUrls.find((item) => item.includes("ndr-private")) ||
    privateUrls[0]
  );
}

export async function fetchPdfViewUrl(
  id: string,
  credentials: TokenCredentials | null,
): Promise<string> {
  if (!credentials?.access_token) throw new Error("请先登录智慧教育平台");
  const data = await fetchJson<RawDetail>(DETAIL_URL(id));
  const storage = resolveStorage(pickSourceFile(data.ti_items || []));
  if (!storage) throw new Error("未找到教材 PDF");
  const url = pickPdfViewUrl([storage.url, ...storage.fallbackUrls]);
  if (!url) throw new Error("未找到教材 PDF");
  return withAccessToken(url, credentials.access_token);
}

export { fetchBinaryWithFallback };
