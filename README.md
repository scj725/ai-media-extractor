# AI Media Extractor

从豆包和千问对话、分享页面提取图片与视频资源的本地工具。项目提供本地 Web/API 服务、Chrome/Edge/Firefox 扩展和 Tampermonkey 脚本。

仓库地址：[scj725/ai-media-extractor](https://github.com/scj725/ai-media-extractor)

## 功能

- 提取豆包分享页中的图片资源。
- 提取豆包视频；浏览器扩展会使用当前登录态请求平台返回的无水印播放流。
- 提取千问聊天页和分享页中的图片资源。
- 提取千问页面播放器已提供的视频地址。
- 可在扩展弹窗中开启“检测到新素材时自动下载”；该选项默认关闭，并保存在浏览器本地，扩展更新不会重置。
- 提供本地 Web 页面，以及 `POST` / `GET` 形式的图片、视频解析 API。
- 支持 Windows 系统代理和 `HTTP_PROXY`、`HTTPS_PROXY` 环境变量。

## 支持范围

| 平台 | 页面类型 | 本地 API | 浏览器扩展 / 脚本 |
| --- | --- | --- | --- |
| 豆包 | `www.doubao.com/thread/*` | 图片、视频 | 图片、视频 |
| 豆包 | `www.doubao.com/chat/*` | 不适用 | 图片、视频 |
| 千问 | `www.qianwen.com/chat/*` | 不适用 | 图片、视频 |
| 千问 | `www.qianwen.com/share/chat/*` | 图片 | 图片、视频 |
| 千问 | `qianwen.my.cn/share/chat/*` | 图片、视频 | 图片、视频 |

本地 API 通过公开分享链接请求资源；浏览器扩展和脚本运行在已登录页面中，因此适合需要页面登录态的豆包视频和普通千问聊天页。

## 快速开始

### 使用 uv

```powershell
git clone https://github.com/scj725/ai-media-extractor.git
cd ai-media-extractor
uv sync
uv run uvicorn app:app --host 127.0.0.1 --port 8000
```

### 使用 pip

```powershell
git clone https://github.com/scj725/ai-media-extractor.git
cd ai-media-extractor
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

启动后：

- Web 工具：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`

### Docker 本地构建

```powershell
docker build -t ai-media-extractor .
docker run --rm -p 8000:8000 --name ai-media-extractor ai-media-extractor
```

启动后访问 `http://127.0.0.1:8000`。项目没有提供 Docker Hub 镜像，需要在本地构建。

## API

### 解析图片

```http
POST /parse
Content-Type: application/json
```

```json
{
  "url": "https://www.doubao.com/thread/xxxxxxxx",
  "return_raw": false
}
```

### 解析视频

```http
POST /parse-video
Content-Type: application/json
```

```json
{
  "url": "https://www.doubao.com/thread/xxxxxxxx",
  "return_raw": false
}
```

也可以使用 `GET /parse?url=...` 和 `GET /parse-video?url=...`。`return_raw: true` 会返回平台原始响应，便于排查页面结构变化。

## 浏览器扩展

### 免费发布与手动更新

不使用浏览器插件市场时，可以通过 GitHub Releases 分发 ZIP。项目已经提供统一打包脚本和 GitHub Actions：

本地打包（Windows PowerShell）：

```powershell
cd D:\插件\doubao-nomark
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\package-extensions.ps1
```

脚本会读取两个 manifest 的版本号，在仓库根目录生成 `dist` 文件夹：

```text
dist\ai-media-extractor-chrome-v0.3.0.zip
dist\ai-media-extractor-edge-v0.3.0.zip
dist\ai-media-extractor-firefox-v0.3.0.zip
```

其中 Chrome 和 Edge 使用同一份 Chromium 扩展代码。压缩包内部就是扩展根目录，解压后应直接看到 `manifest.json`，不要再选择外层项目目录。

发布新版本时递增两个扩展 manifest 的 `version`，提交并创建 tag：

```powershell
git add extension README.md scripts .github
git commit -m "Release v0.3.1"
git tag v0.3.1
git push origin main --tags
```

GitHub Actions 会自动运行打包脚本，并将三个 ZIP 放到 GitHub Release 的附件中。也可以在 Actions 页面手动运行 `Package browser extensions`，生成的 ZIP 会出现在 workflow artifact 中。

首次使用 Actions 发布 Release 时，到仓库 `Settings > Actions > General > Workflow permissions` 选择允许 workflow 读写仓库内容；否则 workflow 只能生成 artifact，不能创建 Release 附件。

用户安装和更新步骤见 [INSTALL.md](INSTALL.md) 的“GitHub ZIP 分发”章节。GitHub ZIP 适合 Chrome/Edge 的“加载已解压的扩展程序”；Firefox 普通用户不能直接安装未签名 ZIP，正式安装需要 Mozilla 签名后的 XPI。

### Chrome / Edge

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `extension/edge` 目录。
5. 登录目标平台，打开目标页面并刷新，然后点击右下角素材按钮。

自动下载设置：点击浏览器工具栏中的扩展图标，勾选“检测到新素材时自动下载”。关闭后只保留手动下载；浏览器可能会对短时间内的多次下载显示一次允许提示。

#### Chrome Web Store 上架准备

Chrome/Edge 的 `extension/edge` 已使用 Manifest V3、无远程代码，当前权限只用于目标站点的媒体解析和本地设置。正式提交 Chrome Web Store 前仍需准备开发者账号、商店截图/宣传图、支持邮箱和隐私政策链接，并在隐私声明中说明：扩展不上传聊天内容，不建立用户画像，`autoDownload` 仅保存于 `chrome.storage.local`。可直接参考 [隐私政策草案](docs/PRIVACY_POLICY.md)。商店审核还可能要求解释对豆包、千问页面的 host permissions；提交说明应与扩展的单一用途（提取并下载用户可见媒体）一致。

### Firefox

Firefox 扩展要求 Firefox 128 或更高版本：

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择 `extension/firefox/manifest.json`。
4. 登录目标平台，打开目标页面并刷新，然后点击右下角素材按钮。

临时载入的扩展会在 Firefox 退出后被移除，重新启动 Firefox 后需要再次载入。正式签名发布需通过 Firefox Add-ons 平台打包和签名。

不要选择项目根目录。Chrome/Edge 的扩展根目录是 `extension/edge`；Firefox 需要选择 `extension/firefox/manifest.json`。项目根目录可能包含 Python 的 `__pycache__`，浏览器会拒绝加载。

Firefox 实测使用步骤：

1. 在 Firefox 中打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”，选择 `extension/firefox/manifest.json`。
3. 登录豆包或千问，打开目标页面并刷新。
4. 点击右下角素材按钮进行提取和下载。

Firefox 临时附加组件在浏览器退出后会被移除，重新启动后需要再次载入。

## Tampermonkey

1. 安装 Tampermonkey。
2. 新建脚本。
3. 粘贴 [ai-media-extractor.user.js](extension/tampermonkey-script/ai-media-extractor.user.js) 的完整内容并保存。
4. 刷新豆包或千问页面，点击右下角素材按钮。

脚本已配置 GitHub 更新地址。每次发布脚本改动时，递增脚本头部的 `@version` 后推送到 `main` 分支。

同一个页面不要同时启用浏览器扩展和 Tampermonkey 脚本。两者功能重叠，同时运行会重复注入素材面板和网络拦截器。测试 Firefox 时建议暂时停用油猴脚本，只加载 `extension/firefox`。

## 代理

程序会优先使用 `HTTP_PROXY`、`HTTPS_PROXY`，其次读取 Windows 系统代理。需要手动指定时：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:HTTP_PROXY = "http://127.0.0.1:7890"
```

端口请按本机代理软件配置调整。

## 常见问题

- 豆包视频没有显示：确认已登录豆包，并在视频生成完成后刷新页面。扩展不会降级下载已知带水印的视频流。
- 千问视频没有显示：确认聊天页面中的视频卡片已经加载完成，再打开素材面板。
- 扩展更新后无变化：在扩展管理页点击“重新加载”，然后使用 `Ctrl + F5` 刷新目标页面。
- API 返回网络错误：确认 Python 进程可访问目标平台和对应 CDN，必要时配置代理。

### Firefox 控制台出现 `selectAllBtn is null`

通常是 Firefox 扩展和 Tampermonkey 脚本同时运行造成的重复注入。请在 Tampermonkey 中暂时停用本脚本，只保留 Firefox 扩展，然后重新加载扩展并使用 `Ctrl + F5` 刷新页面。

### Firefox 控制台出现 `Permission denied to access property "id"`

这是旧版扩展在页面脚本与扩展隔离世界之间传递对象消息导致的兼容性问题。请更新到当前代码后，在 `about:debugging#/runtime/this-firefox` 点击“重新加载”，关闭并重新打开豆包分享页；同时确认该页面没有启用 Tampermonkey 版本。当前版本已使用字符串消息桥接，不应再出现此错误。

### Firefox 控制台出现浏览器或平台警告

`WEBGL_debug_renderer_info is deprecated`、传感器弃用提示、`screen.availWidth` 指纹防护提示和豆包 CDN 自身的 `参数错误` 通常来自浏览器或目标页面，不是本项目的扩展清单错误。优先检查是否能正常打开素材面板和下载资源。

## 交流与反馈

- QQ 交流群：`771436309`
- 问题反馈：[GitHub Issues](https://github.com/scj725/ai-media-extractor/issues)
- 项目地址：[scj725/ai-media-extractor](https://github.com/scj725/ai-media-extractor)

反馈问题时请提供浏览器名称及版本、扩展或脚本版本、页面类型、复现步骤和控制台报错截图。请勿发送账号、Cookie、Token 等敏感信息。

## 许可与来源

本项目基于开源项目 [ihmily/doubao-nomark](https://github.com/ihmily/doubao-nomark) 的 MIT 许可证代码进行修改与重构。原版权及 MIT 许可证文本保留在 [LICENSE](LICENSE) 中；分发本项目或其衍生版本时，必须保留该文件。

## 注意

使用本服务时请遵守豆包、千问等目标平台的使用条款、内容权利和相关法律法规。请仅处理你有权访问、保存或使用的内容。
