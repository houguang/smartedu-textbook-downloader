import { parseCredentialsFromLocalStorage } from "../utils/auth";
import type { RuntimeMessage } from "../utils/messages";

function readDefaultTag(): string | null {
  try {
    const url = new URL(location.href);
    return url.searchParams.get("defaultTag");
  } catch {
    return null;
  }
}

function sync(): void {
  const credentials = parseCredentialsFromLocalStorage();
  const tag = readDefaultTag();
  const tokenMessage: RuntimeMessage = { type: "TOKEN_UPDATE", credentials };
  const tagMessage: RuntimeMessage = { type: "DEFAULT_TAG", tag };
  void browser.runtime.sendMessage(tokenMessage).catch(() => undefined);
  void browser.runtime.sendMessage(tagMessage).catch(() => undefined);
}

export default defineContentScript({
  matches: [
    "https://basic.smartedu.cn/*",
    "https://www.smartedu.cn/*",
    "https://auth.smartedu.cn/*",
  ],
  runAt: "document_idle",
  main() {
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    setInterval(sync, 8000);
  },
});
