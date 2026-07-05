"use strict";

function passLabel(value, min, max = Infinity) {
  return value >= min && value <= max ? "PASS" : "CHECK";
}

function summaryMarkdown(summary, outDir) {
  const grenadeOkTotal = summary.grenadeOkByWeapon.grenade || 0;
  const launcherOkTotal = (summary.grenadeOkByWeapon.grenadeLauncher || 0) +
    (summary.grenadeLaunchByWeapon.grenadeLauncher || 0);
  const jsonBlock = (title, value) => [
    `## ${title}`,
    "",
    "```json",
    JSON.stringify(value, null, 2),
    "```",
    ""
  ];

  return [
    "# AI Behavior Census",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Output: ${outDir}`,
    "Measurement: headless Chrome offline ai-15v15, runtime hooks only.",
    "",
    "## Pass / Check",
    "",
    "| Metric | Value | Target | Result |",
    "| --- | ---: | ---: | --- |",
    `| Grenade decision ok | ${grenadeOkTotal} | 4-10 | ${passLabel(grenadeOkTotal, 4, 10)} |`,
    `| Grenade launcher ok/launched | ${launcherOkTotal} | 6-15 | ${passLabel(launcherOkTotal, 6, 15)} |`,
    `| Grenade try success rate | ${summary.grenadeSuccessRate} | >0.3 | ${passLabel(summary.grenadeSuccessRate, 0.3)} |`,
    `| Grenade actual evaluation null rate | ${summary.grenadeEvaluationNullRate} | <0.7 | ${summary.grenadeEvaluationNullRate < 0.7 ? "PASS" : "CHECK"} |`,
    `| Suppression/point shot ratio | ${summary.suppressionShotRatio} | 0.20-0.40 | ${passLabel(summary.suppressionShotRatio, 0.2, 0.4)} |`,
    `| Squad fire-move teamwork ratio | ${summary.teamworkRatio} | >0.30 | ${passLabel(summary.teamworkRatio, 0.3)} |`,
    `| Fire-move ok rate | ${summary.fireMoveOkRate} | diagnostic | CHECK |`,
    `| Prone enter count | ${summary.proneEnter} | 30+ | ${passLabel(summary.proneEnter, 30)} |`,
    `| Prone average hold | ${summary.proneHoldAverageSeconds}s | 2s+ | ${passLabel(summary.proneHoldAverageSeconds, 2)} |`,
    "",
    ...jsonBlock("Grenade Null Reasons", summary.grenadeReasonCounts),
    ...jsonBlock("Grenade Candidate Rejects", summary.grenadeCandidateRejectCounts),
    ...jsonBlock("Grenade Try Fail Reasons", summary.grenadeTryFailReasons),
    ...jsonBlock("Fire-Move Reasons", summary.fireMoveReasonCounts),
    ...jsonBlock("Fire-Move Blocked Modes", summary.fireMoveBlockedModeCounts),
    ...jsonBlock("Fire-Move Blocked Mode Roles", summary.fireMoveBlockedModeRoleCounts),
    ...jsonBlock("Fire-Move Blocked Mode Weapons", summary.fireMoveBlockedModeWeaponCounts),
    ...jsonBlock("Fire-Move No Support Reasons", summary.fireMoveNoSupportCounts),
    ...jsonBlock("Fire-Move Reasons By State", summary.fireMoveReasonByStateCounts),
    ...jsonBlock("Fire-Move Reasons By Weapon", summary.fireMoveReasonByWeaponCounts),
    ...jsonBlock("Fire-Move Success States", summary.fireMoveOkByState),
    ...jsonBlock("Fire-Move Success Weapons", summary.fireMoveOkByWeapon),
    ...jsonBlock("Fire-Move Target Sources", summary.fireMoveTargetSourceCounts),
    ...jsonBlock("Raw Summary", summary),
    "## Notes",
    "",
    "- `mode: point` shots come from `fireRifleAtPoint`, including support/report-position fire.",
    "- Death events are alive-set changes in v1 and do not yet carry a kill source.",
    "- Grenade budget calls are per-frame/cache-layer calls. Grenade evaluation calls are the actual `selectGrenadeTarget()` decision passes.",
    "- Grenade reason counts are diagnostic-only and do not change gameplay.",
    "- Fire-move reason counts are diagnostic-only and mirror the early returns inside `executeFireMoveAdvance()`.",
    ""
  ].join("\n");
}

module.exports = { summaryMarkdown };
