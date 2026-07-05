# P1 Online Command Marker Ownership / Visibility Bug

Date: 2026-05-23

## Conclusion

This is a P1 online HUD authority/visibility bug, not the current P0 stutter root cause.

General player HUDs should not show another ordinary player's private command marker as the local player's yellow command marker.

## Symptom

A general player did not issue a command, but another player's command/leadership marker appeared on that player's minimap in yellow.

## Expected Behavior

- Local player's own command: may appear as yellow on the local minimap.
- Same-team commander/authorized team command: may be visible, but must use a distinct team-command color or marker treatment.
- Another ordinary player's private command: hidden from the local player's minimap.
- Enemy command: hidden.
- Admin/observer/debug marker: hidden from ordinary player HUDs.

## Priority

P1.

Handle after the P0-10B/P0-10C worldState cadence work, unless a command-marker regression starts blocking online playtest interpretation.

## Check Candidates

- Whether command marker rendering filters by `issuerPlayerId`, local player id, team, and command authority.
- Whether command-authority-free ordinary player commands are treated as broadcast markers.
- Whether admin/observer/debug command markers leak into ordinary player HUD/minimap rendering.
- Whether yellow is reserved for the local player's own command markers only.

## Scope Guard

Do not mix this with P0 stutter/worldState work. The fix should be a narrow marker ownership/visibility pass.
