import { ProxyAgent, setGlobalDispatcher, fetch as ufetch } from "undici";
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "http://127.0.0.1:7892";
setGlobalDispatcher(new ProxyAgent(proxy));
globalThis.fetch = ufetch;
console.error("[proxy-preload] using", proxy);
