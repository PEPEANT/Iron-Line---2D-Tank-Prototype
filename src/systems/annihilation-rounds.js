"use strict";

(function registerAnnihilationRounds(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  function installAnnihilationRounds(Game) {
    Object.assign(Game.prototype, {
      defaultAnnihilationState() {
        return {
          state: "live",
          round: 1,
          maxRounds: 3,
          targetScore: 2,
          intermissionDuration: 20,
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
          || (team === TEAM.RED ? "적군" : "아군");
      },

      updateAnnihilationIntermission(dt) {
        const state = this.annihilation;
        if (!this.isAnnihilationMode() || state?.state !== "intermission") return false;
        state.intermissionRemaining = Math.max(0, (state.intermissionRemaining || 0) - dt);
        state.detail = `현재 점수 ${this.annihilationScoreText()}`;
        if (state.intermissionRemaining <= 0) this.startNextAnnihilationRound();
        return true;
      },

      updateAnnihilationResult() {
        if (!this.isAnnihilationMode()) return;
        if (!this.annihilation) this.resetAnnihilationState();
        if (this.annihilation.state !== "live") return;

        const redAlive = this.hasCombatPower(TEAM.RED);
        const blueAlive = this.hasCombatPower(TEAM.BLUE);
        if (blueAlive && redAlive) return;
        if (!blueAlive && !redAlive) {
          this.finishAnnihilationRound("", "양측 전투력 동시 소멸");
          return;
        }
        this.finishAnnihilationRound(redAlive ? TEAM.RED : TEAM.BLUE, "상대 전투력 소멸");
      },

      finishAnnihilationRound(winnerTeam, reason = "") {
        if (!this.annihilation) this.resetAnnihilationState();
        const state = this.annihilation;
        if (state.state !== "live") return false;

        if (winnerTeam) state.score[winnerTeam] = (state.score[winnerTeam] || 0) + 1;
        state.roundWinner = winnerTeam;
        const winnerName = winnerTeam ? this.annihilationTeamName(winnerTeam) : "무승부";
        state.banner = winnerTeam ? `${winnerName} 세력 라운드 승리!` : "라운드 무승부";
        state.detail = `현재 점수 ${this.annihilationScoreText()}`;

        if (winnerTeam && (state.score[winnerTeam] || 0) >= state.targetScore) {
          state.state = "ended";
          state.matchWinner = winnerTeam;
          const result = winnerTeam === TEAM.BLUE ? "BLUE VICTORY" : "MISSION LOST";
          this.finishGame(result, `${winnerName} 세력이 승리하였습니다. 최종 점수 ${this.annihilationScoreText()}`);
          return true;
        }

        if (state.round >= state.maxRounds) {
          state.state = "ended";
          const blueScore = state.score[TEAM.BLUE] || 0;
          const redScore = state.score[TEAM.RED] || 0;
          if (blueScore === redScore) {
            this.finishGame("DRAW", `섬멸전 종료: 최종 점수 ${this.annihilationScoreText()}`);
            return true;
          }
          const matchWinner = blueScore > redScore ? TEAM.BLUE : TEAM.RED;
          state.matchWinner = matchWinner;
          const matchWinnerName = this.annihilationTeamName(matchWinner);
          const result = matchWinner === TEAM.BLUE ? "BLUE VICTORY" : "MISSION LOST";
          this.finishGame(result, `${matchWinnerName} 세력이 승리하였습니다. 최종 점수 ${this.annihilationScoreText()}`);
          return true;
        }

        state.state = "intermission";
        state.intermissionRemaining = state.intermissionDuration;
        this.matchPhase = "intermission";
        this.countdownStarted = false;
        this.startCountdown = 0;
        this.playerRoundSpectator = false;
        this.input.clear();
        this.chat?.addSystemMessage?.(`${state.banner} ${state.detail}`);
        return true;
      },

      startNextAnnihilationRound() {
        if (!this.annihilation) this.resetAnnihilationState();
        const preserved = {
          ...this.annihilation,
          score: { ...this.annihilation.score },
          state: "live",
          round: Math.min(this.annihilation.maxRounds, (this.annihilation.round || 1) + 1),
          intermissionRemaining: 0,
          roundWinner: "",
          banner: "",
          detail: ""
        };
        this.resetScenarioForMatch({ preserveAnnihilation: preserved });
        this.annihilation = preserved;
        this.playerRoundSpectator = false;
        this.deploymentOpen = false;
        this.lobbyOpen = false;
        this.roomListOpen = false;
        this.result = "";
        this.resultReason = "";
        this.matchStarted = true;
        this.countdownStarted = false;
        this.matchPhase = "live";
        this.startCountdown = 0;
        this.startLoading = this.defaultStartLoadingState?.() || this.startLoading;
        this.chat?.addSystemMessage?.(`라운드 ${preserved.round} 시작`);
        this.canvas?.focus?.();
        return true;
      },

      annihilationScoreText() {
        const state = this.annihilation || this.defaultAnnihilationState();
        return `${state.score?.[TEAM.BLUE] || 0} : ${state.score?.[TEAM.RED] || 0}`;
      }
    });
  }

  IronLine.installAnnihilationRounds = installAnnihilationRounds;
})(window);
