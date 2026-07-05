# Roadmap / Next Season Priority Report - 2026-05-22

Decision: the next development season should start with online combat stabilization, then UI / readability, then deeper AI V2 behavior connection.

This report closes the current command / FPS / AI / 50vs50 planning arc and resets priorities. It is a midpoint review, not a feature-expansion brief.

## 1. Completed / Verified Tracks

The following tracks are closed enough to serve as the next season baseline:

| Track | Current Decision | Notes |
| --- | --- | --- |
| Role-specific command system | PASS | `infantry`, `engineer`, `recon`, and `armor` are command authority roles, not weapon classes. |
| `CommanderSlot -> SquadLeader -> Unit` | PASS | Commanders issue orders to squad / asset leaders; units remain executors. |
| Offline commander orders | PASS | Local role commands, `commandState`, lock state, and stopped-state visibility are verified. |
| Online commander orders | PASS | Command packets, role authority, duplicate / stale handling, and broadcast smoke are verified. |
| FPS combat loop | PASS | Movement, aim, fire, reload, hit, death, respawn, damage causes, and feedback are verified at first-pass level. |
| FPS + command integration | PASS | Fighting and command UI coexist without blocking the core loop. |
| Anti-vehicle / vehicle balance | PASS | RPG opportunity, suicide-drone damage, vehicle collision / crush, and tank bailout are verified at first-pass level. |
| Empty-slot `BotCommander` skeleton | PASS | Empty bot slots use the same command format without full AI commander behavior. |
| AI V2 tactical map / cover nodes | PASS | Tactical map, cover nodes, staging, rally, and vehicle hints are generated and observable. |
| AI count expansion through 25vs25 | PASS | 8vs8 / 15vs15 / 25vs25 passed current smoke and performance gates. |
| 50vs50 event candidate | PASS EVENT-ONLY | 50vs50 passed local event budgets, but remains manual event / stress / spectator candidate only. |

## 2. Current Game Identity

The game should now be described as:

**4vs4 role-command 2D battlefield FPS.**

Core identity:

- Human players directly fight.
- Human players command role-owned AI assets.
- AI amplifies human commands and creates battlefield pressure.
- AI should not replace the player as the main decision maker.
- AI-only combat should not decide normal competitive victory.
- 25vs25 is the current approved staged AI scale ceiling for normal progression.
- 50vs50 is event-only / stress / spectator candidate, not a default mode.

This identity should guide the next season. If a feature makes the game feel like pure RTS, pure AI simulation, or passive spectator play, it should be delayed or constrained.

## 3. Why This Is Not Online Complete Yet

The project has verified online commander-order synchronization, but that is not the same as a finished online FPS combat layer.

Still needing separate stabilization:

- Human player position synchronization.
- Aim / shot / fire event consistency.
- Hit confirmation and damage consistency.
- Kill confirmation and kill-log consistency.
- Respawn / round / win-state synchronization.
- Latency, duplicate events, stale packets, and packet-loss behavior.
- Host / world-host departure and handoff during combat.
- Repeated live tests with two or more human clients.

Current interpretation:

- Online command sync PASS means human orders can be shared with the room.
- FPS combat loop PASS means local/direct combat works at first-pass level.
- Neither result proves that two human players can repeatedly move, shoot, hit, die, respawn, and resolve victory consistently over the network.

The next season must not assume the game is "online complete." It should treat online combat stabilization as the next foundation gate.

## 4. Remaining Core Risks

### Online Combat Judgment / Consistency

Current risk:

- Online command sync is verified, but full human combat consistency is still a separate risk.

Specific risks:

- Player position sync drift.
- Aim / shot event mismatch.
- Hit confirmation disagreement.
- Death / respawn / round-state mismatch.
- Kill-log and damage-cause inconsistency.
- Duplicate or delayed combat events.
- Host / world-host departure during active combat.

Why this matters:

- The game can have excellent AI, but if a human player says "I shot him on my screen" and the other client disagrees, the core FPS feel breaks.

### Server Authority Decision

Current risk:

- Full server-authority combat is not implemented and should not be rushed blindly.

Decision needed:

- Keep short-term event-flow / host-flow combat and tighten it, or begin a limited server-authority hit-confirmation layer.

Recommended framing:

- Do not start a full server-authority rewrite next.
- Start with online combat stabilization first pass: logging, packet order, hit / death consistency, round-state consistency, and smoke coverage.

### UI / Readability / Battlefield Density

Current risk:

