import type { TokenCredentials } from "./types";

const NONCE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateNonce(diff = 0): string {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    const index = Math.min(35, Math.max(0, Math.ceil(35 * Math.random())));
    suffix += NONCE_ALPHABET[index] ?? "0";
  }
  return `${Date.now() + diff}:${suffix}`;
}

export function signatureString(url: string, method: string, nonce: string): string {
  const parsed = new URL(url);
  const relative = decodeURIComponent(parsed.pathname) + (parsed.search || "");
  return `${nonce}\n${method.toUpperCase()}\n${relative}\n${parsed.hostname}\n`;
}

export async function signMac(text: string, macKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(macKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function buildNdAuth(
  url: string,
  credentials: TokenCredentials | null,
  method = "GET",
): Promise<string> {
  const tokenId = credentials?.access_token || "0";
  if (!credentials?.mac_key) {
    return `MAC id="${tokenId}",nonce="0",mac="0"`;
  }
  const nonce = generateNonce(credentials.diff || 0);
  const mac = await signMac(signatureString(url, method, nonce), credentials.mac_key);
  return `MAC id="${tokenId}",nonce="${nonce}",mac="${mac}"`;
}

export function parseCredentialsFromLocalStorage(): TokenCredentials | null {
  const authKey = Object.keys(localStorage).find((key) => key.startsWith("ND_UC_AUTH"));
  if (!authKey) return null;
  try {
    const raw = localStorage.getItem(authKey);
    if (!raw) return null;
    const wrapped = JSON.parse(raw) as { value?: string } | string;
    const valueRaw = typeof wrapped === "string" ? wrapped : wrapped.value;
    if (!valueRaw) return null;
    const value = typeof valueRaw === "string" ? JSON.parse(valueRaw) : valueRaw;
    const accessToken = String(value.access_token || "").trim();
    if (!accessToken) return null;
    return {
      access_token: accessToken,
      mac_key: String(value.mac_key || "").trim() || null,
      diff: Number(value.diff) || 0,
    };
  } catch {
    return null;
  }
}

export function isLoggedIn(credentials: TokenCredentials | null | undefined): boolean {
  return Boolean(credentials?.access_token);
}
