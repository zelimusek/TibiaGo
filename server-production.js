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

// ─── Static file handler ────────────────────────────────────────────────
function serveStaticFile(req, res) {
  let filePath = url.parse(req.url).pathname;

  // Default to index.html
  if (filePath === "/" || filePath === "") {
    filePath = "/index.html";
  }

  // Security: prevent directory traversal
  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.join(CLIENT_DIR, safePath);

  // Must be within CLIENT_DIR
  if (!fullPath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Check if file exists
  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If not found, serve index.html (SPA fallback)
      const indexPath = path.join(CLIENT_DIR, "index.html");
      if (fs.existsSync(indexPath) && filePath !== "/index.html") {
        serveFile(indexPath, res);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
      return;
    }
    serveFile(fullPath, res);
  });
}

function serveFile(fullPath, res) {
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const headers = { "Content-Type": contentType };

  // The installed PWA must always receive current application code. Assets
  // remain cacheable through the service worker, but a stale JS protocol can
  // otherwise leave the game on a black screen after a server update.
  if ([".html", ".js", ".css", ".webmanifest"].includes(ext)) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
  }

  const stream = fs.createReadStream(fullPath);
  res.writeHead(200, headers);
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

// ─── Override the HTTP server's request handler ─────────────────────────
// Remove all existing 'request' listeners (the game server's handler that rejects HTTP)
httpServer.removeAllListeners("request");

// Add our combined request handler
httpServer.on("request", (req, res) => {
  const pathname = url.parse(req.url).pathname;

  // 1. Login API
  if (pathname.startsWith("/api/login")) {
    return handleLoginAPI(req, res);
  }

  // 2. Health check
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }

  // 3. Static files (HTML5 client)
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
