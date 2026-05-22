# 1st Alpha P0 Root-Cause / Narrow Redesign Scope

Date: 2026-05-22

Status: RETEST HOLD.

This report supersedes the earlier "controlled 4-player alpha retest allowed" decision. The P0 smoke fixes are still useful, but a code review found deeper online/team assumptions that can make a 4-player alpha retest misleading or unstable. Do not proceed to the 4-player alpha retest until this root-cause scope is addressed or explicitly accepted as a known-risk test.

## 1. Conclusion

The current P0 failures are not just isolated bugs. They expose three older single-player assumptions now colliding with online team play:

1. AI still treats `game.player` as the blue/local player in several combat paths.
2. Server combat confirmation accepts too much client-provided team metadata and does not clearly block same-team damage in the first-pass shot confirm path.
3. Online player combat still rides on room/event/snapshot infrastructure rather than a dedicated real-time combat channel.

Admin room deletion / observer progress issues are a fourth related problem: admin state is still mixed between server room state, local caches, and observer snapshots.

## 2. Evidence From Code Review

### AI local-player team assumption

Observed patterns:

- `src/ai/combat-controller.js`
  - Red tank AI can add `game.player` as an enemy candidate when `this.tank.team === TEAM.RED`.
  - Blue tank friendly-fire safety checks also assume the local player is blue.
- `src/ai/infantry-ai.js`
  - Red infantry can add `game.player` as an enemy candidate when `this.unit.team === TEAM.RED`.
  - RPG / anti-vehicle safety paths still contain blue-player assumptions.
- `src/ai/infantry-weapon-decision.js`
  - Grenade soft-target and safety checks contain team-specific local-player assumptions.
- `src/main.js`
  - Safe-zone checks still include blue-team assumptions, such as `isPlayerInSafeZone()` using `TEAM.BLUE`.

Risk:

- If the online local player is on red team, red AI can treat the local player as an enemy or fail to treat red base as the player's safe zone.
- This can explain "red tank killed the player" and weird capture-point grenade / AI reactions.

### Server same-team combat confirmation weakness

Observed patterns:

- `server/room-registry.js`
  - `confirmShot()` validates shot / target existence and state, but the first-pass path needs an explicit same-team damage rejection.
  - `shooterTeam` can be influenced by input before final event construction.

Risk:

- If client metadata is stale or wrong, the server can confirm combat results with the wrong team semantics.
- Same-team damage can become authoritative when it should be rejected.

### Real-time combat over room/event update structure

Observed patterns:

- `src/systems/session-flow.js`
  - Player presence is published at roughly `180ms`, about `5.5Hz`.
- `src/main.js` and `src/systems/room-registry.js`
  - Combat events are still accumulated and published through room/event APIs.
  - This is acceptable for lobby, command, and low-frequency state, but not enough for responsive 4-player FPS movement / fire feel.

Risk:

- Movement and combat feedback can feel choppy even if the smoke tests pass.
- Increasing room publish frequency risks making admin / observer / room-list load worse.

### Admin / observer server truth split

Observed patterns:

- Deleted-room tombstones now protect the server-side API from stale recreate, but client and admin views can still have stale local room or observer snapshots.
- `src/systems/observer-bridge.js` still relies on BroadcastChannel / localStorage snapshots for observer/admin panel data.

Risk:

- Admin panel can show stale rooms or fail to show match start/progress if the world host snapshot is late, stale, or absent.

## 3. Narrow Redesign Targets

### Target A. Team / local-player identity unification

Goal:

- Stop AI code from assuming `game.player` is always the blue human.

Scope:

- Add small helper-level identity rules, not a full AI rewrite.
- AI should ask:
  - What team is the local human currently on?
  - Is the local human an enemy to this AI actor?
  - Is the local human in their own safe zone?
- Replace hard-coded `TEAM.BLUE` / `TEAM.RED` player assumptions in the direct combat target and safety paths.

Initial files to audit:

- `src/ai/combat-controller.js`
- `src/ai/infantry-ai.js`
- `src/ai/infantry-weapon-decision.js`
- `src/main.js`
- `src/systems/session-flow.js`

Pass criteria:

- A red-team human is not targeted by red AI just because they are the local `game.player`.
- A red-team human's own base / safe zone is recognized.
- Blue-team behavior is not regressed.

### Target B. Server same-team damage guard

Goal:

- The server must reject same-team player shot / hit / death confirmations unless an explicit future friendly-fire mode enables it.

Scope:

- Use server-known participant teams when available.
- Treat client-provided `shooterTeam` as metadata, not final authority.
- Add direct smoke coverage for same-team shot rejection.

Initial files to audit:

- `server/room-registry.js`
- `tools/check-online-combat-server-authority.cjs`
- `tools/check-online-combat-client-flow.cjs`

Pass criteria:

- Same-team shot / hit requests are rejected or produce no hit/death confirm.
- Opposing-team shot / hit confirm still works.
- Existing duplicate / stale death / respawn protections still pass.

### Target C. Real-time player/combat channel separation

Goal:

- Keep room registry for room, lobby, command, summary state.
- Move high-frequency player position / aim / fire intent toward a dedicated combat transport path.

Scope for next design pass:

- Do not rewrite full networking.
- Define a first channel boundary:
  - `player_state` for position / aim / weapon / hp / alive / sequence.
  - `player_shot` for shot request.
  - server confirm messages for hit / death / respawn / round.
- Avoid full room snapshot writes for per-frame / high-frequency combat state.
- Keep admin / observer snapshots summary-focused.

Pass criteria:

- Room list does not churn because of player movement.
- Combat state updates can be measured separately from room snapshot payload.
- Admin observer traffic can be turned on without heavily worsening player movement.

### Target D. Admin room state as server truth

Goal:

- Admin room list and match progress should come from current server room state first, not stale local observer cache.

Scope:

- Keep BroadcastChannel observer bridge for local observer detail, but do not let it override room lifecycle truth.
- Ensure deleted room selection is invalidated in admin UI.
- Ensure room phase / match progress has a server snapshot path.

Pass criteria:

- Deleted room disappears and does not reappear in admin room list.
- Admin panel shows `playing` when the server room phase is `playing`, even if local observer snapshot is late.
- Admin observer stale snapshot is visibly stale or ignored, not silently treated as current.

## 4. Recommended Order

1. Team / local-player identity unification.
2. Server same-team damage guard.
3. Admin server-truth room lifecycle fix.
4. Real-time combat channel separation design.
5. Controlled 2-player verification.
6. Controlled 4-player alpha retest.

Reason:

- Team identity and same-team damage can create false combat outcomes. Fix those before judging stutter or gameplay.
- Admin server truth prevents stale room / progress confusion during live retests.
- The real-time combat channel is likely needed for polish, but the first two targets are smaller and more urgent.

## 5. Do Not Do Yet

- Do not enable 50vs50.
- Do not start UGC / city expansion.
- Do not rewrite all server authority.
- Do not move AI world simulation fully to server.
- Do not expand BotCommander doctrine.
- Do not do a broad AI V2 rewrite.

## 6. Next Work Item

Next target:

`P0 team identity and server same-team damage scope lock`

This should produce a narrow implementation plan and smoke-test list before code changes. The controlled 4-player alpha retest is on HOLD until this is resolved or consciously accepted as a known-risk retest.
