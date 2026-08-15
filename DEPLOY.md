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

## Box state (2026-08-14)

- `once` v0.3.0 at `/usr/local/bin/once`, `once-background.service` running.
- Kamal Proxy already running as container `once-proxy` (`basecamp/kamal-proxy:once-01`),
  bound to 80/443 — contrary to the earlier assumption that it would first appear with
  our deploy. `docker exec once-proxy kamal-proxy list` shows the routing table.
- App containers are named `once-app-<name>.<hash>`; namespace defaults to `once`
  (`-n` flag to change, not needed).
