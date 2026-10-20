import { readFileSync } from "node:fs";
import { ProxyAgent, setGlobalDispatcher, fetch } from "undici";

const proxy = process.env.HTTPS_PROXY || "http://127.0.0.1:7892";
const agent = new ProxyAgent({
  uri: proxy,
  connect: { timeout: 60000 },
  headersTimeout: 120000,
  bodyTimeout: 300000,
});
setGlobalDispatcher(agent);

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1);
  }
  return out;
}

const env = { ...loadEnv(".env.submit"), ...process.env };
const extensionId = env.CHROME_EXTENSION_ID;
const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: node chrome-submit-proxy.mjs <zip>");
  process.exit(2);
}

console.log("proxy=", proxy);
console.log("ZIP=", zipPath);
console.log("EXT=", extensionId);

async function withRetry(label, fn, times = 3) {
  let last;
  for (let i = 1; i <= times; i++) {
    try {
      console.log(label, "attempt", i);
      return await fn();
    } catch (e) {
      last = e;
      console.error(label, "fail", i, e.cause?.code || e.message);
      if (i < times) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}

console.log("1) OAuth token...");
const tokenJson = await withRetry("oauth", async () => {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.CHROME_CLIENT_ID,
      client_secret: env.CHROME_CLIENT_SECRET,
      refresh_token: env.CHROME_REFRESH_TOKEN,
      grant_type: "refresh_token",
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    }),
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) throw new Error("TOKEN FAIL " + tokenRes.status + " " + tokenText.slice(0, 500));
  return JSON.parse(tokenText);
});
const accessToken = tokenJson.access_token;
console.log("token ok, expires_in=", tokenJson.expires_in);

const zipBuf = readFileSync(zipPath);
console.log("zip bytes=", zipBuf.length);

const uploadHosts = [
  `https://chromewebstore.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`,
  `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`,
];

let uploadJson = null;
for (const uploadUrl of uploadHosts) {
  console.log("2) Upload zip via", uploadUrl);
  try {
    const uploadRes = await withRetry("upload", async () => {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-goog-api-version": "2",
          "Content-Type": "application/zip",
        },
        body: zipBuf,
      });
      const text = await res.text();
      console.log("upload status", res.status);
      console.log(text.slice(0, 1000));
      if (!res.ok) throw new Error("upload http " + res.status + " " + text.slice(0, 400));
      return JSON.parse(text);
    }, 2);
    uploadJson = uploadRes;
    break;
  } catch (e) {
    console.error("host failed:", e.cause?.code || e.message);
  }
}

if (!uploadJson) {
  console.error("UPLOAD_FAILED_ALL_HOSTS");
  process.exit(1);
}
if (uploadJson.uploadState === "FAILURE" || uploadJson.uploadState === "NOT_FOUND") {
  console.error("uploadState bad", uploadJson.uploadState, JSON.stringify(uploadJson).slice(0, 500));
  process.exit(1);
}
console.log("uploadState=", uploadJson.uploadState, "itemError=", uploadJson.itemError || null);

const pubHosts = [
  `https://chromewebstore.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
  `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
];

let published = false;
for (const pubUrl of pubHosts) {
  console.log("3) Publish via", pubUrl);
  try {
    const pubRes = await withRetry("publish", async () => {
      const res = await fetch(pubUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-goog-api-version": "2",
          "Content-Length": "0",
        },
      });
      const text = await res.text();
      console.log("publish status", res.status);
      console.log(text.slice(0, 1000));
      if (!res.ok) throw new Error("publish http " + res.status + " " + text.slice(0, 400));
      return text;
    }, 2);
    published = true;
    break;
  } catch (e) {
    console.error("publish host failed:", e.cause?.code || e.message);
  }
}

if (!published) {
  console.error("PUBLISH_FAILED");
  process.exit(1);
}
console.log("CHROME_SUBMIT_OK");
