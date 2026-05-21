# Agent Handoff

Use this file for the next agent when the current thread is not available.

## Current Focus

The immediate goal is not to claim full online multiplayer completion. The goal is to make the online build verifiable, keep the lobby/combat sync stable, and make AI behavior observable enough to continue safely.

## Repository

- Actual repo: `C:\Users\rneet\Documents\Codex\2026-05-20\pepeant-iron-line-2d-tank-prototype`
- Live URL: `https://iron-line-2d-tank-prototype.onrender.com/`
- Check current commit with `git log -1 --oneline`.
- Check remote with `git ls-remote origin refs/heads/main`.

## First Checks

Run these before editing:

```powershell
git status --short --branch
git remote -v
git log -1 --oneline
npm run check
```

Then verify the live build:

```powershell
Invoke-WebRequest -Uri "https://iron-line-2d-tank-prototype.onrender.com/api/build" -UseBasicParsing
```

If `/api/build` is missing or old, Render is not serving the latest GitHub main yet.

## Known State

- `src/ai/infantry-base-egress.js` is loaded by live `index.html`.
- Infantry base egress was observed working on the Render URL.
- Scout recon drone ammo was observed as `1` in the live UI and runtime state.
- GitHub main contains online combat sync and remote player marker smoothing.
- Render live previously served an older `src/main.js`, so deployment mismatch is the highest risk.

## Rules

- Do not do a large refactor while deployment is uncertain.
- Do not revert unrelated changes.
- Make small commits.
- A fix is not complete until the Render URL demonstrates the behavior.

## Next Best Tasks

1. Confirm `/api/build` and the settings/admin build badge appear on Render after redeploy.
2. Run a two-client online smoke test: room join, nickname, position, aim line, drone marker, chat.
3. Test player gunfire/projectile events between two clients.
4. Keep AI work focused on observability and test-lab reproduction before behavior rewrites.
