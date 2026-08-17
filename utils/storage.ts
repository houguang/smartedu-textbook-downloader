import type { TokenCredentials } from "./types";

const CREDENTIALS_KEY = "credentials";
const DEFAULT_TAG_KEY = "lastDefaultTag";
const SETTINGS_KEY = "settings";

export async function saveCredentials(credentials: TokenCredentials | null): Promise<void> {
  await browser.storage.local.set({ [CREDENTIALS_KEY]: credentials });
}

export async function loadCredentials(): Promise<TokenCredentials | null> {
  const data = await browser.storage.local.get(CREDENTIALS_KEY);
  const value = data[CREDENTIALS_KEY] as TokenCredentials | null | undefined;
  if (!value?.access_token) return null;
  return {
    access_token: value.access_token,
    mac_key: value.mac_key || null,
    diff: Number(value.diff) || 0,
  };
}

export async function saveDefaultTag(tag: string | null): Promise<void> {
  await browser.storage.local.set({ [DEFAULT_TAG_KEY]: tag });
}

export async function loadDefaultTag(): Promise<string | null> {
  const data = await browser.storage.local.get(DEFAULT_TAG_KEY);
  return (data[DEFAULT_TAG_KEY] as string | undefined) || null;
}

export async function loadSettings(): Promise<{ addBookmarks: boolean; downloadAudio: boolean }> {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  const value = data[SETTINGS_KEY] as { addBookmarks?: boolean; downloadAudio?: boolean } | undefined;
  return {
    addBookmarks: value?.addBookmarks ?? false,
    downloadAudio: value?.downloadAudio ?? false,
  };
}

export async function saveSettings(settings: { addBookmarks: boolean; downloadAudio: boolean }): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export function onStorageChanged(callback: () => void): () => void {
  const listener = (_changes: unknown, area: string) => {
    if (area === "local") callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
