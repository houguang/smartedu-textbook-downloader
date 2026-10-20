import { readFileSync } from "node:fs";
import { ProxyAgent, setGlobalDispatcher, fetch } from "undici";

const proxy = process.env.HTTPS_PROXY || "http://127.0.0.1:7892";
setGlobalDispatcher(new ProxyAgent({
  uri: proxy,
  connect: { timeout: 90000 },
  headersTimeout: 180000,
  bodyTimeout: 180000,
}));

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

const env = loadEnv(".env.submit");
const extensionId = env.CHROME_EXTENSION_ID;
console.log("EXT=", extensionId, "proxy=", proxy);

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_id: env.CHROME_CLIENT_ID,
    client_secret: env.CHROME_CLIENT_SECRET,
    refresh_token: env.CHROME_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }),
});
const tokenText = await tokenRes.text();
if (!tokenRes.ok) {
  console.error("TOKEN FAIL", tokenRes.status, tokenText.slice(0, 500));
  process.exit(1);
}
const accessToken = JSON.parse(tokenText).access_token;
console.log("token ok");

// Check draft status first
const statusUrls = [
  `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}?projection=DRAFT`,
  `https://chromewebstore.googleapis.com/chromewebstore/v1.1/items/${extensionId}?projection=DRAFT`,
];
for (const u of statusUrls) {
  try {
    console.log("status GET", u);
    const r = await fetch(u, {
      headers: { Authorization: "Bearer " + accessToken, "x-goog-api-version": "2" },
    });
    const t = await r.text();
    console.log("status", r.status, t.slice(0, 800));
    break;
  } catch (e) {
    console.error("status fail", e.cause?.code || e.message);
  }
}

const pubUrls = [
  `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
  `https://chromewebstore.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
];

for (let attempt = 1; attempt <= 6; attempt++) {
  for (const pubUrl of pubUrls) {
    try {
      console.log("publish attempt", attempt, pubUrl);
      const res = await fetch(pubUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "x-goog-api-version": "2",
          "Content-Length": "0",
        },
      });
      const text = await res.text();
      console.log("publish status", res.status);
      console.log(text.slice(0, 1500));
      if (res.ok) {
        console.log("CHROME_PUBLISH_OK");
        process.exit(0);
      }
      // 400 with already published / in review might still be informative
      if (res.status === 400 || res.status === 403) {
        console.log("CHROME_PUBLISH_HTTP_ERROR_BODY_ABOVE");
        process.exit(1);
      }
    } catch (e) {
      console.error("publish err", e.cause?.code || e.message);
    }
  }
  await new Promise((r) => setTimeout(r, 3000 * attempt));
}
console.error("PUBLISH_GAVE_UP");
process.exit(1);
