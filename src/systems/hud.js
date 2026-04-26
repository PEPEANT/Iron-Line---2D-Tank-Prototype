"use strict";

(function registerHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, INFANTRY_WEAPONS } = IronLine.constants;

  const TEAM_LABELS = {
    [TEAM.BLUE]: "아군",
    [TEAM.RED]: "적군",
    [TEAM.NEUTRAL]: "중립"
  };

  const RESULT_LABELS = {
    "BLUE VICTORY": "아군 승리",
    "MISSION LOST": "작전 실패"
  };

  class Hud {
    constructor() {
      this.nodes = {
        statusText: document.getElementById("statusText"),
        playerHealth: document.getElementById("playerHealth"),
        tankHealth: document.getElementById("tankHealth"),
        objectiveText: document.getElementById("objectiveText"),
        weaponState: document.getElementById("weaponState"),
        reloadBar: document.getElementById("reloadBar"),
        slots: {
          ap: document.getElementById("slot-ap"),
          he: document.getElementById("slot-he"),
          smoke: document.getElementById("slot-smoke")
        },
        slotLabels: {
          ap: document.querySelector("#slot-ap span"),
          he: document.querySelector("#slot-he span"),
          smoke: document.querySelector("#slot-smoke span")
        },
        ammo: {
          ap: document.getElementById("ammo-ap"),
          he: document.getElementById("ammo-he"),
          smoke: document.getElementById("ammo-smoke")
        }
      };
    }

    update(game) {
      const tank = game.player.inTank || game.playerTank;
      const ui = this.nodes;

      ui.playerHealth.textContent = `${Math.ceil(game.player.hp)}`;
      ui.tankHealth.textContent = game.playerTank.alive ? `${Math.ceil(game.playerTank.hp)}` : "0";

      if (game.result) ui.statusText.textContent = RESULT_LABELS[game.result] || game.result;
      else if (game.player.inTank) ui.statusText.textContent = "전차 탑승";
      else if (game.player.inSafeZone) ui.statusText.textContent = "안전구역";
      else ui.statusText.textContent = "도보 이동";

      ui.objectiveText.textContent = game.capturePoints.map((point) => {
        const owner = TEAM_LABELS[point.owner] || "중립";
        const contested = point.contested ? "*" : "";
        return `${point.name}:${owner}${contested}`;
      }).join("  ");

      if (!game.player.inTank) {
        this.updateInfantryWeapons(game);
        return;
      }

      for (const id of Object.keys(AMMO)) {
        ui.slotLabels[id].textContent = AMMO[id].name;
        ui.ammo[id].textContent = tank.ammo[id];
        ui.slots[id].classList.toggle("empty", tank.ammo[id] <= 0);
        ui.slots[id].classList.toggle(
          "active",
          id === "smoke" ? tank.smokeCooldown > 0 : tank.loadedAmmo === id || tank.reload.ammoId === id && tank.reload.active
        );
      }

      if (tank.reload.active) {
        const ammo = AMMO[tank.reload.ammoId];
        const pct = IronLine.math.clamp(tank.reload.progress / tank.reload.duration, 0, 1);
        ui.weaponState.textContent = `${ammo.name} ${Math.round(pct * 100)}%`;
        ui.reloadBar.style.width = `${pct * 100}%`;
      } else if (tank.loadedAmmo) {
        ui.weaponState.textContent = `${AMMO[tank.loadedAmmo].name} 준비됨`;
        ui.reloadBar.style.width = "100%";
      } else {
        ui.weaponState.textContent = "비어 있음";
        ui.reloadBar.style.width = "0%";
      }
    }

    updateInfantryWeapons(game) {
      const ui = this.nodes;
      const slotKeys = ["ap", "he", "smoke"];
      const inventory = game.player.weaponInventory || ["rifle", "smg", "lmg"];
      const activeWeapon = game.player.getWeapon
        ? game.player.getWeapon()
        : INFANTRY_WEAPONS[game.player.weaponId] || INFANTRY_WEAPONS.rifle;

      slotKeys.forEach((slotKey, index) => {
        const weaponId = inventory[index];
        const weapon = INFANTRY_WEAPONS[weaponId];
        ui.slotLabels[slotKey].textContent = weapon ? `${index + 1} ${weapon.shortName}` : `${index + 1} -`;
        ui.ammo[slotKey].textContent = weapon ? "∞" : "-";
        ui.slots[slotKey].classList.toggle("empty", !weapon);
        ui.slots[slotKey].classList.toggle("active", weaponId === game.player.weaponId);
      });

      const cooldown = Math.max(0, game.player.rifleCooldown || 0);
      const pct = activeWeapon.cooldown > 0 ? IronLine.math.clamp(1 - cooldown / activeWeapon.cooldown, 0, 1) : 1;
      ui.weaponState.textContent = game.player.inSafeZone
        ? `${activeWeapon.name} 선택됨`
        : cooldown > 0
          ? `${activeWeapon.name} ${Math.round(pct * 100)}%`
          : `${activeWeapon.name} 준비`;
      ui.reloadBar.style.width = `${pct * 100}%`;
    }
  }

  IronLine.Hud = Hud;
})(window);
