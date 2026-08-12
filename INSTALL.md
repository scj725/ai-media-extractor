# AI 素材提取器：安装与使用

## 本地 API

在项目目录执行：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

浏览器打开 `http://127.0.0.1:8000`，选择图片或视频，粘贴豆包或千问链接后解析。

若系统使用代理，程序会读取 Windows 系统代理。也可以在启动前设置：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:HTTP_PROXY = "http://127.0.0.1:7890"
```

## Chrome / Edge 扩展

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `extension\edge` 目录。
5. 登录目标平台并刷新目标页面，点击右下角素材按钮。

注意：不要加载项目根目录。Python 运行产生的 `__pycache__` 目录会被浏览器拒绝，`extension\edge` 才是扩展根目录。

## Tampermonkey 脚本

1. 安装 Tampermonkey。
2. 新建脚本。
3. 粘贴 `extension\tampermonkey-script\ai-media-extractor.user.js` 的完整内容并保存。
4. 刷新豆包或千问页面，点击右下角素材按钮。

## 常见问题

- 豆包视频：请在浏览器登录豆包后使用扩展。无水印回退接口由平台控制，未返回可用地址时不会降级下载带水印流。
- 千问视频：确认聊天页面中视频已经显示并完成加载，再打开素材面板。
- 更新扩展或脚本后：重新加载扩展或保存脚本，再使用 `Ctrl + F5` 刷新页面。
