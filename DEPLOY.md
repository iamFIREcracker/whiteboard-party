# Deploying whiteboard.party via ONCE

Findings from the once-deploy discovery (bead whiteboard-party-bzh.7), verified on the
myvps droplet on 2026-08-14. Short version: the "unproven custom-image path" is proven —
`once` v0.3.0 on the box already runs three custom apps from ghcr.io images behind
Kamal Proxy with Let's Encrypt TLS (`aspettandoemma.com`, `matteolandi.net`, and
polaroid-wall at `wedding.matteolandi.net`). No contingency needed.

## The verified command shape

```bash
# on the box (ssh -p 2222 -i ~/.ssh/id_myvps root@100.109.29.49)
once deploy ghcr.io/iamfirecracker/whiteboard-party:latest \
  --host whiteboard.party \
  --env NODE_ENV=production \
  --env STATE_FILE=/storage/state.json
```

`once deploy <image> [flags]` takes an arbitrary image ref as its positional argument.
Relevant flags (from `once deploy --help`, v0.3.0):

| Flag | Notes |
|---|---|
| `--host string` | hostname for the app. **Single string, not repeatable** — no multi-hostname support, so `www.whiteboard.party` cannot be added this way; skip it (feeds the DNS bead's "skip www" branch). |
| `--env stringArray` | `KEY=VALUE`, repeatable. |
| `--auto-update` | default **true**: the once background service re-pulls the image tag and restarts the app when it changes (observed doing so for the other apps). Pushing a new `:latest` to ghcr is a deploy. |
| `--auto-backup`, `--backup-path` | opt-in periodic backups (`once backup` / `once restore` also exist). |
| `--cpus`, `--memory` | container limits, optional. |
| `--disable-tls` | TLS (Let's Encrypt) is on by default; leave it on. |

Settings can be changed later without redeploying from scratch:
`once update <host> [same flags] [--image <ref>]`. Other useful commands: `once list`,
`once exec`, `once stop|start`, `once remove`.

## The container contract (verified against the running polaroid-wall app)

- **Port**: the container must serve HTTP on **port 80**. There is no port flag;
  Kamal Proxy targets the container directly. (Every deployed app exposes `80/tcp`.)
  The whiteboard Dockerfile/app must therefore listen on 80 in production (e.g. honor a
  `PORT` env var and pass `--env PORT=80`, or default to 80 under `NODE_ENV=production`).
  The internal 127.0.0.1:23434 Socket.IO server is unaffected — Kamal Proxy proxies
  WebSockets through the single port 80 fine.
- **Health check**: Kamal Proxy probes `GET /up` and only routes once it answers 200
  (this is why the app needs the side-effect-free `/up` endpoint from bead .1).
- **Storage**: once creates one named Docker volume per app
  (`once-app-<name>.<hash>`) and mounts it at **`/storage`** (and also `/rails/storage`,
  a 37signals convention — same volume). No volume flag exists and none is needed.
  Hence `STATE_FILE=/storage/state.json`.
- **TLS**: automatic Let's Encrypt at deploy time — DNS for `whiteboard.party` must
  already point at the droplet (167.71.75.236) **before** running `once deploy`.
- **Restart policy**: once sets `always`; the app should handle SIGTERM (bead .1).

## Image build & push

- Registry: public `ghcr.io/iamfirecracker/<app>:latest`, same as the other apps.
- The droplet is **amd64**; the laptop is arm64. Build multi-arch (or at least
  `linux/amd64`): `docker buildx build --platform linux/amd64,linux/arm64 --push ...`.
  (polaroid-wall's first arm64-only push died on the box — recorded in its bead ho9.6.)

### Build & push

The `Dockerfile` in the repo root builds the image (pinned `node:22.x-alpine` patch tag,
see its `FROM` line; prod deps only via `npm ci --omit=dev`; `node_modules` shipped
because the server serves it at `/node_modules`; runs as the `node` user; listens on 80;
`/storage` pre-created and owned by `node`).

```bash
# local sanity build (laptop arch only)
docker build -t whiteboard-party:dev .
docker run --rm -d -p 18080:80 -e STATE_FILE=/storage/state.json \
  --name wbtest whiteboard-party:dev
curl -fsS localhost:18080/up
docker rm -f wbtest   # unconditional: --rm only fires on exit, so a failed probe
                      # would otherwise leave wbtest holding the name and port 18080

# build & push (the droplet is amd64; add linux/arm64 if multi-arch is ever wanted)
docker buildx build --platform linux/amd64 \
  -t ghcr.io/iamfirecracker/whiteboard-party:$(git rev-parse --short HEAD) \
  -t ghcr.io/iamfirecracker/whiteboard-party:latest --push .
```

Auth: the laptop's existing Docker Desktop `ghcr.io` login already carries
`write:packages` (verified via the GitHub API's `x-oauth-scopes` header), so no
separate `docker login` is needed — the originally planned dedicated `ghcr-push-pat`
Keychain entry was skipped as unnecessary. The droplet keeps its own read-only
(`read:packages`) PAT for pulls.

Pushing a new `:latest` is itself a deploy once the app is up (`--auto-update` is on).

### Local verification (2026-08-16)

`whiteboard-party:dev`, built from commit `9ab1f86`, was exercised end to end before
anything was pushed. The sanity snippet above skips the volume; the fuller run below
mirrors what ONCE actually mounts, and is the one to use when re-verifying:

```bash
docker build -t whiteboard-party:dev .
docker volume create wp-state
docker run --rm -d -p 18080:80 -v wp-state:/storage \
  -e STATE_FILE=/storage/state.json --name wp whiteboard-party:dev
# ... checks ...
docker rm -f wp; docker volume rm wp-state
```

Host port 18080 rather than 3000, which the dev server usually holds.

1. **Health** — `curl -fsS localhost:18080/up` → 200 `OK`. PASS
2. **Room creation** — `/` → 302 `/new` → 302 `/20260816.yr5xufnp88`, room page 200; `/20200101.nope` → 404. PASS
3. **Draw / undo / redo / clear** — stroke emitted and echoed by the server; ink 0 → 2600, undo → 0, redo → 2600, clear → 0. PASS
4. **Reload restores canvas** — `init` replayed the one shape, ink 2719 before and after. PASS
5. **Two-window live sync** — a shape drawn in page A appeared in page B and vice versa, and an undo and a clear both propagated, none needing a reload. PASS
6. **No dev-server leakage** — zero `/lr` requests and zero console errors across every page load, probed on both `localhost:18080` and `127.0.0.1:18080`; no 4xx responses at all (only a p5 `willReadFrequently` warning). PASS
7. **SIGTERM persistence** — a fresh shape was still absent from `state.json` at `docker stop` time, with no periodic `Persisted` logged between the `Draw` and `Received SIGTERM` lines, yet present in the file afterwards; a new container on the same volume re-rendered it. So the shutdown flush, not the 30s timer, saved it. PASS
8. **Fresh empty volume** — boots with no `state.json` present, `/up` 200, `/new` gives a working room, and the first flush writes `state.json` owned by `node`. PASS

The browser steps (items 3–7) were driven with headless Playwright against the running
container, not simulated.

### First push (2026-08-16)

Built from commit `b98147e` and pushed as
`ghcr.io/iamfirecracker/whiteboard-party:b98147e` and `:latest` — single-platform
`linux/amd64`, manifest digest `sha256:589d0658c9eb…`. The first push created the ghcr
package **private** (expected; unlike the older apps' public packages — the droplet's
read PAT covers it). The droplet then pulled `:latest` successfully with that PAT and
got the same digest.

## First deploy (2026-08-16)

Deployed with exactly the verified command shape above (run manually on the box — the
Claude Code permission classifier blocked SSH from the session, so the operator ran the
on-box commands and pasted output back). App container:
`once-app-whiteboard-party.a7d346-caec93`. First deploy included Let's Encrypt issuance.

Verification, all from outside except where noted:

1. **App up** — container running alongside the three pre-existing apps and
   `once-proxy` (80/443). PASS
2. **TLS + health** — `curl -sv https://whiteboard.party/up` → HTTP/2 200 `OK`;
   issuer `C=US; O=Let's Encrypt; CN=YE2`, subject `CN=whiteboard.party`, expires
   2026-11-14. PASS
3. **HTTP redirect** — `http://whiteboard.party/up` → 301 `https://…`. PASS
4. **Room lifecycle** — `/new` → 302 to a fresh room → 200; bogus room → 404. PASS
5. **WebSocket, explicitly** — two Node socket.io-clients with
   `transports: ['websocket']` and a `Referer: https://whiteboard.party/<room>` header
   (the server derives the room from Referer; non-browser clients must set it) both
   connected with `engine.transport.name === 'websocket'` — no polling fallback. PASS
6. **Two-client sync** — client B received client A's `draw` rebroadcast in the same
   room, through Kamal Proxy. PASS
7. **Restart persistence** — after the draw, `docker restart` of the app container;
   room still 200 and its `init` history still contained the drawn shape (SIGTERM
   flush → volume → reload). PASS
8. **Storage ownership** (on box) — `/storage` and `state.json` (711 bytes after the
   test draw) owned `1000:1000` (`node`), as expected from volume copy-on-first-use.
   PASS
9. **Memory headroom** (on box) — app at 19.25MiB; box: 453MB total, 278MB available,
   204MB swap used. Fine for now; the box runs 4 apps + proxy in 512MB, so watch this
   as rooms accumulate (state is held fully in memory). PASS
10. **Other apps untouched** — routing table unchanged apart from the new host;
    `matteolandi.net`, `aspettandoemma.com`, `wedding.matteolandi.net` all still 200.
    PASS

Not yet done: drawing from a phone on cellular, and eyeballing the 101 upgrade in real
browser devtools (item 5's scripted check is the automated stand-in).

### Seeding the pinned room — done (2026-08-16, crafted seed)

The original ~69KB drawing was never recovered (local copy overwritten with `{}` on
2026-08-15; no laptop backup). Instead, room `20220402.b4t4fmyrcf` was seeded with a
generated welcome message: `seed/gen-seed.js` renders text as stroke shapes
(`seed/seed-state.json`, 76 shapes). Procedure used (the app must be DOWN when the
file lands, because the SIGTERM flush overwrites `state.json` on every shutdown):

1. `docker stop once-app-whiteboard-party.a7d346-caec93` (flushes current state).
2. Pull `state.json` from the volume to the laptop, merge the seed into it (the seed
   file alone would wipe every other live room), push the merged file back.
3. `cp` it over `/var/lib/docker/volumes/once-app-whiteboard-party.a7d346/_data/state.json`,
   `chown 1000:1000`, `docker start` — state is read once at boot.

Volume (previously uncaptured): `once-app-whiteboard-party.a7d346`, mounted at both
`/storage` and `/rails/storage` in the container. Verified after restart: `/up` 200,
pinned room 200 serving all 76 `seed-*` shapes over websocket `init`, the one
pre-existing room with a drawing intact, unknown rooms still 404.

Note: the room is NOT read-only — any visitor can draw over or clear the seed and the
next flush persists that. Tracked as bead `whiteboard-party-bzh.13`.

## Second deploy (2026-08-16): read-only pinned room + landing redirect

Shipped commit `f6d2a32` (bead .13): the pinned room rejects draw/undo/redo/clear
server-side (`init` now carries a `readonly` flag; the client hides drawing controls
and switches to panning), and `GET /` lands on the pinned room instead of `/new`
(fallback to `/new` if the room is ever missing from state).

Deploy path learnings:

- Pushing a new `:latest` did NOT roll the app within 15 minutes — `--auto-update`'s
  cadence is longer than that (or triggered otherwise). Don't rely on it for prompt
  deploys.
- `once deploy` fails with `hostname already in use` for an existing app. The forced
  update that worked (on box): `docker pull ghcr.io/iamfirecracker/whiteboard-party:latest
  && once update whiteboard.party --image ghcr.io/iamfirecracker/whiteboard-party:latest
  --env NODE_ENV=production --env STATE_FILE=/storage/state.json` (explicit pull first,
  in case `once update` skips pulling when the image ref string is unchanged).

Verified from the laptop after the update: `/` 302 → pinned room; `/new` still creates
rooms; `/up` 200; pinned room `init` has `readonly: true` and all 76 seed shapes;
draw/undo/redo/clear over websocket produce no echoes and no state change across
reconnect; a normal room still accepts and persists drawings (`readonly: false`);
the other three apps still 200. Restart preserved the seeded state (SIGTERM flush).

## Third deploy (2026-08-16): pinned room ephemeral instead of read-only

Shipped commit `32c4fcc` (bead .14), superseding the second deploy's read-only
behavior — hiding the drawing controls looked bad. The pinned room now serves the
full toolbar; draw/undo/redo/clear broadcast live to connected clients exactly like
normal rooms, but the server never mutates `state[room]` for `EPHEMERAL_ROOMS`, so
every reconnect/refresh (and every restart/flush) resets it to the seeded drawing.
`init` carries `ephemeral` (the `readonly` flag and the client's `enterReadonlyMode`
gating are gone). Accepted trade-off: late joiners miss earlier ephemeral strokes, so
client histories can diverge until a refresh — no server-side session history on
purpose.

Deployed with the forced-update one-liner from the second deploy. Verified from the
laptop: `/` 302 → pinned room; two websocket clients see each other's draw/undo live
and clear reaches only the non-sender (normal protocol semantics); a fresh connection
gets exactly the 76 `seed-*` shapes back; a normal room still persists across
reconnect (`ephemeral: false`).

## Box state (2026-08-14)

- `once` v0.3.0 at `/usr/local/bin/once`, `once-background.service` running.
- Kamal Proxy already running as container `once-proxy` (`basecamp/kamal-proxy:once-01`),
  bound to 80/443 — contrary to the earlier assumption that it would first appear with
  our deploy. `docker exec once-proxy kamal-proxy list` shows the routing table.
- App containers are named `once-app-<name>.<hash>`; namespace defaults to `once`
  (`-n` flag to change, not needed).
