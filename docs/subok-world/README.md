# Subok World

Subok World is the upper world-state layer for Iron Line. It is not a market UI, item shop, trading system, or live economy feature.

Subok World exists to answer one question:

> Why does the next battle happen under different conditions than the last one?

## Purpose

The first goal is to define a small strategic world loop around factions, territory, production, supply, front pressure, war events, and next-battle conditions.

This keeps the idea connected to the main war game without touching the current P0 online combat stabilization work.

## Relationship To The Main Game

The main game remains the playable 2D tank and infantry battle prototype.

Subok World sits above that battle layer as a future strategic context system:

```text
World state -> battle conditions -> battle result -> changed world state
```

In V0, this relationship is design-only. No runtime connection is allowed yet.

## Why It Is Not Connected Yet

The current project focus is still P0 stabilization, especially online team identity, same-team damage safety, world-state smoothness, room refresh pressure, and manual playtest readiness.

Directly connecting a strategic economy or territory system now would add another source of bugs before the battle layer is stable enough to explain its own failures.

## V0 Goal

V0 is successful if the docs define a narrow strategy-economy loop that can later be tested in isolation:

- factions own territory
- territory produces supply or pressure
- factions make attack, defense, or regroup choices
- war events change territory ownership or production
- those changes alter the next battle conditions

The goal is not to prove that a shop exists. The goal is to prove that territory and faction state can create reasons for future battles.

## Current Documents

- [Strategy Economy V0](strategy-economy-v0.md): scope and loop for the first isolated Subok World prototype.
- [Deferred Scope](deferred-scope.md): features that are intentionally delayed so V0 does not drift into a live market or item shop.

## Current Rule

Do not implement Subok World runtime code until the P0 battle stabilization lane has a clear gate decision and this design has a small isolated test plan.
