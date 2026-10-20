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
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    default_locale: "zh_CN",
    version: "0.1.32",
    permissions: ["storage", "downloads", "tabs"],
    host_permissions: [
      "https://basic.smartedu.cn/*",
      "https://www.smartedu.cn/*",
      "https://auth.smartedu.cn/*",
      "https://*.ykt.cbern.com.cn/*",
    ],
    action: {
      default_title: "__MSG_actionTitle__",
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
