# 安装浏览器扩展

## Chrome / Edge

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目中的 `extension/edge` 目录。

## Firefox

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择项目中的 `extension/firefox/manifest.json`。

Firefox 临时扩展在浏览器退出后会被移除，重新启动后需要再次载入。正式发布需要通过 Firefox Add-ons 签名。

加载扩展后登录豆包、Dola 或千问，打开支持的页面并刷新。点击页面右下角素材按钮提取资源，点击浏览器工具栏中的扩展图标可配置自动下载。

不要选择项目根目录作为扩展目录：Chrome/Edge 使用 `extension/edge`，Firefox 使用 `extension/firefox/manifest.json`。

问题反馈和交流：QQ群 `771436309`，也可以提交 [GitHub Issue](https://github.com/scj725/ai-media-extractor/issues)。请勿发送账号、Cookie 或 Token。
