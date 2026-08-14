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


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
