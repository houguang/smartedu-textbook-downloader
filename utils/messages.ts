import type { TokenCredentials } from "./types";

export type RuntimeMessage =
  | { type: "TOKEN_UPDATE"; credentials: TokenCredentials | null }
  | { type: "DEFAULT_TAG"; tag: string | null }
  | { type: "OPEN_OPTIONS" }
  | { type: "REGISTER_DOWNLOAD_NAME"; url: string; filename: string };