- AI scale and 50vs50 event candidate passed performance smoke, but visual readability is not guaranteed by performance numbers.

Risks:

- Too many markers.
- Kill log / command log / death feedback overlap.
- Vehicle / drone / explosion density.
- Hard to know who shot whom.
- Hard to see whether a player command changed the front.

### AI V2 Behavior Connection Depth

Current risk:

- Tactical map / cover nodes exist, but only limited AI states reference them.

Risks:

- AI still feels like command-following behavior plus local heuristics instead of battlefield-aware units.
- Staging / rally / cover data may be underused.
- Vehicle traffic hints may need deeper convoy / wait behavior.

### BotCommander Doctrine / Personality

Current risk:

- The skeleton can fill empty slots, but it is not yet a meaningful AI commander.

Risks:

- Empty slots may feel generic.
- Bot commands may lack style, caution, or role-specific intent.
- Overbuilding BotCommander too early could fight the human-command design.

### 25vs25 / 50vs50 Performance Variance

Current risk:

- 25vs25 passed after the narrow LOD correction, and 50vs50 passed event-only local budgets. Both still need caution under broader machines, browsers, online conditions, and longer sessions.

Risks:

- Combat bursts, drone activity, vehicle traffic, observer snapshots, and render density can still produce variance.
- 50vs50 remains event-only because performance pass does not equal competitive readability or online readiness.

### UGC / Map Change Readiness

Current risk:

- Tactical map data is generated from map / obstacle / objective / spawn information and optional tags, but UGC workflows are not built.

Risks:

- New maps may produce poor cover / staging / traffic hints.
- Designers may need debug tools to see why AI chooses routes.
- Premature UGC could multiply AI bugs if the base behavior is not readable enough.

## 5. Next Season Candidates

### Candidate A: Online Combat Stabilization First Pass

Expected effect:

- Makes the FPS core trustworthy in multiplayer.
- Separates command-sync bugs from combat-sync bugs.
- Builds confidence before broader online player testing.

Risk:

- Medium-high. Network bugs can spread across player state, damage, death, round flow, and UI.

Work size:

- Medium if scoped to first-pass logging / packet consistency / smoke tests.
- Large if it becomes full server-authority combat.

Why now:

- Command sync, FPS loop, and FPS + command integration are already closed enough.
- The next weak link is human-vs-human combat reliability.

Problem if delayed:

- More AI and event work will hide the real multiplayer combat issues.
- Later debugging will mix AI scale, host state, and shot consistency into one problem.

Suggested scope:

- Player position / aim / fire / hit / death event trace.
- Duplicate / stale combat event handling.
- Kill-log / damage-cause consistency.
- Respawn / round-state consistency.
- Host departure / world-host handoff observation.
- Online combat smoke extension with repeated two-client runs.

Do not include:

- Full server-authority rewrite.
- Ranked anti-cheat.
- Large combat balance overhaul.

### Candidate B: UI / Readability / Battlefield Information

Expected effect:

- Makes the game understandable under real battlefield pressure.
- Helps players see command results, damage causes, and front movement.
- Reduces the chance that large AI battles feel random.

Risk:

- Medium. UI can sprawl if it tries to explain everything.

Work size:

- Medium.

Why now:

- FPS loop, command logs, kill logs, death reasons, command state, LOD, and observer summaries all exist.
- The next step is making them readable together.

Problem if delayed:

- Players may read the game as noise even if the systems work.
- 50vs50 event mode may look impressive but confusing.

Suggested scope:

- HUD hierarchy pass.
- Kill log / command log / death-cause spacing.
- Role command state indicators.
- Friendly / enemy / squad readability.
- Minimal front-line / objective pressure indicators.
- Admin / observer summary readability.

Do not include:

- Marketing UI.
- Cosmetic skin system.
- Full map editor / UGC UI.

### Candidate C: AI V2 Behavior Connection

Expected effect:

- Makes AI use tactical map data more visibly.
- Improves staging, cover, rally, waitForClear, and vehicle support behavior.
- Helps AI feel less like independent condition checks and more like role-commanded squads.

Risk:

- Medium-high. AI behavior changes can reintroduce stuck / command override / tempo problems.

Work size:

- Medium to large.

Why now:

- Tactical map / cover-node data is ready.
- Runtime LOD is working.
- Command structure is stable enough to connect more behavior without rewriting everything.

Problem if delayed:

- AI V2 data may remain mostly diagnostic.
- Players may not feel the benefit of tactical-map work.

