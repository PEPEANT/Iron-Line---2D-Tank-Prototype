# Subok World Strategy Economy V0

Conclusion: V0 is a territory-and-faction loop, not an item market.

## Purpose

Strategy Economy V0 defines the smallest useful world simulation for Subok World.

The purpose is to verify whether faction territory changes can create different future battle conditions. This is the strategic layer that can eventually make the main war game feel like part of a continuing conflict instead of isolated matches.

## Core Loop

```text
Faction -> territory control -> production and supply -> war choice -> territory change -> economy change -> next battle conditions
```

The important output is not a price list. The important output is a changed war situation.

## Core Units

- Faction: a side or organization that owns territory and chooses how to act.
- Territory: a named area that can be controlled, contested, damaged, or lost.
- Production: what a territory contributes each turn, such as fuel, industry, manpower, supply, or intelligence.
- Supply: the faction's ability to keep fighting, reinforce, repair, and move.
- Front pressure: a simple measure of where a faction is pushing, holding, or collapsing.
- War event: a resolved event that changes ownership, production, supply, morale, or next-battle conditions.
- Next battle condition: a compact output that the battle game could later read, such as fuel shortage, delayed reinforcements, stronger armor presence, limited repair, or defensive advantage.

## V0 Scope

V0 should stay small enough to simulate without the main game:

- 2 to 3 factions
- 6 to 10 territories
- 1 to 2 production values per territory
- faction-level supply, manpower, industry, and morale values
- one turn-based choice per faction: attack, defend, or regroup
- simple war events that can change territory ownership or damage production
- next-turn production updates based on territory control
- result JSON
- short war-news summaries

## What V0 Must Prove

V0 must prove that world state creates pressure:

- Losing an industrial territory should reduce future repair or armor capacity.
- Losing fuel production should make movement or armored pressure harder.
- Holding a defensive region should make the next battle more favorable there.
- Repeated losses should change a faction's future choices.
- A faction should sometimes choose defense or regrouping for a visible reason.

## Example Turn

```text
Turn 12
Red faction attacks North Refinery.
Blue faction defends because fuel reserves are low.
Red wins narrowly and captures the refinery.
Blue fuel production drops next turn.
Next battle condition: Blue armored units start with limited fuel; Red gains forward supply pressure.
```

This is more important than recording that a tank price changed. The strategic result explains why the next battle starts differently.

## Success Criteria

V0 succeeds when a 100-turn isolated simulation can produce different territory maps, faction supply states, war choices, and next-battle conditions.

The success question is:

> Did faction and territory changes create different future war conditions?

It is not:

> Did the project gain a shop, price table, or user market?

## Non-Goals

V0 does not implement:

- live online economy
- user trading
- detailed item shops
- per-part price simulation
- account inventory
- persistent server economy
- direct integration with the main battle runtime

Those belong to deferred scope.

## Next Small Step

The next small step after this document is not gameplay integration. It is a data-only design sketch:

- candidate factions
- candidate territories
- production fields
- battle-condition outputs
- a future isolated simulation shape
