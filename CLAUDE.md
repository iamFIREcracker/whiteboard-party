# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run start-dev` — run the dev server (nodemon, restarts on changes to `index.js`; ignores `state.json` and `public/`). App serves on http://localhost:3000.
- Node version: v17.8.0 (`.nvmrc`).
- Formatting: prettier (default config). No tests, no linter, no build step — plain JS served as-is (`public/` and `node_modules/` are served statically, no bundler).

## Architecture

Multiplayer whiteboard: a single-file Express + Socket.IO server (`index.js`) and a single-file p5.js client (`public/main.js`, loaded by `public/room.html`).

- **Rooms**: `GET /new` creates a room named `YYYYMMDD.<zbase32-random>` and redirects to `/:room`. Unknown rooms 404. Rooms are secret-but-not-private URLs.
- **State model**: server keeps all whiteboard state in memory as `state[room] = { undo: [], redo: [] }`, where entries are shapes (lists of colored points). Every 30s the state is flushed to `state.json`, omitting rooms whose `YYYYMMDD` prefix is 15+ days old (except the hardcoded pinned room `20220402.b4t4fmyrcf`); in-memory state is never pruned, so those rooms stay live and joinable until a restart, when `state.json` is read back.
- **Sync protocol**: clients get the full undo/redo history via an `init` event on connect, then emit user commands (`draw`, `undo`, `redo`, `clear`). The server updates its own copy of the history (acting as a non-drawing client) and rebroadcasts each command to the room; every client replays commands locally to keep histories in sync. The room is derived server-side from the socket's `Referer` header.
- **Client drawing**: one big 4000x2000 off-screen p5 graphic painted onto the visible canvas; users pan/zoom over it. Local in-progress shapes (`lshape`) are drawn immediately and only emitted on input end; remote shapes (`rshape`) arrive via socket events.
- **Internal proxying**: the main server on :3000 proxies `/socket.io` to an internal Socket.IO server on 127.0.0.1:23434 and `/lr` to a livereload server on :35729 (which watches `public/`).
