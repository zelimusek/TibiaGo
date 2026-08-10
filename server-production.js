"use strict";

/**
 * server-production.js
 *
 * All-in-one production server for TibiaGo on MyDevil hosting.
 * Runs on a SINGLE PORT and handles:
 *   1. Static file serving (HTML5 client from client/)
 *   2. Login API (GET/POST /api/login)
 *   3. Game WebSocket server (upgrade on /gameworld)
 *
 * Usage:
 *   NODE_ENV=production PORT=2436 node server-production.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { accounts } = require("./src/db/schema");

// ─── Load .env file ─────────────────────────────────────────────────────
// If .env exists in cwd, load it (same logic as cyrkgildia for compatibility)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

// ─── Production port ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 2436;

// ─── Load TibiaGo globals (CONFIG, CONST, requireModule, etc.) ──────────
require("./require");

// Override server config to use our production port
CONFIG.SERVER.PORT = PORT;
CONFIG.SERVER.HOST = "0.0.0.0";

// Override EXTERNAL_HOST if set in env
if (process.env.EXTERNAL_HOST) {
  CONFIG.SERVER.EXTERNAL_HOST = process.env.EXTERNAL_HOST;
}

// ─── MIME types for static file serving ─────────────────────────────────
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".dat": "application/octet-stream",
  ".spr": "application/octet-stream",
  ".otbm": "application/octet-stream",
};

const CLIENT_DIR = path.join(__dirname, "client");
const MEMORY_LOG_INTERVAL_MS = Math.max(
  10000,
  parseInt(process.env.MEMORY_LOG_INTERVAL_MS, 10) || 60000
);
const MEMORY_LOG_MAX_BYTES = 5 * 1024 * 1024;
const MEMORY_LOG_PATH = path.join(__dirname, "logs", "memory.jsonl");
const CLIENT_DIAGNOSTIC_LOG_PATH = path.join(__dirname, "logs", "client-diagnostics.jsonl");
const CLIENT_DIAGNOSTIC_LOG_MAX_BYTES = 5 * 1024 * 1024;
const CLIENT_DIAGNOSTIC_BODY_MAX_BYTES = 16 * 1024;
const CLIENT_DIAGNOSTIC_RATE_WINDOW_MS = 60 * 1000;
const CLIENT_DIAGNOSTIC_RATE_MAX = 30;
const clientDiagnosticRate = new Map();
const configuredMemoryAlertRssMiB =
  parseFloat(process.env.MEMORY_ALERT_RSS_MIB);
const MEMORY_ALERT_RSS_MIB =
  Number.isFinite(configuredMemoryAlertRssMiB) &&
  configuredMemoryAlertRssMiB >= 0
    ? configuredMemoryAlertRssMiB
    : 1900;
let memoryAlertActive = false;

// ─── Initialize Login Server Logic (without creating its own HTTP server) ──
const LoginServer = requireModule("auth/login-server");

// We instantiate LoginServer but DON'T call initialize() (which would listen on its own port).
// Instead, we'll use its methods directly.
const loginServer = new LoginServer();
// Manually open the account database
// (The constructor already does this, but the server.listen is NOT called)

// ─── Initialize Game Server ─────────────────────────────────────────────
const GameServer = requireModule("core/gameserver");

console.log("Starting TibiaGo Production Server (all-in-one)");
console.log("Port: %s", PORT);
console.log("External Host: %s", CONFIG.SERVER.EXTERNAL_HOST);
console.log("Client Version: %s", CONFIG.SERVER.CLIENT_VERSION);
console.log("Data directory: %s", getDataFile(""));

// Create the game server (this creates HTTPServer internally with our overridden PORT)
global.gameServer = process.gameServer = new GameServer();

// Initialize the gameserver (this starts the HTTP server, game loop, database, etc.)
gameServer.initialize();

// ─── Now hook into the game server's HTTP server for static files + login API ──

// The game server's internal HTTP server is at: gameServer.HTTPServer.__server
const httpServer = gameServer.HTTPServer.__server;

// Save the original request handler
const originalRequestHandler = gameServer.HTTPServer.__handleRequest.bind(gameServer.HTTPServer);
const originalUpgradeHandler = gameServer.HTTPServer.__handleUpgrade.bind(gameServer.HTTPServer);

function bytesToMiB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(1));
}

function getRuntimeStats() {
  const memory = process.memoryUsage();
  let connections = 0;
  let players = 0;

  try {
    connections = gameServer.HTTPServer.websocketServer.socketHandler.getTotalConnectedSockets();
    players = gameServer.world.creatureHandler.getConnectedPlayers().size;
  } catch (error) {
    // Startup and shutdown can briefly leave one of these managers unavailable.
  }

  const rssMiB = bytesToMiB(memory.rss);
  const alertActive =
    MEMORY_ALERT_RSS_MIB > 0 && rssMiB >= MEMORY_ALERT_RSS_MIB;

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMiB: {
      rss: rssMiB,
      heapUsed: bytesToMiB(memory.heapUsed),
      heapTotal: bytesToMiB(memory.heapTotal),
      external: bytesToMiB(memory.external),
      arrayBuffers: bytesToMiB(memory.arrayBuffers),
    },
    memoryAlert: {
      active: alertActive,
      thresholdRssMiB: MEMORY_ALERT_RSS_MIB,
    },
    features: {
      lazyTileNeighbours: CONFIG.WORLD.LAZY_TILE_NEIGHBOURS === true,
    },
    connections,
    players,
  };
}

function rotateMemoryLogIfNeeded() {
  try {
    if (!fs.existsSync(MEMORY_LOG_PATH)) {
      return;
    }
    if (fs.statSync(MEMORY_LOG_PATH).size < MEMORY_LOG_MAX_BYTES) {
      return;
    }

    const rotatedPath = MEMORY_LOG_PATH + ".1";
    if (fs.existsSync(rotatedPath)) {
      fs.unlinkSync(rotatedPath);
    }
    fs.renameSync(MEMORY_LOG_PATH, rotatedPath);
  } catch (error) {
    console.error("Could not rotate memory telemetry log:", error.message);
  }
}

function writeMemoryTelemetry() {
  try {
    const stats = getRuntimeStats();

    if (stats.memoryAlert.active !== memoryAlertActive) {
      memoryAlertActive = stats.memoryAlert.active;
      if (memoryAlertActive) {
        console.warn(
          "[MEMORY ALERT] RSS %s MiB reached the %s MiB threshold.",
          stats.memoryMiB.rss,
          MEMORY_ALERT_RSS_MIB
        );
      } else {
        console.log(
          "[MEMORY RECOVERY] RSS %s MiB is below the %s MiB threshold.",
          stats.memoryMiB.rss,
          MEMORY_ALERT_RSS_MIB
        );
      }
    }

    fs.mkdirSync(path.dirname(MEMORY_LOG_PATH), { recursive: true });
    rotateMemoryLogIfNeeded();
    fs.appendFileSync(MEMORY_LOG_PATH, JSON.stringify(stats) + "\n", "utf8");
  } catch (error) {
    console.error("Could not write memory telemetry:", error.message);
  }
}

function sanitizeClientDiagnostic(value, depth) {
  if (depth > 5 || value === null || value === undefined) {
    return value === undefined ? null : value;
  }
  if (typeof value === "string") {
    return value.slice(0, 6000);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map(entry => sanitizeClientDiagnostic(entry, depth + 1));
  }
  if (typeof value === "object") {
    const clean = {};
    Object.keys(value).slice(0, 40).forEach(key => {
      clean[String(key).slice(0, 120)] = sanitizeClientDiagnostic(value[key], depth + 1);
    });
    return clean;
  }
  return String(value).slice(0, 1000);
}

function rotateClientDiagnosticLogIfNeeded() {
  try {
    if (!fs.existsSync(CLIENT_DIAGNOSTIC_LOG_PATH)) {
      return;
    }
    if (fs.statSync(CLIENT_DIAGNOSTIC_LOG_PATH).size < CLIENT_DIAGNOSTIC_LOG_MAX_BYTES) {
      return;
    }

    const rotatedPath = CLIENT_DIAGNOSTIC_LOG_PATH + ".1";
    if (fs.existsSync(rotatedPath)) {
      fs.unlinkSync(rotatedPath);
    }
    fs.renameSync(CLIENT_DIAGNOSTIC_LOG_PATH, rotatedPath);
  } catch (error) {
    console.error("Could not rotate client diagnostic log:", error.message);
  }
}

function getClientServerTransport(payload) {
  try {
    const character = payload
      && payload.context
      && typeof payload.context.character === "string"
      ? payload.context.character
      : null;
    if (!character) {
      return null;
    }

    const player = gameServer.world.creatureHandler.getPlayerByName(character);
    if (!player || !player.socketHandler) {
      return null;
    }

    const controller = player.socketHandler.getController();
    if (!controller || typeof controller.getTransportDiagnostic !== "function") {
      return null;
    }

    return {
      character: character,
      socketId: controller.id(),
      transport: controller.getTransportDiagnostic(),
      serverLoop: gameServer.gameLoop.getDataDetails()
    };
  } catch (error) {
    return { error: String(error && error.message ? error.message : error).slice(0, 500) };
  }
}

function writeClientDiagnostic(payload, req) {
  const record = {
    serverTimestamp: new Date().toISOString(),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    diagnostic: sanitizeClientDiagnostic(payload, 0),
    serverTransport: sanitizeClientDiagnostic(getClientServerTransport(payload), 0)
  };
  const serialized = JSON.stringify(record);

  try {
    fs.mkdirSync(path.dirname(CLIENT_DIAGNOSTIC_LOG_PATH), { recursive: true });
    rotateClientDiagnosticLogIfNeeded();
    fs.appendFileSync(CLIENT_DIAGNOSTIC_LOG_PATH, serialized + "\n", "utf8");
  } catch (error) {
    console.error("Could not write client diagnostic:", error.message);
  }

  console.warn("[CLIENT DIAGNOSTIC] %s", serialized);
}

function allowClientDiagnostic(req) {
  const now = Date.now();
  const address = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
  let state = clientDiagnosticRate.get(address);

  if (!state || now - state.startedAt >= CLIENT_DIAGNOSTIC_RATE_WINDOW_MS) {
    state = { startedAt: now, count: 0 };
    clientDiagnosticRate.set(address, state);
  }
  state.count++;

  if (clientDiagnosticRate.size > 500) {
    clientDiagnosticRate.forEach((entry, key) => {
      if (now - entry.startedAt >= CLIENT_DIAGNOSTIC_RATE_WINDOW_MS) {
        clientDiagnosticRate.delete(key);
      }
    });
  }

  return state.count <= CLIENT_DIAGNOSTIC_RATE_MAX;
}

function handleClientDiagnosticsAPI(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Allow": "POST" });
    res.end();
    return;
  }

  const requestOrigin = req.headers.origin;
  if (requestOrigin) {
    try {
      if (new URL(requestOrigin).host !== req.headers.host) {
        res.writeHead(403);
        res.end();
        return;
      }
    } catch (error) {
      res.writeHead(403);
      res.end();
      return;
    }
  }

  if (!allowClientDiagnostic(req)) {
    res.writeHead(429);
    res.end();
    return;
  }

  let bytes = 0;
  let tooLarge = false;
  const chunks = [];
  req.on("data", chunk => {
    bytes += chunk.length;
    if (bytes > CLIENT_DIAGNOSTIC_BODY_MAX_BYTES) {
      tooLarge = true;
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (tooLarge) {
      res.writeHead(413);
      res.end();
      return;
    }

    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Diagnostic payload must be an object.");
      }
      writeClientDiagnostic(payload, req);
      res.writeHead(204);
      res.end();
    } catch (error) {
      res.writeHead(400);
      res.end();
    }
  });
  req.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(400);
      res.end();
    }
  });
}

// Keep a small, rotating history so memory regressions can be diagnosed
// without relying solely on the hosting panel.
writeMemoryTelemetry();
setInterval(writeMemoryTelemetry, MEMORY_LOG_INTERVAL_MS).unref();

// ─── Static file handler ────────────────────────────────────────────────
function serveStaticFile(req, res) {
  let filePath = url.parse(req.url).pathname;

  try {
    filePath = decodeURIComponent(filePath);
  } catch (error) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  // Default to index.html
  if (filePath === "/" || filePath === "") {
    filePath = "/index.html";
  }

  // Security: prevent directory traversal
  const safePath = path.normalize(filePath).replace(/^[/\\]+/, "");
  const fullPath = path.resolve(CLIENT_DIR, safePath);

  // Must be within CLIENT_DIR
  if (fullPath !== CLIENT_DIR && !fullPath.startsWith(CLIENT_DIR + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Check if file exists
  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (filePath.startsWith("/party-music/")) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      // If not found, serve index.html (SPA fallback)
      const indexPath = path.join(CLIENT_DIR, "index.html");
      if (fs.existsSync(indexPath) && filePath !== "/index.html") {
        serveFile(indexPath, res, req);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
      return;
    }
    serveFile(fullPath, res, req, stats);
  });
}

function serveFile(fullPath, res, req, knownStats) {
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const headers = { "Content-Type": contentType };

  // The installed PWA must always receive current application code. Assets
  // remain cacheable through the service worker, but a stale JS protocol can
  // otherwise leave the game on a black screen after a server update.
  if ([".html", ".js", ".css", ".webmanifest"].includes(ext)) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
  } else if (ext === ".mp3") {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  let stats = knownStats || fs.statSync(fullPath);
  let range = req && req.headers ? req.headers.range : null;
  let streamOptions = {};
  let status = 200;

  headers["Accept-Ranges"] = "bytes";
  headers["Content-Length"] = stats.size;
  if (range) {
    let match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let suffixLength = match && !match[1] && match[2] ? Number(match[2]) : null;
    let start = suffixLength !== null
      ? Math.max(0, stats.size - suffixLength)
      : match && match[1] ? Number(match[1]) : 0;
    let end = suffixLength !== null
      ? stats.size - 1
      : match && match[2] ? Number(match[2]) : stats.size - 1;
    if (!match || !Number.isInteger(start) || !Number.isInteger(end)
      || (suffixLength !== null && suffixLength <= 0)
      || start < 0 || end < start || start >= stats.size) {
      res.writeHead(416, { "Content-Range": "bytes */" + stats.size });
      res.end();
      return;
    }
    end = Math.min(end, stats.size - 1);
    status = 206;
    streamOptions = { start: start, end: end };
    headers["Content-Range"] = "bytes " + start + "-" + end + "/" + stats.size;
    headers["Content-Length"] = end - start + 1;
  }

  res.writeHead(status, headers);
  if (req && req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(fullPath, streamOptions);
  stream.pipe(res);
  stream.on("error", () => {
    res.writeHead(500);
    res.end("Internal Server Error");
  });
}

