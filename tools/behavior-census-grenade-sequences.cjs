"use strict";

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function countBy(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function grenadeAimSequences(events) {
  const sequences = [];
  const open = new Map();
  const sorted = events
    .filter((event) => event.type === "grenade")
    .slice()
    .sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));

  const keyFor = (event) => [
    event.from || "unknown",
    event.weapon || "grenade",
    Math.round((Number(event.tx) || 0) * 10) / 10,
    Math.round((Number(event.ty) || 0) * 10) / 10
  ].join(":");

  const close = (unitId) => {
    const sequence = open.get(unitId);
    if (!sequence) return;
    sequences.push(sequence);
    open.delete(unitId);
  };

  for (const event of sorted) {
    const unitId = event.from || "unknown";
    const key = keyFor(event);
    const at = Number(event.t) || 0;
    const current = open.get(unitId);
    if (!current || current.key !== key || at - current.lastAt > 0.85) {
      close(unitId);
      open.set(unitId, {
        key,
        from: unitId,
        weapon: event.weapon || "grenade",
        attempts: 0,
        ok: false,
        firstAt: at,
        lastAt: at
      });
    }

    const sequence = open.get(unitId);
    sequence.attempts += 1;
    sequence.lastAt = at;
    sequence.ok = sequence.ok || Boolean(event.ok);
    if (event.ok) close(unitId);
  }

  for (const unitId of Array.from(open.keys())) close(unitId);
  return sequences;
}

module.exports = { countBy, grenadeAimSequences, percentile };
