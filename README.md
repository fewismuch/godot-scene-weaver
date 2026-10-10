# Atlas Editor

浏览器中的 Godot Atlas 区域编辑器，附带图片处理工具。

## 启动和打包

```sh
npm install
npm run dev
npm run build
npm run preview
```

`npm run dev` 启动 Vite 开发服务器；`npm run build` 将编辑器和图片处理工具都打包到 `dist/`。打包结果是静态文件，可以部署到静态站点。`npm test` 运行图片处理核心测试。

## GitHub Pages

将代码推送到 `main` 后，`.github/workflows/pages.yml` 会运行测试、构建，并把 `dist/` 发布到 GitHub Pages。首次使用时，在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。也可以在 **Actions → Deploy to GitHub Pages** 中手动运行工作流。

部署成功后，编辑器位于 <https://fewismuch.github.io/godot-scene-weaver/>，图片处理工具位于 <https://fewismuch.github.io/godot-scene-weaver/image-tool.html>。

## 图片处理工具

在编辑器顶部点击「图片处理工具」，或打开 `image-tool.html`。

三个设置区可以折叠。背景颜色默认收起，裁剪网格和逐格像素化默认展开；边缘和间隔在裁剪区内单独折叠，关闭自动识别时会展开供手动调整。

1. 上传图片。默认使用左上角颜色作为背景色，也可以从原图点选。背景颜色始终用于自动识别间隔；「去除背景色」默认关闭。开启后，去背景容差控制颜色匹配范围，只移除与图片边缘相连的纯色背景，并在原图预览中实时显示效果。
2. 填入原图的列数、行数。上传后原图预览会显示自动识别的裁剪线，并把左右上下边缘及平均列、行间隔填入表单。「间隔识别颜色容差」独立于去背景的颜色容差，只影响裁剪边界识别。若自动识别与行列数不符，会显示橙色等分线，仍可按这些线生成。关闭自动模式后可修改边缘和间隔，黄色虚线会随数值实时移动，暗色遮罩显示跳过的区域。
3. 每格按网格裁剪，保留格内透明边距；关闭去背景时，原图中不透明的背景会保留。然后把完整裁剪格放大到目标尺寸的 4 倍，做网格校正，并选择中心取样、中位数或多数色。可设置像素化后的饱和度、对比度，100% 保持原色；调整会同时作用于整张图集和 ZIP 中的小图。输出尺寸是 `(列数 × 每格宽度) × (行数 × 每格高度)`，不加边框或留白。
4. 在两个画布上，触控板双指滚动可移动放大后的图像，捏合可缩放；也可点击 100%、200%、300% 或「适应」，当前预设会高亮。生成后有两个下载按钮：整张像素图集 PNG，以及按目标格子大小切开的独立像素小图 ZIP。ZIP 中每个 PNG 都对应原图集中的一个行列位置。

像素化采用 [perfectPixel Web Demo](https://github.com/theamusing/perfectPixel_webdemo) 的固定网格处理思路：Sobel 边缘投影、局部网格线校正，以及中心、中位数或多数色取样。因为小图输出尺寸已由用户指定，这个路径无需自动 FFT 网格数量检测。处理完全在本地浏览器内进行。
