# 安装与使用

## 本地 Web/API 服务

### 使用 uv

```powershell
cd D:\插件\doubao-nomark
uv sync
uv run uvicorn app:app --host 127.0.0.1 --port 8000
```

### 使用 pip

```powershell
cd D:\插件\doubao-nomark
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

打开 `http://127.0.0.1:8000` 使用图形界面，或打开 `http://127.0.0.1:8000/docs` 查看并测试 API。

## API 调用

图片：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/parse -ContentType 'application/json' -Body '{"url":"https://www.doubao.com/thread/xxxxxxxx"}'
```

视频：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/parse-video -ContentType 'application/json' -Body '{"url":"https://www.doubao.com/thread/xxxxxxxx"}'
```

将请求体中的 URL 换成自己的豆包或千问分享链接。加入 `"return_raw": true` 可查看平台原始响应。

## Chrome / Edge 扩展

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `D:\插件\doubao-nomark\extension\edge`。
5. 登录豆包、Dola 或千问并刷新页面，点击右下角素材按钮。

Chrome/Edge 扩展支持 Dola 对话页 `https://www.dola.com/chat/*`。Dola 视频优先提取无水印原始地址，页面水印预览不会显示在素材列表中；扩展弹窗可选择平台默认、15 秒或试验性的 30 秒生成时长。

更新代码后，回到扩展管理页点击“重新加载”，然后用 `Ctrl + F5` 刷新目标页面。

## Firefox 扩展

要求 Firefox 128 或更高版本：

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择 `D:\插件\doubao-nomark\extension\firefox\manifest.json`。
4. 登录豆包、Dola 或千问并刷新页面，点击右下角素材按钮。

临时附加组件会在 Firefox 退出后被移除。重新启动浏览器后，需要再次执行上述加载步骤。

## Tampermonkey 脚本

1. 安装 Tampermonkey。
2. 新建脚本并删除默认内容。
3. 粘贴 `extension\tampermonkey-script\ai-media-extractor.user.js` 的完整内容，保存。
4. 刷新豆包、Dola 或千问页面，点击右下角素材按钮。

在 Dola 页面生成视频前，打开 Tampermonkey 扩展的脚本菜单，选择“Dola 视频时长：平台默认”、“15 秒”或“30 秒（实验）”。菜单切换后会自动刷新页面；30 秒由 Dola 服务端决定是否接受。脚本优先从 Dola 的 `chain/single` 响应提取无水印视频地址，并忽略页面带水印预览。

同一个页面只启用扩展或油猴脚本其中一种。测试 Firefox 扩展时，请先在 Tampermonkey 中暂时停用本脚本，避免重复注入导致素材面板报错。

## 代理设置

程序会读取 Windows 系统代理。若仍无法访问目标平台，可在启动服务前运行：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:HTTP_PROXY = "http://127.0.0.1:7890"
```

请替换为实际代理端口。

## 说明

- 豆包视频的无水印地址由平台回退接口返回，浏览器扩展需要使用你的已登录会话；接口不可用时不会改为下载已知带水印流。
- 千问视频从已加载的视频播放器中读取地址。请等待视频卡片显示完成后再打开素材面板。
- Dola 视频的无水印地址来自当前登录页返回的 `chain/single` 响应；请在视频生成完成后打开素材面板。平台默认、15 秒和试验性 30 秒的生成资格均受 Dola 服务端限制。
- 本地 API、扩展和脚本的支持范围见 [README.md](README.md)。

## 来源与许可

本项目基于 [ihmily/doubao-nomark](https://github.com/ihmily/doubao-nomark) 的 MIT 许可证代码进行修改与重构。请保留项目中的 [LICENSE](LICENSE)。

## 交流与反馈

- QQ 交流群：`771436309`
- GitHub Issues：<https://github.com/scj725/ai-media-extractor/issues>
- 项目地址：<https://github.com/scj725/ai-media-extractor>

反馈问题时请附上浏览器及版本、扩展或脚本版本、复现步骤和控制台报错。请勿发送账号、Cookie 或 Token。

**注意**：使用本服务时请遵守豆包、千问等目标平台的使用条款、内容权利和相关法律法规。请仅处理你有权访问、保存或使用的内容。
