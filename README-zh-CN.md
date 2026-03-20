# Layered Span Studio

Layered Span Studio 是一款针对“在文本任意区间上同时管理多个重叠标签”的工作流而优化的标注工具。它的主要特点如下：

- English README: [README-en.md](./README-en.md)
- 日本語 README: [README.md](./README.md)

- UI/UX 从一开始就围绕重叠标签设计，能够更自然地查看和编辑多个 span。
- 可以立即查看标注定义信息和已有示例，从而提升标注速度与一致性。
- 提供面向未来 LLM 集成的 API，便于构建半自动标注流程。

![概览](./docs/readme-overview.webp)

---

## 目录

1. [快速开始](#快速开始)
2. [使用自己的数据开始](#使用自己的数据开始)
3. [仓库结构](#仓库结构)
4. [补充说明](#补充说明)
5. [License](#license)

## 快速开始

这里的快速开始假设你想先导入 demo 项目，立即确认 UI 行为。

请在两个终端中分别启动 backend 和 frontend。

1. 启动 backend

```bash
cd backend
export JWT_SECRET='dev-secret'
uv sync # 仅首次或依赖更新时需要
uv run scripts/create_user.py demo_login_user demo_login_pass # 仅首次且用户不存在时需要
uv run uvicorn layered_span_studio_backend.main:app --host 127.0.0.1 --port 8000 --reload
```

`JWT_SECRET` 是登录后签发 JWT 时用于签名和验证的服务器端密钥。在生产环境中，应设置为足够长且随机的固定值。

2. 启动 frontend

```bash
cd ../frontend
npm install # 仅首次需要
npm run dev
```

3. 在浏览器中打开 `http://127.0.0.1:5173`，登录后导入 demo 项目

- 用户名: `demo_login_user`
- 密码: `demo_login_pass`
- 在项目列表右上角点击 `Import Project`，选择 `docs/quickstart-demo-project.json`
- 导入完成后，会自动打开新建项目的 Workspace

4. 立即确认的重点

- 可以通过拖拽文本创建标注。
- 同一段文本可以赋予多个相互重叠的标签。
- 右侧面板可以查看已有标注和定义信息。
- 对当前选中的表层文本，可以查看其他文档中匹配的已有标注。
- 支持键盘快捷键，并可在 `?` 面板中查看。

## 使用自己的数据开始

如果你想把自己的文档或标注数据转换成可导入 JSON，请参阅 [docs/import-your-data-zh-CN.md](./docs/import-your-data-zh-CN.md)。
日文版见 [docs/import-your-data.md](./docs/import-your-data.md)，英文版见 [docs/import-your-data-en.md](./docs/import-your-data-en.md)。

## 仓库结构

- `backend/`: 服务端 API、数据持久化、认证，以及 Import / Export 的基础流程。
- `frontend/`: 基于 React + Vite 的标注 UI。
- `docs/`: 规格、设计说明和运维文档。

更详细的发布流程规则见 [docs/release.md](./docs/release.md)。

## 补充说明

- 开发者对使用本工具所造成的任何损失不承担责任。
- 欢迎企业场景使用。如果在生产环境中使用，欢迎反馈使用场景、运维需求与改进建议。联系方式: `aotamasakimail (at) gmail.com`
- 欢迎提交 Issue 和 Pull Request。

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
