"use strict";

(function registerPathfinding(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY, expandedRect, lineIntersectsRect, circleRectCollision } = IronLine.math;

  class NavGraph {
    constructor(config, world = null) {
      this.nodes = (config.nodes || [])
        .filter((node) => node?.id && Number.isFinite(node.x) && Number.isFinite(node.y))
        .map((node) => ({ ...node, authored: true }));
      this.edges = [];
      this.objectiveNodes = config.objectiveNodes || {};
      this.world = world;
      this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
      this.neighbors = new Map(this.nodes.map((node) => [node.id, []]));
      this.openEdges = [];
      this.edgeKeys = new Set();
      this.segmentCache = new Map();
      this.segmentCacheSignature = "";
      this.nearestCache = new Map();
      this.pathCache = new Map();

      for (const edge of config.edges || []) {
        this.addEdge(edge[0], edge[1], edge[2], 22);
      }

      this.addAutoGrid();
      this.edges = this.openEdges;
    }

    nearestNode(x, y, options = {}) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const cacheKey = this.nearestCacheKey(x, y, options);
      const cached = this.nearestCache.get(cacheKey);
      if (cached && (distXY(x, y, cached.x, cached.y) <= 90 || !this.segmentBlocked(x, y, cached.x, cached.y, options.padding ?? 58, options))) return cached;
      let fallback = null;
      let fallbackDistance = Infinity;
      const padding = options.padding ?? 58;
      const candidates = [];
      const searchRange = options.nearestSearchRange ?? 680;
      const candidateLimit = options.nearestCandidateLimit ?? 64;

      for (const node of this.nodes) {
        const d = distXY(x, y, node.x, node.y);
        if (d < fallbackDistance) {
          fallback = node;
          fallbackDistance = d;
        }
        if (d <= 90) return this.cacheNearest(cacheKey, node);
        if (d <= searchRange) candidates.push({ node, distance: d });
      }

      candidates.sort((a, b) => a.distance - b.distance);
      const limit = Math.min(candidates.length, candidateLimit);
      for (let index = 0; index < limit; index += 1) {
        const item = candidates[index];
        if (!this.segmentBlocked(x, y, item.node.x, item.node.y, padding, options)) return this.cacheNearest(cacheKey, item.node);
      }

      return this.cacheNearest(cacheKey, fallback);
    }

    nodeForObjective(name) {
      const nodeId = this.objectiveNodes[name];
      return nodeId ? this.nodeById.get(nodeId) : null;
    }

    findPath(startId, goalId, options = {}) {
      if (!this.nodeById.has(startId) || !this.nodeById.has(goalId)) return [];
      if (startId === goalId) return [this.nodeById.get(startId)];
      this.ensureSegmentCacheFresh();
      const cacheKey = this.pathCacheKey(startId, goalId, options);
      if (this.pathCache.has(cacheKey)) return this.pathCache.get(cacheKey);

      const open = new Set([startId]);
      const cameFrom = new Map();
      const gScore = new Map([[startId, 0]]);
      const fScore = new Map([[startId, this.heuristic(startId, goalId)]]);
      const maxIterations = Math.max(64, this.nodes.length * 4);
      let iterations = 0;

      while (open.size > 0 && iterations < maxIterations) {
        iterations += 1;
        const current = this.lowestScoreNode(open, fScore);
        if (!current) break;
        if (current === goalId) return this.cachePath(cacheKey, this.reconstructPath(cameFrom, current));

        open.delete(current);
        for (const neighbor of this.neighbors.get(current) || []) {
          if (this.edgeBlockedForOptions(current, neighbor, options)) continue;
          const tentative = (gScore.get(current) ?? Infinity) + neighbor.cost;
          if (!Number.isFinite(tentative)) continue;
          if (tentative >= (gScore.get(neighbor.id) ?? Infinity)) continue;

          cameFrom.set(neighbor.id, current);
          gScore.set(neighbor.id, tentative);
          fScore.set(neighbor.id, tentative + this.heuristic(neighbor.id, goalId));
          open.add(neighbor.id);
        }
      }

      return this.cachePath(cacheKey, []);
    }

    edgeBlockedForOptions(fromId, neighbor, options = {}) {
      if (options.blockScenery === false) return false;
      const from = this.nodeById.get(fromId);
      const to = this.nodeById.get(neighbor.id);
      if (!from || !to) return true;
      const padding = options.edgePadding ?? neighbor.padding ?? options.padding ?? 34;
      return this.segmentBlocked(from.x, from.y, to.x, to.y, padding, options);
    }

    findPathBetween(start, goal, options = {}) {
      const startNode = this.nearestNode(start.x, start.y, options);
      const goalNode = goal.name
        ? this.nodeForObjective(goal.name) || this.nearestNode(goal.x, goal.y, options)
        : this.nearestNode(goal.x, goal.y, options);
      if (!startNode || !goalNode) return [];
      return this.findPath(startNode.id, goalNode.id, options);
    }

    segmentBlocked(x1, y1, x2, y2, padding = 56, options = {}) {
      if (!this.world?.obstacles) return false;
      const useCache = options.cache !== false;
      if (useCache) {
        this.ensureSegmentCacheFresh();
        const key = this.segmentCacheKey(x1, y1, x2, y2, padding, options);
        if (this.segmentCache.has(key)) return this.segmentCache.get(key);
        const blocked = this.computeSegmentBlocked(x1, y1, x2, y2, padding, options);
        this.segmentCache.set(key, blocked);
        if (this.segmentCache.size > 24000) this.segmentCache.clear();
        return blocked;
      }
      return this.computeSegmentBlocked(x1, y1, x2, y2, padding, options);
    }

    computeSegmentBlocked(x1, y1, x2, y2, padding = 56, options = {}) {
      if (IronLine.physics?.lineBlockedByWorld) {
        return IronLine.physics.lineBlockedByWorld({ world: this.world, tanks: [], humvees: [] }, x1, y1, x2, y2, {
          padding,
          includeScenery: options.blockScenery !== false,
          includeWrecks: false
        });
      }
      return this.world.obstacles.some((obstacle) => (
        lineIntersectsRect(x1, y1, x2, y2, expandedRect(obstacle, padding))
      ));
    }

    ensureSegmentCacheFresh() {
      const signature = this.blockerSignature();
      if (signature === this.segmentCacheSignature) return;
      this.segmentCacheSignature = signature;
      this.segmentCache.clear();
      this.nearestCache.clear();
      this.pathCache.clear();
    }

    blockerSignature() {
      const obstacles = this.world?.obstacles || [];
      const scenery = this.world?.scenery || [];
      let signature = `${obstacles.length}:${scenery.length}`;
      for (let index = 0; index < obstacles.length; index += 1) {
        if (obstacles[index]?.destroyed) signature += `|o${index}`;
      }
      for (let index = 0; index < scenery.length; index += 1) {
        if (scenery[index]?.destroyed) signature += `|s${index}`;
      }
      return signature;
    }

    segmentCacheKey(x1, y1, x2, y2, padding, options = {}) {
      const a = `${Math.round(x1)},${Math.round(y1)}`;
      const b = `${Math.round(x2)},${Math.round(y2)}`;
      const ends = a < b ? `${a}|${b}` : `${b}|${a}`;
      const scenery = options.blockScenery === false ? "0" : "1";
      return `${ends}|${Math.round(padding)}|${scenery}`;
    }

    pathCacheKey(startId, goalId, options = {}) {
      const scenery = options.blockScenery === false ? "0" : "1";
      const padding = Math.round(options.padding ?? 34);
      const edgePadding = options.edgePadding === undefined ? "n" : Math.round(options.edgePadding);
      return `${startId}|${goalId}|${padding}|${edgePadding}|${scenery}`;
    }

    nearestCacheKey(x, y, options = {}) {
      const scenery = options.blockScenery === false ? "0" : "1";
      return `${Math.round(x / 40)},${Math.round(y / 40)}|${Math.round(options.padding ?? 58)}|${scenery}`;
    }

    cacheNearest(key, node) {
      if (!node) return null;
      this.nearestCache.set(key, node);
      if (this.nearestCache.size > 5000) this.nearestCache.clear();
      return node;
    }

    cachePath(key, path) {
      this.pathCache.set(key, path);
      if (this.pathCache.size > 3000) this.pathCache.clear();
      return path;
    }

    addNode(node) {
      if (!node?.id || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
      if (this.nodeById.has(node.id)) return this.nodeById.get(node.id);
      this.nodes.push(node);
      this.nodeById.set(node.id, node);
      this.neighbors.set(node.id, []);
      return node;
    }

    addEdge(fromId, toId, cost = null, padding = 34) {
      const from = this.nodeById.get(fromId);
      const to = this.nodeById.get(toId);
      if (!from || !to || fromId === toId) return false;

      const key = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
      if (this.edgeKeys.has(key)) return false;
      if (this.segmentBlocked(from.x, from.y, to.x, to.y, padding, { blockScenery: false })) return false;

      const edgeCost = Number.isFinite(cost) && cost > 0 ? cost : distXY(from.x, from.y, to.x, to.y);
      if (!Number.isFinite(edgeCost) || edgeCost <= 0) return false;
      this.neighbors.get(fromId).push({ id: toId, cost: edgeCost, padding });
      this.neighbors.get(toId).push({ id: fromId, cost: edgeCost, padding });
      this.openEdges.push([fromId, toId, edgeCost]);
      this.edgeKeys.add(key);
      return true;
    }

    addAutoGrid() {
      if (!this.world) return;

      const spacing = 170;
      const margin = 85;
      const grid = new Map();
      const generated = [];

      for (let y = margin; y <= this.world.height - margin; y += spacing) {
        for (let x = margin; x <= this.world.width - margin; x += spacing) {
          if (!this.pointPassable(x, y, 40, { blockScenery: false })) continue;
          const id = `g_${x}_${y}`;
          const node = this.addNode({ id, x, y, generated: true });
          grid.set(`${x},${y}`, node);
          generated.push(node);
        }
      }

      const dirs = [
        [spacing, 0],
        [0, spacing],
        [spacing, spacing],
        [spacing, -spacing]
      ];

      for (const node of generated) {
        for (const [dx, dy] of dirs) {
          const neighbor = grid.get(`${node.x + dx},${node.y + dy}`);
          if (neighbor) this.addEdge(node.id, neighbor.id, null, 34);
        }
      }

      const authored = this.nodes.filter((node) => node.authored);
      for (const node of authored) {
        const nearby = generated
          .map((gridNode) => ({
            node: gridNode,
            distance: distXY(node.x, node.y, gridNode.x, gridNode.y)
          }))
          .filter((item) => item.distance <= spacing * 1.7)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 8);

        for (const item of nearby) {
          this.addEdge(node.id, item.node.id, item.distance, 28);
        }
      }
    }

    pointPassable(x, y, radius, options = {}) {
      if (IronLine.physics?.circleBlockedByWorld) {
        return !IronLine.physics.circleBlockedByWorld({ world: this.world, tanks: [], humvees: [] }, null, x, y, radius, {
          blockTanks: false,
          blockScenery: options.blockScenery !== false,
          includeWrecks: false
        });
      }
      return !this.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle));
    }

    heuristic(fromId, toId) {
      const from = this.nodeById.get(fromId);
      const to = this.nodeById.get(toId);
      if (!from || !to) return Infinity;
      return distXY(from.x, from.y, to.x, to.y);
    }

    lowestScoreNode(open, fScore) {
      let best = null;
      let bestScore = Infinity;

      for (const id of open) {
        const score = fScore.get(id) ?? Infinity;
        if (!Number.isFinite(score)) continue;
        if (score < bestScore) {
          best = id;
          bestScore = score;
        }
      }

      return best;
    }

    reconstructPath(cameFrom, current) {
      const path = [this.nodeById.get(current)];
      const seen = new Set([current]);
      while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        if (seen.has(current)) break;
        seen.add(current);
        path.unshift(this.nodeById.get(current));
      }
      return path;
    }
  }

  IronLine.NavGraph = NavGraph;
})(window);