// ─── Login API handler ──────────────────────────────────────────────────
function handleLoginAPI(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET, POST");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Strip /api/login prefix to get query string
  const fullUrl = req.url.replace(/^\/api\/login/, "") || "/";
  const requestObject = url.parse(fullUrl, true);

  if (req.method === "POST") {
    // Parse query from URL for POST (the client sends data as query params)
    loginServer.__createAccount(requestObject.query, res);
    return;
  }

  if (req.method === "GET") {
    loginServer.__getAccount(requestObject.query, res);
    return;
  }

  res.writeHead(501);
  res.end();
}

async function handlePartyManiacsAPI(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Allow": "GET" });
    res.end();
    return;
  }

  try {
    const rows = await loginServer.accountDatabase.db
      .select({ name: accounts.name, character: accounts.character })
      .from(accounts);
    const system = gameServer.world.creatureHandler.partyAchievements;
    const entries = new Map();
    rows.forEach(row => {
      const entry = system.getLeaderboardEntry(row.name, row.character, false);
      entries.set(entry.name.toLowerCase(), entry);
    });
    gameServer.world.creatureHandler.getConnectedPlayers().forEach(player => {
      const name = player.getProperty(CONST.PROPERTIES.NAME);
      entries.set(String(name).toLowerCase(), system.getLeaderboardEntry(name, {
        name: name,
        storage: player.storage
      }, true));
    });

    const rankings = system.createPublicLeaderboards(Array.from(entries.values()), 50);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalPlayers: entries.size,
      partyTime: rankings.partyTime,
      achievements: rankings.achievements
    }));
  } catch (error) {
    console.error("Could not build Party Maniacs leaderboards:", error.message);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Party Maniacs rankings are temporarily unavailable." }));
  }
}

