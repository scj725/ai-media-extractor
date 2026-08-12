# AI Media Extractor

从豆包和千问对话、分享页面提取图片与视频资源的本地工具。项目提供三种使用方式：本地 Web/API 服务、Chrome/Edge 扩展和 Tampermonkey 脚本。

仓库地址：[scj725/ai-media-extractor](https://github.com/scj725/ai-media-extractor)

## 功能

- 提取豆包分享页中的图片资源。
- 提取豆包视频；浏览器扩展会使用当前登录态请求平台返回的无水印播放流。
- 提取千问聊天页和分享页中的图片资源。
- 提取千问页面播放器已提供的视频地址。
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

支持 Chrome 和 Edge：

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `extension/edge` 目录。
5. 登录目标平台，打开目标页面并刷新，然后点击右下角素材按钮。

不要选择项目根目录。浏览器扩展根目录必须是 `extension/edge`，项目根目录可能包含 Python 的 `__pycache__`，浏览器会拒绝加载。

## Tampermonkey

1. 安装 Tampermonkey。
2. 新建脚本。
3. 粘贴 [ai-media-extractor.user.js](extension/tampermonkey-script/ai-media-extractor.user.js) 的完整内容并保存。
4. 刷新豆包或千问页面，点击右下角素材按钮。

脚本已配置 GitHub 更新地址。每次发布脚本改动时，递增脚本头部的 `@version` 后推送到 `main` 分支。

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

## 许可与来源

本项目基于开源项目 [ihmily/doubao-nomark](https://github.com/ihmily/doubao-nomark) 的 MIT 许可证代码进行修改与重构。原版权及 MIT 许可证文本保留在 [LICENSE](LICENSE) 中；分发本项目或其衍生版本时，必须保留该文件。

## 注意

使用本服务时请遵守豆包、千问等目标平台的使用条款、内容权利和相关法律法规。请仅处理你有权访问、保存或使用的内容。
