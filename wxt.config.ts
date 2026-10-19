import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "智慧教育平台教材下载",
    description: "按分类筛选并批量下载智慧教育平台电子教材与课程教学 PDF，支持在线预览，仅供个人学习。",
    version: "0.1.31",
    permissions: ["storage", "downloads", "tabs"],
    host_permissions: [
      "https://basic.smartedu.cn/*",
      "https://www.smartedu.cn/*",
      "https://auth.smartedu.cn/*",
      "https://*.ykt.cbern.com.cn/*",
    ],
    action: {
      default_title: "打开教材下载",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    browser_specific_settings: {
      gecko: {
        id: "smartedu-textbook-downloader@houguang",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },
});
