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
  const FRAME_STALL_MS = 120;
  const MOVEMENT_ACK_STALL_MS = 180;
  const TILE_CACHE_STALL_MS = 40;
  const NETWORK_BATCH_STALL_MS = 50;
  const PERFORMANCE_REPORT_COOLDOWN_MS = 10000;
  const RADIO_RATE_WINDOW_MS = 5000;
  const RADIO_RATE_WARNING_COUNT = 8;

  if (window.tibiaDiagnostics) {
    return;
  }

  const performanceState = {
    lastFrameAt: null,
    lastFrameGapMs: 0,
    maxFrameGapMs: 0,
    frameStalls: 0,
    tileCache: {
      calls: 0,
      slowCalls: 0,
      lastMs: 0,
      maxMs: 0,
      totalMs: 0,
      lastTiles: 0,
      lastReason: null
    },
    movement: {
      sequence: 0,
      sent: 0,
      confirmed: 0,
      blockedInputs: 0,
      pending: null,
      lastAckMs: null,
      maxAckMs: 0
    },
    network: {
      batches: 0,
      slowBatches: 0,
      lastMs: 0,
      maxMs: 0,
      lastBytes: 0,
      lastPackets: 0,
      lastBufferedAmount: 0,
      radioAmbiencePackets: 0,
      radioAmbienceBytes: 0,
      recentRadioAmbienceAt: [],
      lastPartyPhase: null,
      lastLatencyMs: null,
      maxLatencyMs: 0
    },
    memory: {
      sampledAt: null,
      usedJSHeapSize: null,
      previousUsedJSHeapSize: null,
      lastDropBytes: 0
    },
    longTasks: [],
    lastReportAt: {}
  };

  function now() {
    return window.performance && typeof window.performance.now === "function"
      ? window.performance.now()
      : Date.now();
  }

  function rounded(value) {
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
  }

  function isVisible() {
    return !document.visibilityState || document.visibilityState === "visible";
  }

  function sampleMemory(timestamp) {
    let memory = window.performance && window.performance.memory
      ? window.performance.memory
      : null;
    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
      return;
    }
    if (performanceState.memory.sampledAt !== null
        && timestamp - performanceState.memory.sampledAt < 500) {
      return;
    }

    performanceState.memory.previousUsedJSHeapSize = performanceState.memory.usedJSHeapSize;
    performanceState.memory.usedJSHeapSize = memory.usedJSHeapSize;
    performanceState.memory.sampledAt = timestamp;
    performanceState.memory.lastDropBytes = Number.isFinite(performanceState.memory.previousUsedJSHeapSize)
      ? Math.max(0, performanceState.memory.previousUsedJSHeapSize - memory.usedJSHeapSize)
      : 0;
  }

  function getPerformanceSnapshot() {
    let timestamp = now();
    let pending = performanceState.movement.pending;
    let recentRadio = performanceState.network.recentRadioAmbienceAt.filter(function (entry) {
      return timestamp - entry <= RADIO_RATE_WINDOW_MS;
    });
    performanceState.network.recentRadioAmbienceAt = recentRadio;

    return {
      frame: {
        lastGapMs: rounded(performanceState.lastFrameGapMs),
        maxGapMs: rounded(performanceState.maxFrameGapMs),
        stalls: performanceState.frameStalls
      },
      tileCache: {
        calls: performanceState.tileCache.calls,
        slowCalls: performanceState.tileCache.slowCalls,
        lastMs: rounded(performanceState.tileCache.lastMs),
        maxMs: rounded(performanceState.tileCache.maxMs),
        averageMs: performanceState.tileCache.calls > 0
          ? rounded(performanceState.tileCache.totalMs / performanceState.tileCache.calls)
          : 0,
        lastTiles: performanceState.tileCache.lastTiles,
        lastReason: performanceState.tileCache.lastReason
      },
      movement: {
        sent: performanceState.movement.sent,
        confirmed: performanceState.movement.confirmed,
        blockedInputs: performanceState.movement.blockedInputs,
        lastAckMs: rounded(performanceState.movement.lastAckMs),
        maxAckMs: rounded(performanceState.movement.maxAckMs),
        pending: pending ? {
          sequence: pending.sequence,
          ageMs: rounded(timestamp - pending.startedAt),
          direction: pending.direction,
          target: pending.target,
          blockedInputs: pending.blockedInputs
        } : null
      },
      network: {
        batches: performanceState.network.batches,
        slowBatches: performanceState.network.slowBatches,
        lastMs: rounded(performanceState.network.lastMs),
        maxMs: rounded(performanceState.network.maxMs),
        lastBytes: performanceState.network.lastBytes,
        lastPackets: performanceState.network.lastPackets,
        bufferedAmount: performanceState.network.lastBufferedAmount,
        latencyMs: rounded(performanceState.network.lastLatencyMs),
        maxLatencyMs: rounded(performanceState.network.maxLatencyMs),
        radioAmbiencePackets: performanceState.network.radioAmbiencePackets,
        radioAmbienceBytes: performanceState.network.radioAmbienceBytes,
        radioAmbiencePacketsLast5s: recentRadio.length,
        lastPartyPhase: performanceState.network.lastPartyPhase
      },
      memory: {
        usedJSHeapSize: performanceState.memory.usedJSHeapSize,
        lastDropBytes: performanceState.memory.lastDropBytes
      },
      longTasks: performanceState.longTasks.slice(-6)
    };
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
      performance: getPerformanceSnapshot(),
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

  function maybeReport(type, details) {
    let timestamp = now();
    let lastReport = performanceState.lastReportAt[type];
    if (Number.isFinite(lastReport)
        && timestamp - lastReport < PERFORMANCE_REPORT_COOLDOWN_MS) {
      return null;
    }

    performanceState.lastReportAt[type] = timestamp;
    return record(type, details, true);
  }

  function markFrame(timestamp, elapsed) {
    timestamp = Number.isFinite(timestamp) ? timestamp : now();
    let gap = Number.isFinite(elapsed)
      ? elapsed
      : performanceState.lastFrameAt === null
        ? 0
        : timestamp - performanceState.lastFrameAt;
    performanceState.lastFrameAt = timestamp;

    if (!isVisible()) {
      return;
    }

    performanceState.lastFrameGapMs = gap;
    performanceState.maxFrameGapMs = Math.max(performanceState.maxFrameGapMs, gap);
    sampleMemory(timestamp);

    if (gap < FRAME_STALL_MS) {
      return;
    }

    performanceState.frameStalls++;
    maybeReport("client-frame-stall", {
      gapMs: rounded(gap),
      probableGcDropBytes: performanceState.memory.lastDropBytes,
      pendingMovement: getPerformanceSnapshot().movement.pending
    });
  }

  function markTileCache(duration, tileCount, reason) {
    duration = Number(duration) || 0;
    performanceState.tileCache.calls++;
    performanceState.tileCache.lastMs = duration;
    performanceState.tileCache.maxMs = Math.max(performanceState.tileCache.maxMs, duration);
    performanceState.tileCache.totalMs += duration;
    performanceState.tileCache.lastTiles = Number(tileCount) || 0;
    performanceState.tileCache.lastReason = truncate(reason || "unspecified", 80);

    if (duration >= TILE_CACHE_STALL_MS) {
      performanceState.tileCache.slowCalls++;
      maybeReport("tile-cache-stall", {
        durationMs: rounded(duration),
        tileCount: performanceState.tileCache.lastTiles,
        reason: performanceState.tileCache.lastReason
      });
    }
  }

  function normalizeTarget(target) {
    if (!target) {
      return null;
    }
    return {
      x: Number(target.x),
      y: Number(target.y),
      z: Number(target.z)
    };
  }

  function markMovementSent(direction, target) {
    let sequence = ++performanceState.movement.sequence;
    performanceState.movement.sent++;
    performanceState.movement.pending = {
      sequence: sequence,
      startedAt: now(),
      direction: Number(direction),
      target: normalizeTarget(target),
      blockedInputs: 0
    };
  }

  function markMovementBlocked() {
    performanceState.movement.blockedInputs++;
    if (performanceState.movement.pending) {
      performanceState.movement.pending.blockedInputs++;
    }
  }

  function markMovementConfirmed() {
    let pending = performanceState.movement.pending;
    if (!pending) {
      return;
    }

    let acknowledgement = Math.max(0, now() - pending.startedAt);
    performanceState.movement.confirmed++;
    performanceState.movement.lastAckMs = acknowledgement;
    performanceState.movement.maxAckMs = Math.max(
      performanceState.movement.maxAckMs,
      acknowledgement
    );
    performanceState.movement.pending = null;

    if (acknowledgement >= MOVEMENT_ACK_STALL_MS) {
      maybeReport("movement-confirmation-lag", {
        acknowledgementMs: rounded(acknowledgement),
        sequence: pending.sequence,
        direction: pending.direction,
        target: pending.target,
        blockedInputs: pending.blockedInputs
      });
    }
  }

  function markNetworkBatch(duration, bytes, packets, bufferedAmount) {
    duration = Number(duration) || 0;
    performanceState.network.batches++;
    performanceState.network.lastMs = duration;
    performanceState.network.maxMs = Math.max(performanceState.network.maxMs, duration);
    performanceState.network.lastBytes = Number(bytes) || 0;
    performanceState.network.lastPackets = Number(packets) || 0;
    performanceState.network.lastBufferedAmount = Number(bufferedAmount) || 0;

    if (duration >= NETWORK_BATCH_STALL_MS) {
      performanceState.network.slowBatches++;
      maybeReport("network-batch-stall", {
        durationMs: rounded(duration),
        bytes: performanceState.network.lastBytes,
        packets: performanceState.network.lastPackets,
        bufferedAmount: performanceState.network.lastBufferedAmount
      });
    }
  }

  function markRadioAmbience(bytes, partyPhase) {
    let timestamp = now();
    performanceState.network.radioAmbiencePackets++;
    performanceState.network.radioAmbienceBytes += Number(bytes) || 0;
    performanceState.network.lastPartyPhase = partyPhase || null;
    performanceState.network.recentRadioAmbienceAt.push(timestamp);
    performanceState.network.recentRadioAmbienceAt = performanceState.network.recentRadioAmbienceAt.filter(function (entry) {
      return timestamp - entry <= RADIO_RATE_WINDOW_MS;
    });

    if (performanceState.network.recentRadioAmbienceAt.length >= RADIO_RATE_WARNING_COUNT) {
      maybeReport("radio-ambience-flood", {
        packetsLast5s: performanceState.network.recentRadioAmbienceAt.length,
        totalPackets: performanceState.network.radioAmbiencePackets,
        totalBytes: performanceState.network.radioAmbienceBytes,
        partyPhase: performanceState.network.lastPartyPhase
      });
    }
  }

  function markLatency(latency) {
    latency = Number(latency) || 0;
    performanceState.network.lastLatencyMs = latency;
    performanceState.network.maxLatencyMs = Math.max(
      performanceState.network.maxLatencyMs,
      latency
    );
    if (latency >= 250) {
      maybeReport("high-client-latency", { latencyMs: rounded(latency) });
    }
  }

  window.tibiaDiagnostics = {
    record: record,
    markFrame: markFrame,
    markTileCache: markTileCache,
    markMovementSent: markMovementSent,
    markMovementBlocked: markMovementBlocked,
    markMovementConfirmed: markMovementConfirmed,
    markNetworkBatch: markNetworkBatch,
    markRadioAmbience: markRadioAmbience,
    markLatency: markLatency,
    getPerformanceSnapshot: getPerformanceSnapshot,
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

  if (typeof window.PerformanceObserver === "function") {
    try {
      let observer = new window.PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          let longTask = {
            durationMs: rounded(entry.duration),
            startTime: rounded(entry.startTime)
          };
          performanceState.longTasks.push(longTask);
          performanceState.longTasks = performanceState.longTasks.slice(-12);
          if (entry.duration >= FRAME_STALL_MS) {
            maybeReport("client-long-task", longTask);
          }
        });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch (error) {
      // Long Task API is optional and missing on several mobile browsers.
    }
  }

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
