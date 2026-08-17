import { loadCredentials, saveCredentials, saveDefaultTag } from "../utils/storage";
import type { RuntimeMessage } from "../utils/messages";

interface DeterminingFilenameEvent {
  addListener: (
    callback: (
      item: { url?: string },
      suggest: (suggestion?: { filename?: string; conflictAction?: "uniquify" }) => void,
    ) => void,
  ) => void;
}

function chromeDeterminingFilename(): DeterminingFilenameEvent | undefined {
  return (globalThis as { chrome?: { downloads?: { onDeterminingFilename?: DeterminingFilenameEvent } } }).chrome
    ?.downloads?.onDeterminingFilename;
}

export default defineBackground(() => {
  const pendingNames = new Map<string, string>();
  const pendingQueue: string[] = [];

  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === "download-keepalive") return;
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === "TOKEN_UPDATE") {
      void saveCredentials(message.credentials);
    }
    if (message.type === "DEFAULT_TAG") {
      void saveDefaultTag(message.tag);
    }
    if (message.type === "OPEN_OPTIONS") {
      void browser.runtime.openOptionsPage();
    }
    if (message.type === "REGISTER_DOWNLOAD_NAME") {
      pendingNames.set(message.url, message.filename);
      pendingQueue.push(message.filename);
      return Promise.resolve({ ok: true });
    }
  });

  chromeDeterminingFilename()?.addListener((item, suggest) => {
    try {
      const byUrl = item.url ? pendingNames.get(item.url) : undefined;
      let filename = byUrl;
      if (byUrl && item.url) {
        pendingNames.delete(item.url);
        const index = pendingQueue.indexOf(byUrl);
        if (index >= 0) pendingQueue.splice(index, 1);
      } else {
        filename = pendingQueue.shift();
      }
      if (filename) {
        suggest({ filename, conflictAction: "uniquify" });
        return;
      }
    } catch {
      /* Chrome 要求必须调用一次 suggest，否则下载会卡住 */
    }
    suggest();
  });

  browser.runtime.onInstalled.addListener(() => {
    void loadCredentials();
  });
});
