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

      for (const edge of config.edges || []) {
        this.addEdge(edge[0], edge[1], edge[2], 22);
      }

      this.addAutoGrid();
      this.edges = this.openEdges;
    }

    nearestNode(x, y, options = {}) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      let best = null;
      let bestDistance = Infinity;
      let fallback = null;
      let fallbackDistance = Infinity;
      const padding = options.padding ?? 58;

      for (const node of this.nodes) {
        const d = distXY(x, y, node.x, node.y);
        if (d < fallbackDistance) {
          fallback = node;
          fallbackDistance = d;
        }
        const blocked = d > 90 && this.segmentBlocked(x, y, node.x, node.y, padding, options);
        if (blocked) continue;
        if (d < bestDistance) {
          best = node;
          bestDistance = d;
        }
      }

      return best || fallback;
    }

    nodeForObjective(name) {
      const nodeId = this.objectiveNodes[name];
      return nodeId ? this.nodeById.get(nodeId) : null;
    }

    findPath(startId, goalId, options = {}) {
      if (!this.nodeById.has(startId) || !this.nodeById.has(goalId)) return [];
      if (startId === goalId) return [this.nodeById.get(startId)];

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
        if (current === goalId) return this.reconstructPath(cameFrom, current);

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

      return [];
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
