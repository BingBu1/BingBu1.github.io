# 像素渡口

一个无需后端、可直接部署的批量图片混淆与解混淆网站。

## 使用

把整个目录部署到任意静态网站服务即可使用（GitHub Pages、Cloudflare Pages、Netlify 或自己的服务器）。本地预览建议用任意静态服务器打开，例如 VS Code Live Server、`python -m http.server` 或 Vite preview。

- 支持多选、拖放、选择文件夹和粘贴图片
- 支持直接导入 ZIP，并将压缩包内图片批量加入处理队列
- 支持批量混淆、批量解混淆、单张下载和 ZIP 打包下载
- 点击眼睛默认直接查看原图大图，并可切换混淆/解混淆后的结果
- 支持按队列顺序从上到下或从左到右合成长图，并可将长图直接混淆/解混淆
- 超长图片自动使用适合宽度的滚动预览，避免整张缩成模糊小图
- 算法兼容 `singularpoint.cn/hideImg1.html` 的 Gilbert 曲线像素重排方式
- 所有处理均在本地浏览器完成，不上传图片
- 桌面端使用后台线程并发处理；手机和平板自动降低并发以控制内存占用

## 浏览器建议

建议使用较新的 Chrome、Edge、Safari 或 Firefox。超大图片和大量图片会占用较多设备内存，移动设备上建议分批处理；为避免浏览器因内存不足退出，手机端会拒绝超过约 1600 万像素的单张图片。

## 目录结构

- `index.html`：页面结构和模板
- `scripts/main.js`：应用入口
- `scripts/app/`：DOM 获取、全局状态、事件绑定和应用组装
- `scripts/features/`：文件队列、长图合并、下载等业务功能
- `scripts/processing/`：Gilbert 曲线算法、图片混淆/解混淆和 Worker
- `scripts/ui/`：队列渲染、预览弹窗、Toast
- `scripts/utils/`：文件类型、画布、下载、格式化工具
- `scripts/zip/`：ZIP 导入解析与 ZIP 导出打包
- `styles/main.css`：样式入口
- `styles/components/`：控制面板、队列、底部栏、弹窗等组件样式
- `styles/responsive.css`：手机和平板适配
