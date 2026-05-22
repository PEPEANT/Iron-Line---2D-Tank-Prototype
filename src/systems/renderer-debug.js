"use strict";

(function registerRendererDebug(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { roundRect } = IronLine.math;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  Object.assign(proto, {
    drawDebugOverlay(game) {
      if (!game.debug?.ai) return;

      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (game.debug.navGraph) this.drawNavGraph(game);

      for (const tank of game.tanks) {
        if (!tank.ai || !tank.alive || !tank.isOperational()) continue;
        this.drawAiTankDebug(game, tank);
      }

      for (const humvee of game.humvees || []) {
        if (!humvee.ai || !humvee.alive || !humvee.isOperational()) continue;
        this.drawAiTankDebug(game, humvee);
      }

      for (const unit of game.infantry || []) {
        if (!unit.ai || !unit.alive || unit.inVehicle) continue;
        this.drawInfantryDebug(game, unit);
      }

      ctx.restore();
    },

    drawInfantryDebug(game, unit) {
      const ctx = this.ctx;
      const debug = unit.ai.debug || {};
      const color = unit.team === TEAM.BLUE ? "#b6dcff" : "#ffb0ab";
      const path = debug.path || [];
      const startIndex = Math.min(debug.pathIndex || 0, path.length);

      ctx.save();
      if (debug.moveTarget) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        ctx.lineTo(debug.moveTarget.x, debug.moveTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (debug.target) {
        ctx.strokeStyle = "rgba(255, 242, 168, 0.82)";
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        ctx.lineTo(debug.target.x, debug.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (debug.coverTarget) {
        ctx.strokeStyle = "rgba(160, 220, 172, 0.82)";
        ctx.globalAlpha = 0.58;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(debug.coverTarget.x, debug.coverTarget.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (path.length > startIndex) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        for (let i = startIndex; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }

      const stateLabels = {
        advance: "전진",
        secure: "확보",
        idle: "대기",
        fire: "사격",
        grenade: "수류탄",
        "grenade-aim": "수류탄 조준",
        cover: "엄폐",
        suppressed: "제압",
        "rpg-attack": "RPG",
        "rpg-position": "RPG 위치",
        "drone-deploy": "드론 전개",
        "drone-guide": "드론 유도",
        "drone-strike": "드론 타격",
        "recon-drone": "정찰드론",
        "report-move": "보고 위치",
        "harass-tank": "차량 견제",
        "evade-tank": "차량 회피",
        "repair-tank": "수리",
        "avoid-fire-lane": "사선 회피",
        "support-fire": "지원 사격",
        "support-position": "지원 위치",
        "prone-fire": "엎드려 사격",
        "pre-assault": "공격 준비",
        "pre-assault-position": "준비 위치",
        "hold-wall": "벽 엄폐",
        "hold-wall-position": "방어 위치",
        "squad-fallback": "분대 후퇴",
        "squad-regroup": "재집결",
        "rally-tank": "전차 합류",
        "board-transport": "탑승",
        "reboard-transport": "재탑승",
        "mounted-transport": "차량 탑승",
        "recon-move": "정찰 이동",
        "recon-watch": "감시",
        "recon-snipe": "저격",
        "recon-evade": "정찰 후퇴"
      };
      const tacticalLabels = {
        advance: "",
        hold: "방어",
        "support-fire": "지원",
        "pre-assault": "공격 준비",
        "hold-wall": "벽 엄폐",
        fallback: "후퇴",
        regroup: "재집결",
        "rally-with-tank": "전차 합류"
      };
      const pressure = debug.suppression > 5 ? ` S${Math.round(debug.suppression)}` : "";
      const weapon = INFANTRY_WEAPONS[debug.weaponId] || INFANTRY_WEAPONS[unit.weaponId] || INFANTRY_WEAPONS.rifle;
      const roleLabels = {
        assault: "돌격",
        support: "지원",
        security: "경계",
        scout: "정찰"
      };
      const role = debug.squadRole ? ` ${roleLabels[debug.squadRole] || debug.squadRole}` : "";
      const tactical = tacticalLabels[debug.tacticalMode] ? ` ${tacticalLabels[debug.tacticalMode]}` : "";
      const tacticalTimer = debug.tacticalMode === "pre-assault" && debug.tacticalTimerRemaining > 0
        ? ` ${Math.ceil(debug.tacticalTimerRemaining)}s`
        : "";
      const commandLock = debug.commandLockRemaining > 0 ? ` ${Math.ceil(debug.commandLockRemaining)}s` : "";
      const command = debug.commandState ? ` #${debug.commandState}${commandLock}` : "";
      const prone = debug.isProne ? " 엎드림" : "";
      const request = debug.supportRequest ? ` !${debug.supportRequest}` : "";
      const transport = debug.transportVehicleId ? ` @${debug.transportVehicleId}` : "";
      const squad = debug.squadId ? `${debug.squadId}/` : "";
      const coverQuality = debug.coverQuality > 0 ? ` Q${Math.round(debug.coverQuality)}` : "";
      const reports = debug.scoutReports > 0 ? ` R${debug.scoutReports}` : "";
      const grenades = debug.grenadeAmmo > 0 ? ` G${debug.grenadeAmmo}` : "";
      const grenadeLaunchers = debug.grenadeLauncherAmmo > 0 ? ` GL${debug.grenadeLauncherAmmo}` : "";
      const drones = debug.droneAmmo > 0 ? ` D${debug.droneAmmo}` : "";
      const repairs = debug.repairAmmo > 0 ? ` K${debug.repairAmmo}` : "";
      const stateText = debug.grenadeWeaponId === "grenadeLauncher" && (debug.state === "grenade" || debug.state === "grenade-aim")
        ? (debug.state === "grenade" ? "유탄" : "유탄 조준")
        : stateLabels[debug.state] || debug.state || unit.ai.state;
      const label = `${squad}${unit.callSign} ${weapon.shortName}${role}${tactical}${tacticalTimer}${command}${prone} ${stateText}${debug.goal ? `>${debug.goal}` : ""}${pressure}${coverQuality}${reports}${grenades}${grenadeLaunchers}${drones}${repairs}${request}${transport}`;
      const labelWidth = Math.max(72, label.length * 7.2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(9, 15, 13, 0.78)";
      ctx.strokeStyle = color;
      roundRect(ctx, unit.x - labelWidth / 2, unit.y - 38, labelWidth, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.font = "800 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, unit.x, unit.y - 29);
      ctx.restore();
    },

    drawNavGraph(game) {
      const ctx = this.ctx;
      const graph = game.navGraph;
      if (!graph) return;

      ctx.save();
      for (const edge of graph.edges) {
        const from = graph.nodeById.get(edge[0]);
        const to = graph.nodeById.get(edge[1]);
        if (!from || !to) continue;
        const generated = from.generated || to.generated;
        ctx.globalAlpha = generated ? 0.18 : 0.48;
        ctx.strokeStyle = generated ? "rgba(158, 206, 180, 0.55)" : "rgba(255, 209, 102, 0.62)";
        ctx.lineWidth = generated ? 1 : 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      for (const node of graph.nodes) {
        ctx.globalAlpha = node.generated ? 0.42 : 0.9;
        ctx.fillStyle = node.generated ? "rgba(158, 206, 180, 0.72)" : "rgba(255, 209, 102, 0.92)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.generated ? 3 : 5, 0, Math.PI * 2);
        ctx.fill();

        if (node.generated) continue;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(9, 15, 13, 0.74)";
        roundRect(ctx, node.x + 7, node.y - 9, Math.max(28, node.id.length * 5.6), 16, 3);
        ctx.fill();
        ctx.fillStyle = "#fff3bc";
        ctx.font = "700 9px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(node.id, node.x + 11, node.y);
      }
      ctx.restore();
    },

    drawAiTankDebug(game, tank) {
      const ctx = this.ctx;
      const ai = tank.ai;
      const debug = ai.debug || {};
      const color = tank.team === TEAM.BLUE ? "#6bbcff" : "#ff817b";
      const path = debug.path || [];
      const startIndex = Math.min(debug.pathIndex || 0, path.length);

      ctx.save();

      if (path.length > startIndex) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.78;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(tank.x, tank.y);
        for (let i = startIndex; i < path.length; i += 1) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = startIndex; i < path.length; i += 1) {
          ctx.fillStyle = i === startIndex ? "#ffffff" : color;
          ctx.strokeStyle = "rgba(9, 15, 13, 0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(path[i].x, path[i].y, i === startIndex ? 8 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      if (debug.moveTarget) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tank.x, tank.y);
        ctx.lineTo(debug.moveTarget.x, debug.moveTarget.y);
        ctx.stroke();

        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = 0.88;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(debug.moveTarget.x, debug.moveTarget.y, debug.moveTarget.final ? 14 : 11, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (debug.target && debug.target !== debug.moveTarget) {
        ctx.strokeStyle = debug.visible ? "rgba(255, 255, 255, 0.74)" : "rgba(255, 209, 102, 0.54)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.moveTo(tank.x, tank.y);
        ctx.lineTo(debug.target.x, debug.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const stateLabels = {
        capture: "점령",
        engage: "교전",
        overwatch: "엄호",
        retreat: "후퇴",
        hold: "방어",
        support: "지원",
        escort: "분대 동행",
        "escort-fire": "동행 사격",
        "fire-support": "화력지원",
        "request-fire": "지원 요청",
        transport: "수송",
        "transport-pickup": "승차 지원",
        "transport-load": "탑승 대기",
        "transport-run": "수송 중",
        "transport-dismount": "하차",
        "transport-overwatch": "하차 엄호",
        skirmish: "견제",
        evade: "회피"
      };
      const recovery = debug.recoveryTimer > 0 ? " 복구" : "";
      const unsafeLine = debug.unsafeLine ? " 사선위험" : "";
      const pathText = path.length > 0 ? ` ${Math.min(startIndex + 1, path.length)}/${path.length}` : "";
      const goalText = debug.goal ? `>${debug.goal}` : "";
      const stateText = stateLabels[debug.state || ai.state] || debug.state || ai.state;
      const paired = ai.currentOrder?.pairedSquadId ? `+${ai.currentOrder.pairedSquadId}` : "";
      const requestText = debug.supportRequest ? ` !${debug.supportRequest}` : "";
      const passengerText = tank.vehicleType === "humvee" && debug.passengers > 0 ? ` P${debug.passengers}` : "";
      const label = `${tank.callSign}${paired} ${stateText}${goalText}${pathText}${recovery}${unsafeLine}${requestText}${passengerText}`;
      const labelWidth = Math.max(86, label.length * 7.4);
      const labelX = tank.x - labelWidth / 2;
      const labelY = tank.y - (tank.vehicleType === "humvee" ? 68 : 76);

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(9, 15, 13, 0.82)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      roundRect(ctx, labelX, labelY, labelWidth, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, tank.x, labelY + 10);

      if (debug.stuckTimer > 0.12) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tank.x, tank.y, 48 + debug.stuckTimer * 12, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  });
})(window);
