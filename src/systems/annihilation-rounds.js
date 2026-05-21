"use strict";

(function registerAnnihilationRounds(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const DEFAULT_OBJECTIVE_SCORE_TARGET = 300;

  function installAnnihilationRounds(Game) {
    Object.assign(Game.prototype, {
      defaultAnnihilationState() {
        return {
          state: "live",
          round: 1,
          maxRounds: 1,
          targetScore: DEFAULT_OBJECTIVE_SCORE_TARGET,
          intermissionDuration: 0,
          intermissionRemaining: 0,
          score: {
            [TEAM.BLUE]: 0,
            [TEAM.RED]: 0
          },
          roundWinner: "",
          matchWinner: "",
          banner: "",
          detail: ""
        };
      },

      resetAnnihilationState() {
        this.annihilation = this.defaultAnnihilationState();
        if (this.defaultConquestState) this.conquest = this.defaultConquestState();
        this.playerRoundSpectator = false;
        return this.annihilation;
      },

      isAnnihilationMode() {
        return this.matchConfig?.mode === "annihilation";
      },

      isOnlineAnnihilationMatch() {
        return this.sessionMode === "online" && this.isAnnihilationMode();
      },

      isRoundSpectatorMode() {
        return Boolean(
          this.isOnlineAnnihilationMatch()
          && this.matchStarted
          && !this.result
          && this.playerDeathActive
        );
      },

      battleContinuesAfterPlayerDeath() {
        return Boolean(
          this.matchStarted
          && !this.result
          && (
            this.isConquestMode?.()
            || (this.isOnlineAnnihilationMatch() && (this.playerDowned || this.playerDeathActive))
          )
        );
      },

      annihilationTeamName(team) {
        const session = this.onlineSession || {};
        const factionId = team === TEAM.RED
          ? (session.redFactionId || "russia")
          : (session.blueFactionId || "korea");
        return IronLine.playerFactionById?.(factionId)?.name
          || IronLine.playerSkinById?.(factionId)?.name
          || (team === TEAM.RED ? "홍팀" : "청팀");
      },

      annihilationObjectiveScoreTarget() {
        return Math.max(1, Math.floor(Number(this.annihilation?.targetScore) || DEFAULT_OBJECTIVE_SCORE_TARGET));
      },

      syncAnnihilationObjectiveScore() {
        if (!this.annihilation) this.annihilation = this.defaultAnnihilationState();
        const score = this.conquest?.score || this.annihilation.score || {};
        this.annihilation.score[TEAM.BLUE] = Math.max(0, Number(score[TEAM.BLUE]) || 0);
        this.annihilation.score[TEAM.RED] = Math.max(0, Number(score[TEAM.RED]) || 0);
        return this.annihilation.score;
      },

      updateAnnihilationIntermission() {
        return false;
      },

      updateAnnihilationResult() {
        if (!this.isAnnihilationMode()) return;
        if (!this.annihilation) this.resetAnnihilationState();
        if (this.annihilation.state === "ended") return;

        this.annihilation.state = "live";
        const score = this.syncAnnihilationObjectiveScore();
        const targetScore = this.annihilationObjectiveScoreTarget();
        const blueScore = score[TEAM.BLUE] || 0;
        const redScore = score[TEAM.RED] || 0;

        if (blueScore >= targetScore || redScore >= targetScore) {
          if (blueScore === redScore) {
            this.finishGame("DRAW", `섬멸전 종료: 양측 ${Math.floor(blueScore)}점`);
            this.annihilation.state = "ended";
            return;
          }
          this.finishAnnihilationMatch(
            blueScore > redScore ? TEAM.BLUE : TEAM.RED,
            `거점 점수 ${Math.floor(Math.max(blueScore, redScore))}점 도달`
          );
          return;
        }

        if (!this.hasCombatPower(TEAM.RED)) {
          this.finishAnnihilationMatch(TEAM.BLUE, "상대 전투력 소멸");
          return;
        }

        if (!this.hasCombatPower(TEAM.BLUE)) {
          this.finishAnnihilationMatch(TEAM.RED, "상대 전투력 소멸");
        }
      },

      finishAnnihilationMatch(winnerTeam, reason = "") {
        if (!winnerTeam) {
          this.finishGame("DRAW", reason || "섬멸전 무승부");
          if (this.annihilation) this.annihilation.state = "ended";
          return true;
        }

        if (!this.annihilation) this.resetAnnihilationState();
        const winnerName = this.annihilationTeamName(winnerTeam);
        this.annihilation.matchWinner = winnerTeam;
        this.annihilation.state = "ended";
        this.annihilation.banner = `${winnerName} 세력이 승리하였습니다.`;
        this.annihilation.detail = reason;
        const result = winnerTeam === TEAM.BLUE ? "BLUE VICTORY" : "MISSION LOST";
        this.finishGame(result, `${winnerName} 세력이 승리하였습니다. ${reason}`);
        return true;
      },

      finishAnnihilationRound(winnerTeam, reason = "") {
        return this.finishAnnihilationMatch(winnerTeam, reason || "섬멸전 종료");
      },

      startNextAnnihilationRound() {
        return false;
      },

      annihilationScoreText() {
        const score = this.syncAnnihilationObjectiveScore?.() || this.annihilation?.score || {};
        return `${Math.floor(score[TEAM.BLUE] || 0)} : ${Math.floor(score[TEAM.RED] || 0)}`;
      }
    });
  }

  IronLine.installAnnihilationRounds = installAnnihilationRounds;
})(window);
