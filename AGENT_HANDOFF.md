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

## Latest Stabilization Run

Run date: 2026-05-21 KST.

Completed:

- Actual repo path confirmed: `C:\Users\rneet\Documents\Codex\2026-05-20\pepeant-iron-line-2d-tank-prototype`
- GitHub `main` confirmed at `11412ca docs: narrow online stabilization handoff` before this note.
- Local checks passed:
  - `npm run check`
  - `npm run check:online`
- Local `/api/build` works and reports the current commit when the local server is running.
- Render live `/api/rooms` works and returned `{ "ok": true, "rooms": [] }`.
- Render live online/offline entry screen loaded with no browser console errors.
- Render live offline entry reached the deployment screen with no browser console errors.
- Render live battle start reached the in-game screen with no browser console errors.
- Render live scout loadout showed `3 드론 1`.
- Render live `src/data/infantry-classes.js` contains `reconDrone: 1`.
- Render live `src/ai/infantry-base-egress.js` is available with HTTP 200.

Incomplete / blocked:

- Render live still returned `404` for `/api/build`.
- Render live `index.html` still did not include `build-info.css` or `src/core/build-info.js`.
- Render live `src/main.js` still did not include `updateOnlineCombatEvents` or `updateOnlineWorldSync`.
- Render live `src/systems/renderer.js` still did not include `remoteHumanStates` or remote drone cue rendering.

Current bug report:

- GitHub `main` is ahead of the deployed Render code. The live service is running an older app build even though the server itself is online.
- Because live is stale, do not judge the latest online sync work from `https://iron-line-2d-tank-prototype.onrender.com/` until Render serves `/api/build` and the build badge.
- Likely next action is a Render manual deploy or checking whether the Render service is connected to a different repo/branch/root directory.

## Shutdown Gate Run

Run date: 2026-05-21 KST.

Requested shutdown condition:

- Commit/push must succeed.
- Render live must reflect the latest GitHub `main`.
- Render live basic page and browser console must have no fatal issue.
- Only then run `shutdown /s /t 0`.

Result:

- Shutdown was not executed.
- Local repo was clean at start.
- Local `main` and `origin/main` matched `1c4a91a docs: record live stabilization results`.
- Render live `/api/build` returned `404`.
- Render live `index.html` did not include `build-info.css` or `src/core/build-info.js`.
- Render live `src/main.js` did not include `updateOnlineCombatEvents`, `updateOnlineWorldSync`, or the latest tank machine-gun online shot path.
- Render live `src/systems/renderer.js` did not include `remoteHumanStates` or `drawRemoteDroneCue`.
- Render live basic entry page loaded with no browser console errors, but no build badge was present.

Blocking reason:

- Deployment is still stale. The Render service is not serving the latest GitHub `main`, so the shutdown gate failed.

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
