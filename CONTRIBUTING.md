# 贡献指南

## 开发流程

1. Fork 项目并创建分支。
2. 修改 `extension/edge`，完成后同步到 `extension/firefox`。
3. 运行 `./scripts/package-extensions.ps1`，确认三个 ZIP 都能生成。
4. 检查目标平台页面中的图片、视频提取和下载行为。
5. 提交 Pull Request，说明影响的平台、页面类型和验证方式。

## 注意事项

- 不要提交账号信息、Cookie、Token 或真实聊天内容。
- 不要引入本地服务端依赖；本项目只维护浏览器扩展。
- 平台接口变化时，应优先增加兼容处理，不要破坏已有平台。
