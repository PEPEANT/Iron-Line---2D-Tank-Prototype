"use strict";

(function registerAIObservatory(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, normalizeAngle, angleTo, segmentDistanceToPoint } = IronLine.math;
  const { hasLineOfSight } = IronLine.physics;

  const ISSUE_LABELS = {
    stuck: "끼임 의심",
    no_target: "목표 없음",
    no_line_of_sight: "사선 없음",
    out_of_range: "사거리 밖",
    friendly_in_line: "아군 사선 위험",
    friendly_splash_risk: "아군 폭발 위험",
    weapon_not_ready: "무장 준비 중",
    not_facing: "조준 미완료",
    reaction_delay: "반응 지연",
    suppressed: "제압됨",
    mounted: "차량 탑승 중",
    transport_waiting: "수송 대기",
    unload_blocked: "하차 보류",
    vehicle_player_controlled: "플레이어 차량 점유",
    vehicle_taken_cover: "차량 탈취 후 이탈",
    no_assignment: "배정 없음",
    seat_occupied: "좌석 점유",
    no_cover: "엄폐 부족",
    support_request: "지원 요청",
    fire_ready: "사격 가능"
  };

  Object.assign(ISSUE_LABELS, {
    stuck: "이동 정체",
    no_target: "목표 없음",
    no_line_of_sight: "사선 없음",
    out_of_range: "사거리 밖",
    friendly_in_line: "아군 사선 위험",
    friendly_splash_risk: "아군 폭발 위험",
    weapon_not_ready: "무장 준비 중",
    not_facing: "조준 미완료",
    reaction_delay: "반응 지연",
    suppressed: "제압됨",
    mounted: "차량 탑승 중",
    transport_waiting: "수송 대기",
    unload_blocked: "하차 보류",
    vehicle_player_controlled: "플레이어 차량 점유",
    vehicle_taken_cover: "차량 엄폐 이동",
    no_assignment: "배정 없음",
    seat_occupied: "좌석 점유",
    no_cover: "엄폐 부족",
    support_request: "지원 요청",
    fire_ready: "사격 가능",
    approaching: "수리 위치로 이동",
    kit_cooldown: "수리킷 재사용 대기",
    no_repair_kit: "수리킷 없음",
    repair_applied: "수리 적용",
    target_invalid: "대상 없음",
    already_repaired: "이미 수리됨"
  });

  class AIObservatory {
    constructor(game) {
      this.game = game;
      this.timer = 0;
      this.sequence = 0;
      this.events = [];
      this.maxEvents = 220;
      this.history = new Map();
      this.lastSnapshot = null;
    }

    reset() {
      this.timer = 0;
      this.events.length = 0;
      this.history.clear();
      this.lastSnapshot = null;
    }

    update(dt = 0) {
      this.timer -= dt;
      if (this.timer > 0) return this.lastSnapshot;
      this.timer = 0.42;
      return this.collect();
    }

    latest() {
      return this.lastSnapshot || this.collect();
    }

    collect() {
      const snapshot = this.createSnapshot();
      this.detectChanges(snapshot);
      this.lastSnapshot = snapshot;
      return snapshot;
    }

    recordEvent(event = {}) {
      this.pushEvent({
        unitId: event.unitId || event.id || "system",
        aiType: event.aiType || event.kind || "system",
        kind: event.kind || event.aiType || "system",
        team: event.team || "",
        state: event.state || "",
        order: event.order || "",
        target: event.targetId || event.target || "",
        decision: event.decision || event.type || "event",
        reason: event.reason || "",
        score: this.roundScore(event.score ?? 0),
        scores: event.scores || null,
        issues: event.issues || []
      });
    }

    createSnapshot() {
      const units = [
        ...(this.game.squads || []).map((squad) => this.squadSnapshot(squad)).filter(Boolean),
        ...(this.game.tanks || []).map((tank) => this.vehicleSnapshot(tank, "tank")).filter(Boolean),
        ...(this.game.humvees || []).map((humvee) => this.vehicleSnapshot(humvee, "humvee")).filter(Boolean),
        ...(this.game.crews || []).map((crew) => this.crewSnapshot(crew)).filter(Boolean)
      ];

      const issueCounts = units.reduce((counts, unit) => {
        for (const issue of unit.issues || []) counts[issue] = (counts[issue] || 0) + 1;
        return counts;
      }, {});
      const decisionCounts = units.reduce((counts, unit) => {
        const decision = unit.decision?.decision || "unknown";
        counts[decision] = (counts[decision] || 0) + 1;
        return counts;
      }, {});

      return {
        version: 2,
        updatedAt: Date.now(),
        roomId: this.game.onlineSession?.roomId || "local",
        phase: this.game.matchPhase || "",
        paused: Boolean(this.game.testLabAiPaused),
        summary: {
          total: units.length,
          squads: units.filter((unit) => unit.kind === "squad").length,
          vehicles: units.filter((unit) => unit.kind === "vehicle").length,
          crews: units.filter((unit) => unit.kind === "crew").length,
          warnings: units.filter((unit) => (unit.issues || []).length > 0).length,
          issueCounts,
          decisionCounts
        },
        units,
        events: this.events.slice(-100)
      };
    }

    squadSnapshot(squad) {
      if (!squad?.units?.length) return null;
      const active = squad.activeUnits?.() || [];
      const aliveUnits = squad.units.filter((unit) => unit.alive);
      const centerUnits = active.length ? active : aliveUnits;
      const center = this.centerOf(centerUnits);
      const memberStates = active.map((unit) => this.infantryState(unit));
      const maxStuck = memberStates.reduce((max, item) => Math.max(max, item.stuck || 0), 0);
      const stateCounts = memberStates.reduce((counts, item) => {
        const state = item.state || "unknown";
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      }, {});
      const order = squad.manualOrder
        ? this.commandLabel(squad.manualOrder.type)
        : squad.order?.objectiveName || "자동";
      const issues = [];
      if (maxStuck > 1.4) issues.push(ISSUE_LABELS.stuck);
      if (active.length > 0 && active.every((unit) => unit.inVehicle)) issues.push(ISSUE_LABELS.mounted);
      if (squad.supportRequest?.type) issues.push(ISSUE_LABELS.support_request);

      const decision = this.squadDecision(squad, memberStates, issues);
      return {
        key: `squad:${squad.callSign}`,
        kind: "squad",
        aiType: "squad",
        id: squad.callSign,
        team: squad.team,
        ownerSlotId: squad.ownerSlotId || "",
        x: center?.x || squad.order?.point?.x || 0,
        y: center?.y || squad.order?.point?.y || 0,
        alive: active.length,
        total: squad.units.filter((unit) => unit.classId !== "scout").length || squad.units.length,
        state: squad.tacticalMode || "idle",
        order,
        objective: squad.order?.objectiveName || squad.order?.point?.name || "",
        target: squad.status?.lastThreat?.callSign || squad.status?.armorThreat?.vehicle?.callSign || "",
        supportRequest: squad.supportRequest?.type || "",
        stuck: maxStuck,
        stateCounts,
        sample: memberStates.slice(0, 5),
        decision,
        issues
      };
    }

    infantryState(unit) {
      const debug = unit.ai?.debug || {};
      const decision = this.infantryDecision(unit, debug);
      return {
        id: unit.callSign,
        classId: unit.classId || "",
        weaponId: unit.weaponId || "",
        state: debug.state || unit.ai?.state || "",
        thought: debug.thought || "",
        target: this.targetId(debug.target || unit.ai?.target),
        stuck: Number(debug.stuckTimer || unit.ai?.stuckTimer || 0),
        suppression: Math.round(unit.suppression || 0),
        morale: Math.round(unit.morale || 0),
        inVehicle: Boolean(unit.inVehicle),
        coverQuality: Number(debug.coverQuality || 0),
        decision
      };
    }

    vehicleSnapshot(vehicle, type) {
      if (!vehicle || vehicle.alive === false) return null;
      const ai = vehicle.ai || null;
      const debug = ai?.debug || {};
      const state = debug.state || ai?.state || (vehicle.playerControlled ? "player" : "idle");
      const target = debug.target || ai?.target || ai?.targetTank || null;
      const stuck = Number(debug.stuckTimer || 0);
      const order = debug.goal || ai?.currentOrder?.objectiveName || vehicle.manualOrder?.type || "자동";
      const decision = this.vehicleDecision(vehicle, type, debug, state, target, stuck);
      const issues = [];
      if (stuck > 1.4) issues.push(ISSUE_LABELS.stuck);
      if (type === "humvee" && decision.reason === "unload_blocked") issues.push(ISSUE_LABELS.unload_blocked);
      if (type === "humvee" && (debug.passengers || vehicle.passengerCount?.() || 0) > 0 && !String(state).includes("transport")) {
        issues.push(ISSUE_LABELS.transport_waiting);
      }
      if (decision.reason === "no_line_of_sight") issues.push(ISSUE_LABELS.no_line_of_sight);
      if (decision.reason === "friendly_in_line" || debug.unsafeLine) issues.push(ISSUE_LABELS.friendly_in_line);
      if (debug.supportRequest) issues.push(ISSUE_LABELS.support_request);

      return {
        key: `vehicle:${vehicle.callSign}`,
        kind: "vehicle",
        aiType: type,
        type,
        id: vehicle.callSign,
        team: vehicle.team,
        x: vehicle.x,
        y: vehicle.y,
        hp: Math.round(vehicle.hp || 0),
        maxHp: Math.round(vehicle.maxHp || 1),
        state,
        order,
        target: this.targetId(target),
        stuck,
        passengers: debug.passengers || vehicle.passengerCount?.() || 0,
        visible: debug.visible,
        unsafeLine: Boolean(debug.unsafeLine),
        pathIndex: debug.pathIndex || 0,
        pathLength: Array.isArray(debug.path) ? debug.path.length : 0,
        decision,
        issues
      };
    }

    crewSnapshot(crew) {
      if (!crew || !crew.alive) return null;
      const target = crew.targetTank || crew.inTank || null;
      const decision = this.crewDecision(crew, target);
      const issues = [];
      if (decision.reason === "vehicle_player_controlled") issues.push(ISSUE_LABELS.vehicle_player_controlled);
      if (decision.reason === "vehicle_taken_cover") issues.push(ISSUE_LABELS.vehicle_taken_cover);
      if (decision.reason === "no_assignment") issues.push(ISSUE_LABELS.no_assignment);
      if (decision.reason === "seat_occupied") issues.push(ISSUE_LABELS.seat_occupied);

      return {
        key: `crew:${crew.callSign}`,
        kind: "crew",
        aiType: "crew",
        id: crew.callSign,
        team: crew.team,
        x: crew.x,
        y: crew.y,
        hp: Math.round(crew.hp || 0),
        maxHp: Math.round(crew.maxHp || 1),
        state: crew.state || "idle",
        order: target?.callSign ? `차량 ${target.callSign}` : "자동",
        target: target?.callSign || "",
        stuck: 0,
        decision,
        issues
      };
    }

    infantryDecision(unit, debug = {}) {
      if (debug.decision) return this.normalizeDecision(debug.decision);
      const target = debug.target || unit.ai?.target || null;
      const weapon = INFANTRY_WEAPONS[debug.weaponId || unit.weaponId] || INFANTRY_WEAPONS.rifle;
      const weaponRange = IronLine.combat?.smallArmsRange?.(weapon, unit, weapon.range) || weapon.range || 0;
      const distance = target ? distXY(unit.x, unit.y, target.x, target.y) : Infinity;
      const inVehicle = Boolean(unit.inVehicle);
      const visible = Boolean(target && hasLineOfSight(this.game, unit, target, { padding: 3 }));
      const inRange = target ? distance <= weaponRange + (target.radius || 0) : false;
      const targetAngle = target ? angleTo(unit.x, unit.y, target.x, target.y) : unit.angle;
      const facing = target ? Math.abs(normalizeAngle(unit.angle - targetAngle)) <= 0.46 : false;
      const reactionReady = target ? unit.ai?.isReadyToFireAt?.(target) !== false : false;
      const weaponReady = (unit.ai?.fireCooldown || 0) <= 0.02;
      const friendlyBlocked = target ? this.friendlyLaneBlocked(unit, target, 22) : false;
      const suppression = clamp((unit.suppression || 0) / 100, 0, 1);
      const stuck = Number(debug.stuckTimer || unit.ai?.stuckTimer || 0);
      const coverQuality = Number(debug.coverQuality || 0);
      const fireScore = this.roundScore(
        (target ? 0.08 : 0) +
        (visible ? 0.31 : 0) +
        (inRange ? 0.23 : 0) +
        (facing ? 0.13 : 0) +
        (reactionReady ? 0.1 : 0) +
        (weaponReady ? 0.1 : 0) -
        (friendlyBlocked ? 0.6 : 0) -
        (inVehicle ? 0.75 : 0) -
        suppression * 0.2
      );
      const moveScore = this.roundScore((debug.moveTarget ? 0.56 : 0.18) - clamp(stuck / 3, 0, 0.46));
      const coverScore = this.roundScore(clamp(suppression * 0.48 + (coverQuality > 0 ? 0.22 : 0) + (debug.coverTarget ? 0.22 : 0), 0, 1));

      let reason = "no_target";
      let decision = "idle";
      if (inVehicle) {
        reason = "mounted";
        decision = "hold_fire";
      } else if (!target) {
        reason = "no_target";
        decision = debug.moveTarget ? "move" : "idle";
      } else if (!visible) {
        reason = "no_line_of_sight";
        decision = "hold_fire";
      } else if (!inRange) {
        reason = "out_of_range";
        decision = "move";
      } else if (friendlyBlocked) {
        reason = "friendly_in_line";
        decision = "hold_fire";
      } else if (!facing) {
        reason = "not_facing";
        decision = "aim";
      } else if (!reactionReady) {
        reason = "reaction_delay";
        decision = "aim";
      } else if (!weaponReady) {
        reason = "weapon_not_ready";
        decision = "hold_fire";
      } else if (suppression > 0.72) {
        reason = "suppressed";
        decision = "hold_fire";
      } else {
        reason = "fire_ready";
        decision = fireScore >= 0.62 ? "fire" : "hold_fire";
      }

      if (stuck > 1.4 && decision !== "fire") {
        reason = "stuck";
        decision = "recover_move";
      }

      return {
        decision,
        reason,
        reasonLabel: ISSUE_LABELS[reason] || reason,
        score: fireScore,
        scores: { fire: fireScore, move: moveScore, cover: coverScore },
        facts: {
          targetId: this.targetId(target),
          visible,
          inRange,
          facing,
          reactionReady,
          weaponReady,
          friendlyBlocked,
          suppression: this.roundScore(suppression),
          stuck: this.roundScore(stuck),
          coverCandidates: debug.coverTarget ? 1 : 0
        }
      };
    }

    vehicleDecision(vehicle, type, debug = {}, state = "", target = null, stuck = 0) {
      if (debug.decision) return this.normalizeDecision(debug.decision);
      if (type === "humvee") return this.humveeDecision(vehicle, debug, state, target, stuck);
      return this.tankDecision(vehicle, debug, state, target, stuck);
    }

    tankDecision(vehicle, debug = {}, _state = "", target = null, stuck = 0) {
      const visible = target ? debug.visible !== false : false;
      const unsafeLine = Boolean(debug.unsafeLine);
      const weaponReady = vehicle.canFire?.() !== false;
      const fireScore = this.roundScore(
        (target ? 0.12 : 0) +
        (visible ? 0.3 : 0) +
        (!unsafeLine ? 0.22 : -0.6) +
        (weaponReady ? 0.16 : 0) -
        clamp(stuck / 5, 0, 0.24)
      );
      let reason = "no_target";
      let decision = "idle";
      if (!target) {
        reason = "no_target";
        decision = debug.moveTarget ? "move" : "idle";
      } else if (!visible) {
        reason = "no_line_of_sight";
        decision = "hold_fire";
      } else if (unsafeLine) {
        reason = "friendly_in_line";
        decision = "hold_fire";
      } else if (!weaponReady) {
        reason = "weapon_not_ready";
        decision = "hold_fire";
      } else {
        reason = "fire_ready";
        decision = fireScore >= 0.58 ? "fire" : "hold_fire";
      }
      if (stuck > 1.4 && decision !== "fire") {
        reason = "stuck";
        decision = "recover_move";
      }
      return {
        decision,
        reason,
        reasonLabel: ISSUE_LABELS[reason] || reason,
        score: fireScore,
        scores: {
          fire: fireScore,
          move: this.roundScore((debug.moveTarget ? 0.58 : 0.15) - clamp(stuck / 4, 0, 0.45)),
          cover: 0
        },
        facts: {
          targetId: this.targetId(target),
          visible,
          unsafeLine,
          weaponReady,
          stuck: this.roundScore(stuck)
        }
      };
    }

    humveeDecision(vehicle, debug = {}, state = "", target = null, stuck = 0) {
      const passengers = debug.passengers || vehicle.passengerCount?.() || 0;
      const visible = Boolean(target && hasLineOfSight(this.game, vehicle.machineGunMuzzlePoint?.() || vehicle, target, { padding: 4 }));
      const weaponReady = vehicle.machineGunCooldown <= 0.02;
      const fireScore = this.roundScore(
        (target ? 0.12 : 0) +
        (visible ? 0.35 : 0) +
        (weaponReady ? 0.14 : 0) -
        clamp(stuck / 5, 0, 0.22)
      );
      const unloadScore = this.roundScore(
        (passengers > 0 ? 0.42 : 0) +
        (String(state).includes("dismount") ? 0.32 : 0) -
        (target && distXY(vehicle.x, vehicle.y, target.x, target.y) < 230 ? 0.38 : 0)
      );
      let reason = "no_target";
      let decision = "idle";
      if (passengers > 0 && String(state).includes("dismount")) {
        reason = "fire_ready";
        decision = "unload";
      } else if (passengers > 0 && target && distXY(vehicle.x, vehicle.y, target.x, target.y) < 230) {
        reason = "unload_blocked";
        decision = "hold_passengers";
      } else if (target && !visible) {
        reason = "no_line_of_sight";
        decision = "hold_fire";
      } else if (target && !weaponReady) {
        reason = "weapon_not_ready";
        decision = "hold_fire";
      } else if (target) {
        reason = "fire_ready";
        decision = "fire";
      } else if (passengers > 0) {
        reason = "transport_waiting";
        decision = "transport";
      } else {
        reason = debug.moveTarget ? "no_target" : "no_target";
        decision = debug.moveTarget ? "move" : "idle";
      }
      if (stuck > 1.4 && decision !== "fire") {
        reason = "stuck";
        decision = "recover_move";
      }
      return {
        decision,
        reason,
        reasonLabel: ISSUE_LABELS[reason] || reason,
        score: decision === "unload" || decision === "hold_passengers" ? unloadScore : fireScore,
        scores: {
          fire: fireScore,
          move: this.roundScore((debug.moveTarget ? 0.56 : 0.18) - clamp(stuck / 4, 0, 0.4)),
          unload: unloadScore
        },
        facts: {
          targetId: this.targetId(target),
          visible,
          weaponReady,
          passengers,
          stuck: this.roundScore(stuck)
        }
      };
    }

    crewDecision(crew, target = null) {
      const hasTarget = Boolean(target?.alive);
      const mounted = Boolean(crew.inTank);
      const playerControlled = Boolean(target?.playerControlled);
      const seatOccupied = Boolean(target?.crew && target.crew !== crew);
      const distance = target ? distXY(crew.x, crew.y, target.x, target.y) : Infinity;
      const nearVehicle = distance < (target?.radius || 30) + 96;
      const remountScore = this.roundScore(
        (hasTarget ? 0.35 : 0) +
        (!playerControlled ? 0.24 : -0.42) +
        (!seatOccupied ? 0.18 : -0.32) +
        (nearVehicle ? 0.16 : 0.06)
      );
      const coverScore = this.roundScore(
        (playerControlled ? 0.56 : 0) +
        (nearVehicle ? 0.2 : 0.08) -
        (mounted ? 0.4 : 0)
      );
      let reason = "no_assignment";
      let decision = "idle";

      if (mounted) {
        reason = "mounted";
        decision = "mounted";
      } else if (!hasTarget) {
        reason = "no_assignment";
        decision = "idle";
      } else if (playerControlled && crew.state === "vehicle-taken-cover") {
        reason = "vehicle_taken_cover";
        decision = "take_cover";
      } else if (playerControlled) {
        reason = "vehicle_player_controlled";
        decision = "hold_position";
      } else if (seatOccupied) {
        reason = "seat_occupied";
        decision = "hold_position";
      } else {
        reason = "fire_ready";
        decision = distance <= (target.radius || 30) + 18 ? "mount" : "move";
      }

      return {
        decision,
        reason,
        reasonLabel: ISSUE_LABELS[reason] || reason,
        score: decision === "take_cover" || decision === "hold_position" ? coverScore : remountScore,
        scores: {
          remount: remountScore,
          cover: coverScore,
          idle: decision === "idle" ? 0.72 : 0.08
        },
        facts: {
          targetId: this.targetId(target),
          mounted,
          playerControlled,
          seatOccupied,
          distance: Math.round(Number.isFinite(distance) ? distance : 0)
        }
      };
    }

    squadDecision(squad, memberStates, issues) {
      const decisions = memberStates.map((member) => member.decision).filter(Boolean);
      const avg = (key) => this.roundScore(decisions.reduce((sum, decision) => sum + (decision.scores?.[key] || 0), 0) / Math.max(1, decisions.length));
      const fire = avg("fire");
      const move = avg("move");
      const cover = avg("cover");
      let decision = "move";
      let reason = "no_target";
      if (issues.includes(ISSUE_LABELS.stuck)) {
        decision = "recover_move";
        reason = "stuck";
      } else if (cover > fire && cover > 0.42) {
        decision = "cover";
        reason = cover > 0.62 ? "suppressed" : "no_cover";
      } else if (fire > 0.58) {
        decision = "fire";
        reason = "fire_ready";
      } else if (squad.order?.point) {
        decision = "move";
        reason = "no_target";
      } else {
        decision = "idle";
        reason = "no_target";
      }
      return {
        decision,
        reason,
        reasonLabel: ISSUE_LABELS[reason] || reason,
        score: Math.max(fire, move, cover),
        scores: { fire, move, cover },
        facts: {
          members: memberStates.length,
          activeFireReady: decisions.filter((item) => item.reason === "fire_ready").length,
          activeBlocked: decisions.filter((item) => item.reason === "friendly_in_line" || item.reason === "no_line_of_sight").length
        }
      };
    }

    normalizeDecision(decision) {
      const reason = decision.reason || "no_target";
      return {
        decision: decision.decision || decision.action || "hold_fire",
        reason,
        reasonLabel: decision.reasonLabel || ISSUE_LABELS[reason] || reason,
        score: this.roundScore(decision.score || 0),
        scores: decision.scores || {},
        facts: decision.facts || {}
      };
    }

    friendlyLaneBlocked(shooter, target, laneWidth = 22) {
      if (!shooter || !target) return false;
      const check = (entity, radius = 10) => {
        if (!entity || entity === shooter || entity === target) return false;
        const alive = entity.alive !== undefined ? entity.alive : entity.hp > 0;
        if (!alive || entity.team !== shooter.team) return false;
        return segmentDistanceToPoint(shooter.x, shooter.y, target.x, target.y, entity.x, entity.y) <= laneWidth + radius;
      };
      for (const tank of this.game.tanks || []) {
        if (check(tank, tank.radius || 28)) return true;
      }
      for (const humvee of this.game.humvees || []) {
        if (check(humvee, humvee.radius || 22)) return true;
      }
      for (const unit of this.game.infantry || []) {
        if (unit.inVehicle) continue;
        if (check(unit, unit.radius || 8)) return true;
      }
      for (const crew of this.game.crews || []) {
        if (crew.inTank) continue;
        if (check(crew, crew.radius || 8)) return true;
      }
      if (shooter.team === TEAM.BLUE && !this.game.player.inTank && this.game.player.hp > 0) {
        if (check(this.game.player, this.game.player.radius || 9)) return true;
      }
      return false;
    }

    detectChanges(snapshot) {
      for (const unit of snapshot.units || []) {
        const previous = this.history.get(unit.key);
        const issueKey = (unit.issues || []).join(",");
        const decisionKey = `${unit.decision?.decision || ""}|${unit.decision?.reason || ""}|${unit.decision?.score || 0}`;
        const stateKey = `${unit.state}|${unit.order}|${unit.target}|${issueKey}|${decisionKey}`;
        const now = performance.now();
        if (!previous) {
          this.history.set(unit.key, { stateKey, issueKey, decisionKey, lastEventAt: now, x: unit.x, y: unit.y });
          continue;
        }

        const moved = distXY(previous.x || 0, previous.y || 0, unit.x || 0, unit.y || 0);
        const importantIssue = (unit.issues || []).length > 0 && now - previous.lastEventAt > 2400;
        const decisionChanged = previous.decisionKey !== decisionKey && now - previous.lastEventAt > 900;
        const stateChanged = previous.stateKey !== stateKey;
        if (stateChanged || decisionChanged || importantIssue) {
          this.pushEvent({
            unitId: unit.id,
            aiType: unit.aiType || unit.kind,
            kind: unit.kind,
            team: unit.team,
            state: unit.state,
            order: unit.order,
            target: unit.target,
            decision: unit.decision?.decision || "",
            reason: unit.decision?.reason || "",
            reasonLabel: unit.decision?.reasonLabel || "",
            score: unit.decision?.score || 0,
            scores: unit.decision?.scores || {},
            issues: unit.issues || [],
            moved: Math.round(clamp(moved, 0, 999))
          });
          previous.lastEventAt = now;
        }
        previous.stateKey = stateKey;
        previous.issueKey = issueKey;
        previous.decisionKey = decisionKey;
        previous.x = unit.x;
        previous.y = unit.y;
      }
    }

    pushEvent(event) {
      this.events.push({
        id: ++this.sequence,
        time: Math.round((this.game.matchTime || 0) * 10) / 10,
        ...event,
        score: this.roundScore(event.score || 0)
      });
      if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
      if (this.lastSnapshot) this.lastSnapshot.events = this.events.slice(-100);
    }

    centerOf(units) {
      if (!units?.length) return null;
      const center = units.reduce((sum, unit) => ({
        x: sum.x + unit.x,
        y: sum.y + unit.y
      }), { x: 0, y: 0 });
      center.x /= units.length;
      center.y /= units.length;
      return center;
    }

    targetId(target) {
      if (!target) return "";
      return target.callSign || target.id || target.name || "";
    }

    commandLabel(type) {
      const labels = {
        attack: "공격",
        defend: "방어",
        retreat: "후퇴",
        rally: "집결",
        cancel: "취소",
        assault: "돌격",
        repair: "수리",
        scan: "정찰",
        fire_support: "화력지원",
        move: "이동"
      };
      if (labels[type]) return labels[type];
      if (type === "attack") return "공격";
      if (type === "defend") return "방어";
      if (type === "retreat") return "후퇴";
      if (type === "rally") return "집결";
      if (type === "cancel") return "취소";
      if (type === "assault") return "돌격";
      if (type === "repair") return "수리";
      if (type === "scan") return "정찰";
      if (type === "fire_support") return "화력지원";
      return "이동";
    }

    roundScore(value) {
      return Math.round(clamp(Number(value) || 0, 0, 1) * 100) / 100;
    }
  }

  IronLine.AIObservatory = AIObservatory;
})(window);