Suggested scope:

- Cover selection uses cover nodes in more states.
- Rally / staging points influence squad approach.
- Vehicle wait / convoy hints influence vehicle behavior.
- Command lock and player command priority remain untouched.
- Debug shows which tactical node was used and why.

Do not include:

- Full AI rewrite.
- Learning AI.
- Complex doctrine editor.
- 50vs50-specific AI behavior.

### Candidate D: BotCommander Doctrine / Personality First Pass

Expected effect:

- Empty slots feel more coherent.
- Bot commanders can choose simple role-appropriate tendencies without full intelligence.

Risk:

- Medium. Easy to overbuild into full AI commander.

Work size:

- Medium.

Why not first:

- Human online combat stability matters more.
- BotCommander skeleton already works as a placeholder.

Recommended timing:

- After online combat stabilization and readability pass.

Suggested scope:

- Simple doctrine presets only: cautious, balanced, aggressive.
- 5-15 second decision cadence.
- Same command packet format.
- No direct unit control.

### Candidate E: UGC / Map-Making Foundation

Expected effect:

- Long-term content growth.
- Tactical map / cover / traffic tags can become creator-facing.

Risk:

- High. UGC multiplies edge cases.

Work size:

- Large.

Why not first:

- Online combat and readability need to be stronger before opening content creation.
- AI behavior should use tactical map data more deeply first.

Recommended timing:

- After AI V2 behavior connection and readability pass.

### Candidate F: 50vs50 Event Presentation / Spectator Tools

Expected effect:

- Turns the event candidate into a showcase / observer mode.
- Helps large battles feel intentional rather than chaotic.

Risk:

- Medium. Event presentation can distract from core 4vs4 gameplay.

Work size:

- Medium.

Why not first:

- 50vs50 passed local event budgets but is still not a core mode.
- Online combat / readability should come first.

Recommended timing:

- After UI / readability pass, or in parallel only if strictly spectator/admin scoped.

## 6. Recommended Priority

### Priority 1: Online Combat Stabilization First Pass

Expected effect:

- Makes human combat trustworthy online.
- Enables better multiplayer testing.
- Establishes whether host-flow combat is enough or a limited server-authority layer is needed.

Risk:

- Medium-high.

Work size:

- Medium if scoped correctly.

Why now:

- The project has already stabilized command sync and the local FPS loop.
- Human combat consistency is now the most important missing foundation.

If delayed:

- Future AI / UI / event work may mask online combat bugs.

First-pass deliverable:

- `online-combat-stabilization-first-pass-report`.

### Priority 2: UI / Readability / Battlefield Information

Expected effect:

- Makes command + FPS + AI pressure understandable.
- Reduces "random battlefield noise" feeling.
- Helps both normal 25vs25-scale play and 50vs50 event observation.

Risk:

- Medium.

Work size:

- Medium.

Why now:

- Many systems now produce state. The player needs clean hierarchy, not more raw data.

If delayed:

- Players may not feel their command impact even when the system works.

First-pass deliverable:

- `battlefield-readability-first-pass-report`.

### Priority 3: AI V2 Behavior Connection

Expected effect:

- Turns tactical-map data into visible battlefield behavior.
- Improves AI tempo, cover, rally, and vehicle wait behavior.

Risk:

- Medium-high.

Work size:

- Medium to large.

Why now:

- Tactical map / cover nodes are ready, but behavior connection is still shallow.

If delayed:

- AI V2 remains mostly data and debug output instead of gameplay value.

First-pass deliverable:

- `ai-v2-behavior-connection-first-pass-report`.

## 7. Final Recommendation

Next season should start with:

1. **Online combat stabilization first pass**
2. **UI / readability / battlefield information pass**
3. **AI V2 behavior connection**

Hold until later:

- Full server-authority combat rewrite.
- BotCommander doctrine / personality.
- UGC / map editor foundation.
- 50vs50 event presentation tools.
- City / open-world expansion.

Strategic reason:

- The game has enough structure now. The next risk is not lack of features; it is whether humans can reliably fight, understand the battle, and feel that their commands change the front.

Operating rule for the next season:

- Do not add broad new feature branches before online combat reliability and readability are stronger.
- Keep 25vs25 as the normal staged AI scale ceiling.
- Keep 50vs50 event-only.

One-line conclusion:

- The current project state is the foundation of an online role-command battlefield FPS. The next season must make online human combat reliable: players move, aim, shoot, get hit, die, respawn, and resolve victory consistently across clients.
