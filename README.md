# Iron Line - 2D Tank Prototype

Iron Line is a personal 2D top-down tank and infantry prototype. It currently focuses on offline battles, sandbox testing, story-mode groundwork, asset tooling, AI behavior experiments, and local multiplayer/server experiments.

This repository is shared as a development record and playable prototype. The source code, art, audio, story material, design documents, and game assets remain protected. See [LICENSE](LICENSE).

## Run Locally

Install dependencies once:

```powershell
npm install
```

Start the local Node server:

```powershell
npm start
```

Open the game:

```text
http://127.0.0.1:4173/index.html
```

Useful local pages:

```text
http://127.0.0.1:4173/index.html?testLab=sandbox
http://127.0.0.1:4173/editor.html
http://127.0.0.1:4173/admin.html
```

## Online Mode

Online room creation and room lists require the Node server from `npm start`. Static hosting such as GitHub Pages can serve the offline game files, but it cannot run the `/ws` WebSocket server or `/api/rooms` endpoints by itself.

In short:

- Offline, story, sandbox, editor, and asset tools can be opened from the local app.
- Online multiplayer requires a running Node server.
- A static deployment without the server will not provide working online rooms.

## Checks

Run the project checks:

```powershell
npm run check
```

## Asset Note

Only runtime-ready game assets should be committed here. High-resolution source artwork, private drafts, and external working files should stay outside the public repository unless intentionally released.
