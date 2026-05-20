"use strict";

(function registerGameAdminMapActions(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function pointInsideRect(point, rect, pad = 0) {
    if (!point || !rect) return false;
    return point.x >= rect.x - pad &&
      point.x <= rect.x + rect.w + pad &&
      point.y >= rect.y - pad &&
      point.y <= rect.y + rect.h + pad;
  }

  function pointInsideCircle(point, item, pad = 0) {
    if (!point || !item) return false;
    const dx = point.x - item.x;
    const dy = point.y - item.y;
    const radius = (item.r || item.radius || 0) + pad;
    return dx * dx + dy * dy <= radius * radius;
  }

  function collectPoints(value, label = "지점", out = []) {
    if (!value) return out;
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectPoints(item, `${label} ${index + 1}`, out));
      return out;
    }
    if (typeof value === "object" && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))) {
      out.push({ label: value.name || value.callSign || label, x: Number(value.x), y: Number(value.y) });
      return out;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) collectPoints(item, `${label} ${key}`, out);
    }
    return out;
  }

  const gameAdminMapActionMethods = {
    handleAdminMapAction(action) {
      if (action === "map-open-editor" || action === "map-open-current") return this.adminOpenMapEditor();
      if (action === "map-validate") return this.adminValidateMapToNotes();
      if (action === "map-run-test") return this.adminRunMapTest();
      if (action === "map-download-snapshot") return this.adminDownloadMapSnapshot();
      return false;
    },

    adminOpenMapEditor() {
      window.open("editor.html", "_blank", "noopener");
      this.adminNotify?.("맵 에디터를 열었습니다.");
      return true;
    },

    adminRunMapTest() {
      this.activateTestLab?.(this.testLab || "drone");
      this.adminCamera?.fitWorld?.();
      this.adminNotify?.("현재 맵 기준 테스트 전장을 실행했습니다.");
      return true;
    },

    adminDownloadMapSnapshot() {
      const snapshot = this.adminMapSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `iron-line-map-${snapshot.id || "map"}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      this.adminNotify?.("맵 JSON을 내보냈습니다.");
      return true;
    },

    adminValidateMapToNotes() {
      const result = this.adminValidateMap();
      const lines = [
        `## 맵 검증 - ${this.adminOps?.playtestTimestamp?.() || new Date().toLocaleString("ko-KR")}`,
        `- 맵: ${result.id}`,
        `- 크기: ${result.width} x ${result.height}`,
        `- 거점: ${result.capturePoints}`,
        `- 안전구역: ${result.safeZones}`,
        `- 오브젝트: ${result.scenery}개 / 파괴 가능 ${result.destructible}개`,
        `- 결과: ${result.issues.length ? `${result.issues.length}개 확인 필요` : "기본 검증 통과"}`
      ];
      if (result.issues.length) {
        lines.push("", "### 확인 필요");
        for (const issue of result.issues.slice(0, 24)) lines.push(`- [${issue.severity}] ${issue.message}`);
      }
      const note = this.adminOps?.appendPlaytestNote?.(lines.join("\n"));
      const input = document.getElementById("adminPlaytestNotesInput");
      if (input && typeof note === "string") input.value = note;
      this.adminNotify?.(result.issues.length ? `맵 검증: ${result.issues.length}개 확인 필요` : "맵 검증 통과");
      return true;
    },

    adminMapSnapshot() {
      const world = this.world || {};
      return {
        id: world.id || "map01",
        width: Math.round(world.width || 0),
        height: Math.round(world.height || 0),
        roadWidth: world.roadWidth || 0,
        obstacles: this.adminClonePlain?.(world.obstacles || []) || JSON.parse(JSON.stringify(world.obstacles || [])),
        scenery: this.adminClonePlain?.(world.scenery || []) || JSON.parse(JSON.stringify(world.scenery || [])),
        capturePoints: this.adminClonePlain?.(world.capturePoints || []) || JSON.parse(JSON.stringify(world.capturePoints || [])),
        safeZones: this.adminClonePlain?.(world.safeZones || []) || JSON.parse(JSON.stringify(world.safeZones || [])),
        spawns: this.adminClonePlain?.(world.spawns || {}) || JSON.parse(JSON.stringify(world.spawns || {}))
      };
    },

    adminValidateMap() {
      const world = this.world || {};
      const issues = [];
      const obstacles = [...(world.obstacles || []), ...(world.scenery || [])].filter((item) => !item.destroyed);
      const points = [
        ...collectPoints(world.spawns || {}, "스폰"),
        ...collectPoints(world.safeZones || [], "안전구역"),
        ...collectPoints(world.capturePoints || [], "거점")
      ];
      const width = Math.round(world.width || 0);
      const height = Math.round(world.height || 0);

      if (width < 3000 || height < 2000) {
        issues.push({ severity: "major", message: "맵 크기가 작습니다. 전투가 너무 빨리 끝날 수 있습니다." });
      }

      for (const point of points) {
        if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
          issues.push({ severity: "blocker", message: `${point.label}이 맵 밖에 있습니다.` });
        }
        const blocker = obstacles.find((item) => (
          item.shape === "circle" || item.r || item.radius
            ? pointInsideCircle(point, item, 24)
            : pointInsideRect(point, item, 24)
        ));
        if (blocker) {
          issues.push({ severity: "major", message: `${point.label}이 ${blocker.kind || blocker.type || "오브젝트"}와 겹칩니다.` });
        }
      }

      const capturePoints = world.capturePoints || [];
      for (let i = 0; i < capturePoints.length; i += 1) {
        for (let j = i + 1; j < capturePoints.length; j += 1) {
          const a = capturePoints[i];
          const b = capturePoints[j];
          const distance = Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
          if (distance < 520) issues.push({ severity: "minor", message: `거점 ${a.name || i + 1}와 ${b.name || j + 1} 사이가 너무 가깝습니다.` });
        }
      }

      const scenery = world.scenery || [];
      return {
        id: world.id || "map01",
        width,
        height,
        capturePoints: capturePoints.length,
        safeZones: (world.safeZones || []).length,
        scenery: scenery.length,
        destructible: scenery.filter((item) => item.destructible).length,
        issues
      };
    },

    adminClonePlain(value) {
      return JSON.parse(JSON.stringify(value || null));
    }
  };

  IronLine.installGameAdminMapActions = function installGameAdminMapActions(GameClass) {
    Object.assign(GameClass.prototype, gameAdminMapActionMethods);
  };
})(window);
