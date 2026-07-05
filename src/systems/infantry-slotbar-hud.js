"use strict";

(function registerInfantrySlotbarHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { INFANTRY_WEAPONS } = IronLine.constants || {};

  function weaponLabel(weaponId) {
    const weapon = INFANTRY_WEAPONS?.[weaponId];
    return weapon?.shortName || weapon?.name || weaponId || "비어 있음";
  }

  function weaponIcon(weaponId) {
    if (!weaponId) return null;
    const icon = document.createElement("img");
    icon.src = `assets/weapons/${weaponId}.png`;
    icon.alt = "";
    icon.draggable = false;
    icon.addEventListener("error", () => icon.classList.add("missing"), { once: true });
    return icon;
  }

  function ensureSlotbar(hud) {
    const root = hud?.nodes?.bottomHud;
    if (!root) return null;
    if (hud.nodes.infantrySlotbar) return hud.nodes.infantrySlotbar;

    const bar = document.createElement("div");
    bar.id = "infantrySlotbar";
    bar.className = "infantry-slotbar hidden";
    bar.setAttribute("aria-label", "보병 장비 슬롯");

    const slots = IronLine.playerDefaultLoadout?.slots?.() || [];
    for (const slot of slots) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "infantry-slot";
      button.dataset.infantrySlot = String(slot.index);
      button.setAttribute("aria-label", `${slot.key} ${slot.role}`);

      const key = document.createElement("b");
      key.textContent = slot.key;
      const art = document.createElement("span");
      art.className = "infantry-slot-art";
      const role = document.createElement("span");
      role.className = "infantry-slot-role";
      role.textContent = slot.role;
      const item = document.createElement("strong");
      item.className = "infantry-slot-item";

      button.append(key, art, role, item);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const game = IronLine.game;
        const index = Number(button.dataset.infantrySlot);
        if (game?.player?.setEquipmentSlot?.(index)) {
          game.player.rifleCooldown = Math.min(game.player.rifleCooldown || 0, 0.12);
          game.hud?.update?.(game);
        }
      });
      bar.append(button);
    }

    root.append(bar);
    hud.nodes.infantrySlotbar = bar;
    return bar;
  }

  function updateSlotbar(hud, player) {
    const bar = ensureSlotbar(hud);
    if (!bar || !player) return;
    const definitions = IronLine.playerDefaultLoadout?.slots?.() || [];
    const inventory = Array.isArray(player.weaponInventory) ? player.weaponInventory : [];

    bar.classList.remove("hidden");
    for (const button of bar.querySelectorAll("[data-infantry-slot]")) {
      const index = Number(button.dataset.infantrySlot);
      const slot = definitions[index] || { key: String(index + 1), role: "장비" };
      const weaponId = inventory[index] || "";
      const weapon = INFANTRY_WEAPONS?.[weaponId] || null;
      const ammo = weapon?.ammoKey ? player.equipmentAmmo?.[weapon.ammoKey] ?? 0 : null;
      const empty = !weapon;

      button.classList.toggle("active", player.activeSlot === index && !empty);
      button.classList.toggle("empty", empty);
      button.disabled = empty;
      button.title = empty ? `${slot.key} ${slot.role} 비어 있음` : `${slot.key} ${weaponLabel(weaponId)}`;

      const art = button.querySelector(".infantry-slot-art");
      if (art && art.dataset.weaponId !== weaponId) {
        art.textContent = "";
        const icon = weaponIcon(weaponId);
        if (icon) art.append(icon);
        art.dataset.weaponId = weaponId;
      }

      const role = button.querySelector(".infantry-slot-role");
      if (role) role.textContent = slot.role;
      const item = button.querySelector(".infantry-slot-item");
      if (item) item.textContent = empty ? "비어 있음" : ammo === null ? weaponLabel(weaponId) : `${weaponLabel(weaponId)} ${ammo}`;
    }
  }

  const Hud = IronLine.Hud;
  if (!Hud?.prototype) return;

  const baseUpdateInfantryWeapons = Hud.prototype.updateInfantryWeapons;
  Hud.prototype.updateInfantryWeapons = function updateInfantryWeaponsWithSlotbar(player, game = null) {
    const result = baseUpdateInfantryWeapons?.call(this, player, game);
    updateSlotbar(this, player);
    return result;
  };

  const baseUpdateTankWeapons = Hud.prototype.updateTankWeapons;
  Hud.prototype.updateTankWeapons = function updateTankWeaponsWithoutInfantrySlotbar(tank) {
    this.nodes?.infantrySlotbar?.classList.add("hidden");
    return baseUpdateTankWeapons?.call(this, tank);
  };

  const baseUpdateHumveeWeapons = Hud.prototype.updateHumveeWeapons;
  Hud.prototype.updateHumveeWeapons = function updateHumveeWeaponsWithoutInfantrySlotbar(humvee) {
    this.nodes?.infantrySlotbar?.classList.add("hidden");
    return baseUpdateHumveeWeapons?.call(this, humvee);
  };
})(window);
