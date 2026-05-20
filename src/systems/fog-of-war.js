"use strict";

(function registerFogOfWar(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { distXY } = IronLine.math;

  class FogOfWar {
    reportContact(team, target, reporter, ttl = 3.4, options = {}) {
      if (!target || target.team === team) return;
      if (target.inVehicle) return;
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      if (!alive) return;

      const reports = this.teamReports?.[team];
      if (!reports) return;

      const current = reports.get(target);
      const source = this.contactReportSource(reporter, options);
      const confidence = options.confidence ?? this.contactReportConfidence(source);
      const minimapVisible = options.minimapVisible ?? this.contactReportMinimapVisible(source);
      const certainty = options.certainty || this.contactReportCertainty(source);
      reports.set(target, {
        target,
        x: target.x,
        y: target.y,
        ttl: Math.max(ttl, current?.ttl || 0),
        reporter,
        sourceType: source.type,
        confidence: Math.max(confidence, current?.confidence || 0),
        minimapVisible: Boolean(minimapVisible || current?.minimapVisible),
        certainty: this.mergeContactCertainty(certainty, current?.certainty),
        lastSeenAt: this.matchTime || 0
      });
    }

    contactReportSource(reporter, options = {}) {
      if (options.sourceType) return { type: options.sourceType };
      if (reporter?.isObjectiveSensor) return { type: "objective" };
      if (reporter?.isDrone) return { type: reporter.droneRole === "attack" ? "attack_drone" : "recon_drone" };
      if (reporter?.classId === "scout") return { type: "scout" };
      return { type: "combat" };
    }

    contactReportConfidence(source) {
      if (source.type === "scout") return 1;
      if (source.type === "recon_drone") return 0.92;
      if (source.type === "attack_drone") return 0.78;
      if (source.type === "objective") return 0.72;
      return 0.68;
    }

    contactReportMinimapVisible(source) {
      return ["scout", "recon_drone", "attack_drone", "objective"].includes(source.type);
    }

    contactReportCertainty(source) {
      if (source.type === "scout" || source.type === "recon_drone") return "confirmed";
      if (source.type === "attack_drone") return "last";
      if (source.type === "objective") return "estimated";
      return "combat";
    }

    mergeContactCertainty(next = "combat", current = "") {
      const rank = { combat: 0, estimated: 1, last: 2, confirmed: 3 };
      return (rank[next] || 0) >= (rank[current] || 0) ? next : current;
    }

    isReportedEnemy(team, target) {
      const report = this.teamReports?.[team]?.get(target);
      if (!report || report.ttl <= 0) return false;
      const alive = target?.alive !== undefined ? target.alive : target?.hp > 0;
      return Boolean(alive && !target.inVehicle && target.team !== team);
    }

    getReportedContact(team, target) {
      const report = this.teamReports?.[team]?.get(target);
      return this.isReportedEnemy(team, target) ? report : null;
    }

    isMinimapReportedEnemy(team, target) {
      const report = this.getReportedContact(team, target);
      return Boolean(report?.minimapVisible);
    }

    getReportedContacts(team, options = {}) {
      const reports = this.teamReports?.[team];
      if (!reports) return [];
      return Array.from(reports.values())
        .filter((report) => this.isReportedEnemy(team, report.target))
        .filter((report) => !options.minimapOnly || report.minimapVisible);
    }

    updateTeamReports(dt) {
      for (const reports of Object.values(this.teamReports || {})) {
        for (const [target, report] of reports) {
          report.ttl -= dt;
          const alive = target?.alive !== undefined ? target.alive : target?.hp > 0;
          if (!alive || report.ttl <= 0) reports.delete(target);
        }
      }
      this.reportObjectiveContacts(dt);
    }

    reportObjectiveContacts(dt) {
      this.objectiveReportTimer = Math.max(0, (this.objectiveReportTimer || 0) - dt);
      if (this.objectiveReportTimer > 0) return;
      this.objectiveReportTimer = 0.45;

      for (const point of this.capturePoints || []) {
        if (!point || point.owner === TEAM.NEUTRAL) continue;
        const radius = point.visionRadius || 620;
        const reporter = {
          x: point.x,
          y: point.y,
          name: point.name,
          isObjectiveSensor: true
        };

        for (const target of this.objectiveContactTargets(point.owner)) {
          if (distXY(point.x, point.y, target.x, target.y) > radius + (target.radius || 0)) continue;
          this.reportContact(point.owner, target, reporter, 1.35, {
            sourceType: "objective",
            certainty: "estimated",
            confidence: point.contested ? 0.62 : 0.72,
            minimapVisible: true
          });
        }
      }
    }

    objectiveContactTargets(team) {
      const targets = [];
      for (const vehicle of [...(this.tanks || []), ...(this.humvees || [])]) {
        if (vehicle.alive && vehicle.team !== team) targets.push(vehicle);
      }
      for (const unit of this.infantry || []) {
        if (unit.alive && !unit.inVehicle && unit.team !== team) targets.push(unit);
      }
      for (const crew of this.crews || []) {
        if (crew.alive && !crew.inTank && crew.team !== team) targets.push(crew);
      }
      if (!this.player?.inTank && this.player?.hp > 0 && this.player.team !== team && !this.isPlayerInSafeZone?.()) {
        targets.push(this.player);
      }
      return targets;
    }
  }

  IronLine.installFogOfWar = function installFogOfWar(Game) {
    for (const name of Object.getOwnPropertyNames(FogOfWar.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(
        Game.prototype,
        name,
        Object.getOwnPropertyDescriptor(FogOfWar.prototype, name)
      );
    }
  };
})(window);
