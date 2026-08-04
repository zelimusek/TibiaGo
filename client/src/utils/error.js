const ConnectionError = function(message) {
  this.name = "ConnectionError";
  this.message = message;
}

ConnectionError.prototype = Error.prototype;

const AuthenticationError = function(message) {
  this.name = "AuthenticationError";
  this.message = message;
}

AuthenticationError.prototype = Error.prototype;

const ServerError = function(message) {
  this.name = "ServerError";
  this.message = message;
}

ServerError.prototype = Error.prototype;

(function initializeClientDiagnostics() {

  const STORAGE_KEY = "tibiago-client-diagnostics-v1";
  const MAX_ENTRIES = 80;

  if (window.tibiaDiagnostics) {
    return;
  }

  function truncate(value, maximum) {
    return String(value == null ? "" : value).slice(0, maximum);
  }

  function serializeError(error) {
    if (!error) {
      return null;
    }

    return {
      name: truncate(error.name || "Error", 120),
      message: truncate(error.message || error, 2000),
      stack: truncate(error.stack || "", 6000)
    };
  }

  function getRuntimeContext() {
    let client = window.gameClient || null;
    let network = client && client.networkManager ? client.networkManager : null;
    let renderer = client && client.renderer ? client.renderer : null;
    let weather = renderer && renderer.weatherCanvas ? renderer.weatherCanvas : null;
    let disco = weather && weather.__discoLights ? weather.__discoLights : null;
    let focus = disco && disco.focus ? disco.focus : null;
    let laserShow = disco && disco.laserShow ? disco.laserShow : null;
    let memory = window.performance && window.performance.memory
      ? window.performance.memory
      : null;

    return {
      character: client && client.player ? truncate(client.player.name, 80) : null,
      connected: network ? network.isConnected() === true : false,
      connectionId: network ? network.__diagnosticConnectionId || null : null,
      lastServerOpcode: network ? network.__lastServerOpcode : null,
      frame: renderer && renderer.debugger ? renderer.debugger.__nFrames : null,
      visibility: document.visibilityState || null,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1
      },
      memory: memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      } : null,
      disco: disco ? {
        spotlightsEnabled: disco.spotlightsEnabled === true,
        legacyLasersEnabled: disco.legacyLasersEnabled === true,
        radius: disco.radius,
        intensity: disco.intensity,
        spotlightSpeed: disco.spotlightSpeed,
        focus: focus ? {
          targetId: focus.targetId,
          targetName: truncate(focus.targetName, 80),
          source: truncate(focus.source, 80),
          persistent: focus.persistent === true,
          includeLasers: focus.includeLasers === true,
          elapsedMs: focus.elapsedMs,
          durationMs: focus.durationMs,
          vipShow: focus.vipShow ? {
            effect: truncate(focus.vipShow.effect, 40),
            preset: truncate(focus.vipShow.preset, 40),
            intensity: truncate(focus.vipShow.intensity, 40),
            crowd: focus.vipShow.crowd === true,
            participantCount: Array.isArray(focus.vipShow.participants)
              ? focus.vipShow.participants.length
              : 0
          } : null
        } : null,
        laserShow: laserShow ? {
          mode: truncate(laserShow.mode, 80),
          elapsedMs: laserShow.elapsedMs,
          durationMs: laserShow.durationMs
        } : null
      } : null
    };
  }

  function persist(entry) {
    try {
      let stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(stored)) {
        stored = [];
      }
      stored.push(entry);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored.slice(-MAX_ENTRIES)));
    } catch (error) {
      // Diagnostics must never interfere with the game client.
    }
  }

  function transmit(entry) {
    let body;
    try {
      body = JSON.stringify(entry);
    } catch (error) {
      return;
    }

    try {
      if (window.navigator && typeof window.navigator.sendBeacon === "function") {
        if (window.navigator.sendBeacon("/api/client-diagnostics", body)) {
          return;
        }
      }
    } catch (error) {
      // Fall through to fetch.
    }

    try {
      window.fetch("/api/client-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: body,
        keepalive: true,
        credentials: "same-origin"
      }).catch(function () {});
    } catch (error) {
      // A failed diagnostic report must not trigger another diagnostic error.
    }
  }

  function record(type, details, sendToServer) {
    let entry = {
      timestamp: new Date().toISOString(),
      type: truncate(type || "unknown", 120),
      details: details || null,
      context: getRuntimeContext()
    };

    persist(entry);
    if (sendToServer === true) {
      transmit(entry);
    }
    return entry;
  }

  window.tibiaDiagnostics = {
    record: record,
    getEntries: function () {
      try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      } catch (error) {
        return [];
      }
    },
    clear: function () {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {}
    }
  };

  window.addEventListener("error", function (event) {
    record("javascript-error", {
      message: truncate(event.message, 2000),
      filename: truncate(event.filename, 500),
      line: event.lineno || null,
      column: event.colno || null,
      error: serializeError(event.error)
    }, true);
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    record("unhandled-promise-rejection", {
      error: serializeError(event.reason)
    }, true);
  });

  document.addEventListener("webglcontextlost", function (event) {
    record("webgl-context-lost", {
      statusMessage: truncate(event.statusMessage, 1000)
    }, true);
  }, true);

  document.addEventListener("contextlost", function (event) {
    record("canvas-context-lost", {
      targetId: event.target && event.target.id ? truncate(event.target.id, 120) : null
    }, true);
  }, true);

})();
