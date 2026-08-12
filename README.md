# AI Media Extractor

从支持的 AI 对话及分享页面提取图片和视频资源的本地工具，包含 FastAPI 服务、Chrome/Edge 扩展和 Tampermonkey 脚本。

当前支持豆包与千问页面。豆包视频会使用页面提供的回退接口获取平台返回的无水印流；千问视频直接提取页面播放器提供的媒体地址。

## 本地服务

```powershell
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

打开 `http://127.0.0.1:8000` 使用页面工具，或打开 `http://127.0.0.1:8000/docs` 查看 API 文档。

## 浏览器扩展

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `extension/edge` 目录，不要选择项目根目录。
5. 在目标页面刷新后，使用右下角的素材按钮。

修改扩展代码后，在扩展管理页点击“重新加载”，再刷新目标页面。

## Tampermonkey

将 `extension/tampermonkey-script/ai-media-extractor.user.js` 的内容粘贴到 Tampermonkey 新建脚本中并保存。脚本更新地址会在你创建自己的 GitHub 仓库后再配置。

## 项目结构

- `ai_media_extractor/`: Python 解析逻辑
- `app.py`: 本地 API 与页面入口
- `extension/edge/`: Chrome/Edge 扩展
- `extension/tampermonkey-script/`: 用户脚本
- `INSTALL.md`: 中文安装与使用说明

## 许可与来源

本项目基于 MIT 许可证代码进行修改和重构。`LICENSE` 中保留了上游版权与许可证文本；发布、分发或创建衍生仓库时，请一并保留该文件。

使用本工具时，请遵守目标平台服务条款、内容权利与适用法律。
