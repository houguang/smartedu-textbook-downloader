# 智慧教育平台教材下载

<img src="assets/icon.png" width="96" height="96" alt="教材下载" />

Chrome 扩展：在独立 Options 页面按学段、年级、学科、版本浏览并批量下载[国家中小学智慧教育平台](https://basic.smartedu.cn/tchMaterial/)电子教材。

基于 [WXT](https://wxt.dev) + Vue 3 + Tailwind CSS。下载原理参考 [tchMaterial-parser](https://github.com/happycola233/tchMaterial-parser)：读取平台公开的教材目录 JSON，再用登录后的 `X-ND-AUTH` 从私有 CDN 拉取 PDF / 配套音频。

## 商店安装

- [Chrome 网上应用店](https://chromewebstore.google.com/detail/kelaaeiakeloimbllmnfinbanbljimee)
- [Firefox 附加组件](https://addons.mozilla.org/addon/%E6%99%BA%E6%85%A7%E6%95%99%E8%82%B2%E5%B9%B3%E5%8F%B0%E6%95%99%E6%9D%90%E4%B8%8B%E8%BD%BD/)
- [Microsoft Edge 扩展](https://microsoftedge.microsoft.com/addons/detail/pfjbeiflbihgkhfliblglfcjfdponbhh)

## 截图

主界面：按分类筛选教材、勾选后批量下载，支持在线查看。

![主界面](docs/screenshot.png)

下载队列：显示总体进度与每本教材的完成状态。

![下载队列](docs/screenshot-download.png)

## 使用方法

1. 安装依赖：

```bash
pnpm install
```

2. 开发（WXT 会启动 Chrome 并加载扩展）：

```bash
pnpm dev
```

3. 生产构建：

```bash
pnpm build
```

产物在 `.output/chrome-mv3`。也可以打开 `chrome://extensions`，开启开发者模式，加载该目录。

4. 在浏览器登录 [智慧教育平台](https://auth.smartedu.cn/uias/login)，然后点击扩展图标打开下载页。扩展会从平台页面自动读取登录凭据，无需手动复制 Token。

5. 按学段 / 年级 / 学科 / 版本 / 册次筛选，勾选教材后下载。每本书都会保存到 `学段/学科/版本/书名.pdf`（例如 `小学/语文/统编版/`），与当前是否勾选分类无关。

## 免责声明

- 本工具只提供下载便利，不存储、不托管、不分发任何教材内容。资源均直接来自国家中小学智慧教育平台。
- 教材版权归原平台及相关权利人所有。请仅用于个人学习与教学参考，禁止商业用途或二次分发。
- 使用时请遵守平台服务条款及所在地区法律法规。因使用本工具产生的后果由使用者自行承担。
- 本项目与国家中小学智慧教育平台没有任何隶属或合作关系。
