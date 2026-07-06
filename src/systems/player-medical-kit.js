"use strict";

(function registerPlayerMedicalKit(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants || {};

  function usePlayerMedicalKit(weapon = {}) {
    const player = this.player;
    if (!player || weapon.id !== "repairKit" || player.hp <= 0 || player.inTank || player.controlledDrone) return false;
    const maxHp = Math.max(1, Number(player.maxHp) || 100);
    if ((player.hp || 0) >= maxHp) return false;
    if (!this.consumePlayerEquipmentAmmo?.(weapon)) return false;

    const healAmount = Math.max(1, Number(weapon.healAmount || weapon.repairAmount) || 32);
    player.hp = Math.min(maxHp, Math.max(0, player.hp || 0) + healAmount);
    player.rifleCooldown = Math.max(player.rifleCooldown || 0, weapon.cooldown || 0.9);
    this.playerDamageFlash = Math.max(this.playerDamageFlash || 0, 0.24);
    this.effects?.explosions?.push?.({
      x: player.x,
      y: player.y,
      radius: 7,
      maxRadius: 38,
      life: 0.26,
      maxLife: 0.26,
      color: "rgba(116, 228, 150, 0.54)"
    });
    this.battlefieldEvents?.push?.({
      type: "player_heal",
      team: player.team || TEAM?.BLUE || "blue",
      title: "치료",
      detail: "의료키트를 사용했습니다."
    });
    this.syncLocalCombatRoleState?.(player);
    this.hud?.update?.(this);
    return true;
  }

  IronLine.installPlayerMedicalKit = function installPlayerMedicalKit(Game) {
    if (!Game?.prototype || Game.prototype.playerMedicalKitInstalled) return;
    const baseRepairFriendlyTank = Game.prototype.repairFriendlyTank;
    Game.prototype.usePlayerMedicalKit = usePlayerMedicalKit;
    Game.prototype.repairFriendlyTank = function repairFriendlyOrHealPlayer(weapon = {}) {
      if (baseRepairFriendlyTank?.call(this, weapon)) return true;
      return this.usePlayerMedicalKit?.(weapon) || false;
    };
    Object.defineProperty(Game.prototype, "playerMedicalKitInstalled", { value: true });
  };
})(window);