// ─── Override the HTTP server's request handler ─────────────────────────
// Remove all existing 'request' listeners (the game server's handler that rejects HTTP)
httpServer.removeAllListeners("request");

// Add our combined request handler
httpServer.on("request", (req, res) => {
  const pathname = url.parse(req.url).pathname;

  // 1. Client-side crash and disconnect diagnostics
  if (pathname === "/api/client-diagnostics") {
    return handleClientDiagnosticsAPI(req, res);
  }

  // 2. Login API
  if (pathname.startsWith("/api/login")) {
    return handleLoginAPI(req, res);
  }

  // 3. Public party leaderboards shown before login
  if (pathname === "/api/party-maniacs") {
    return handlePartyManiacsAPI(req, res);
  }

  // 4. Health check
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getRuntimeStats()));
    return;
  }

  // 5. Static files (HTML5 client)
  serveStaticFile(req, res);
});

// ─── Override the upgrade handler to support /gameworld path ────────────
httpServer.removeAllListeners("upgrade");

httpServer.on("upgrade", (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;

  // Only upgrade WebSocket on /gameworld or / (root)
  if (pathname === "/gameworld" || pathname === "/") {
    // Normalize the URL to / for the game server's internal handler
    request.url = request.url.replace(/^\/gameworld/, "/");

    // Assign socket ID if not already set
    if (socket.id === undefined) {
      socket.id = gameServer.HTTPServer.__socketId++;
    }

    originalUpgradeHandler(request, socket, head);
  } else {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

console.log("TibiaGo Production Server is ready on port %s", PORT);
console.log("Access the game at: https://tibiago.cyrk.fun");
