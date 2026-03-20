# Layered Span Studio

Layered Span Studio is an annotation tool optimized for workflows where multiple overlapping labels must be managed on arbitrary spans of text. Its main characteristics are:

- A UI/UX designed around overlapping labels, so multiple spans can be reviewed and edited naturally.
- Immediate access to annotation definitions and existing examples, making annotation work faster and more consistent.
- APIs designed with future LLM integration in mind, enabling semi-automatic annotation pipelines.

- 日本語 README: [README.md](./README.md)
- 中文 README: [README-zh-CN.md](./README-zh-CN.md)

![Overview](./docs/readme-overview.webp)

---

## Table of contents

1. [Quick Start](#quick-start)
2. [Start with your own data](#start-with-your-own-data)
3. [Repository layout](#repository-layout)
4. [Notes](#notes)
5. [License](#license)

## Quick Start

This quick start assumes that you want to load the demo project and inspect the UI immediately.

Run the backend and frontend in two terminals.

1. Start the backend

```bash
cd backend
export JWT_SECRET='dev-secret'
uv sync # first setup or when dependencies change
uv run scripts/create_user.py demo_login_user demo_login_pass # first time only if the user does not exist yet
uv run uvicorn layered_span_studio_backend.main:app --host 127.0.0.1 --port 8000 --reload
```

`JWT_SECRET` is the server-side secret used to sign and verify JWTs issued after login. In production, set a sufficiently long random fixed value.

2. Start the frontend

```bash
cd ../frontend
npm install # first setup only
npm run dev
```

3. Open `http://127.0.0.1:5173` in the browser, sign in, and import the demo project

- Username: `demo_login_user`
- Password: `demo_login_pass`
- Click `Import Project` at the top right of the project list and select `docs/quickstart-demo-project.json`
- After the import finishes, the newly created project opens automatically

4. Things to verify right away

- You can create annotations by dragging over text.
- Multiple overlapping labels can be assigned to the same text.
- Existing annotations and definition information are visible in the right pane.
- For the currently selected surface text, you can inspect matching annotations from other docs.
- Keyboard shortcuts are available and visible from the `?` panel.

## Start with your own data

If you want to convert your own documents or annotations into importable JSON, see [docs/import-your-data-en.md](./docs/import-your-data-en.md).
The Japanese version is also available at [docs/import-your-data.md](./docs/import-your-data.md). The Simplified Chinese version is available at [docs/import-your-data-zh-CN.md](./docs/import-your-data-zh-CN.md).

## Repository layout

- `backend/`: Server-side APIs, persistence, authentication, and the base import/export flow.
- `frontend/`: The React + Vite annotation UI.
- `docs/`: Specifications, design notes, and operational documentation.

Detailed release operation rules are documented in [docs/release.md](./docs/release.md).

## Notes

- The developers accept no responsibility for any damage resulting from the use of this tool.
- Enterprise adoption is welcome. If you use it in production, feedback about use cases, operating requirements, and requested improvements is useful. Contact: `aotamasakimail (at) gmail.com`
- Issues and pull requests are welcome.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
