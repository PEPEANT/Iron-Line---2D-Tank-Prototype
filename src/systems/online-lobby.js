"use strict";

(function registerOnlineLobby(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class OnlineLobby {
    constructor(flow) {
      this.flow = flow;
      this.nodes = {};
    }

    ensure() {
      return;
    }

    update(game) {
      this.ensure();
    }
  }

  IronLine.OnlineLobby = OnlineLobby;
})(window);
