# Agent Handoff

Use this file for the next agent when the current thread is not available.

## Current Focus

Tonight's goal is stabilization, not a big online or AI rebuild.

The single target is: make it obvious whether the Render live build actually reflects GitHub `main`, and if it does not, make the mismatch easy to diagnose.

Do not claim full online multiplayer completion from this handoff. Do not start AI V2, server-authority rewrites, or broad online redesign work.

## Repository

- Actual repo: `C:\Users\rneet\Documents\Codex\2026-05-20\pepeant-iron-line-2d-tank-prototype`
- Live URL: `https://iron-line-2d-tank-prototype.onrender.com/`
- Check current commit with `git log -1 --oneline`.
- Check remote with `git ls-remote origin refs/heads/main`.
- Latest pushed commit at this handoff: `160886c fix: tighten online combat sync smoke`

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

Also check the live `index.html`:

```powershell
$r = Invoke-WebRequest -Uri "https://iron-line-2d-tank-prototype.onrender.com/index.html?ts=$(Get-Date -UFormat %s)" -UseBasicParsing
$r.Content -match "build-info.css"
$r.Content -match "src/core/build-info.js"
```

## Known State

- `src/ai/infantry-base-egress.js` is loaded by live `index.html`.
- Infantry base egress was observed working on the Render URL.
- Scout recon drone ammo was observed as `1` in the live UI and runtime state.
- GitHub main contains online combat sync and remote player marker smoothing.
- GitHub main now also contains `/api/build`, a visible build badge, and `npm run check:online`.
- Render live was still returning `404` for `/api/build` after commit `160886c`, so deployment mismatch is the highest risk.

## Rules

- Do not do a large refactor while deployment is uncertain.
- Do not start AI V2 work.
- Do not rewrite server authority or online architecture.
- Do not redesign the full online flow.
- Do not replace existing AI systems.
- Do not revert unrelated changes.
- Make small commits.
- A fix is not complete until the Render URL demonstrates the behavior.

## Stabilization Checklist

1. Find and use the actual git repo path listed above.
2. Compare GitHub `main` with the Render live deployment.
3. Confirm the app or admin panel shows build id / commit hash.
4. Confirm the live URL shows the same build id.
5. Check browser console errors for online and offline entry.
6. Click through entry to battle start on the live URL.
7. Confirm infantry base egress and scout recon drone ammo `1` on the live URL.
8. Commit and push only small fixes directly related to these checks.
9. Update this file with completed, incomplete, and next actions.

## Optional Local Verification

Use this only after the deployment check is clear:

```powershell
npm run check
npm run check:online
```

`check:online` starts the local server and verifies two players, position/aim, drone position, combat event preservation, world state, and WebSocket join/snapshot.
