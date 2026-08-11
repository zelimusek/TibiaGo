"use strict";

/*
 * TibiaGo QA Packet Walker
 *
 * Educational test client for a character that you own. It authenticates using
 * the normal login API, records its own WebSocket frames and can walk a slow,
 * fixed square. It deliberately contains no combat, loot or target logic.
 *
 * Run locally:
 *   $env:BOT_ACCOUNT="585856"
 *   $env:BOT_PASSWORD="585856"
 *   $env:BOT_WALK="1"
 *   node tools/qa-packet-walker.js
 *
 * A remote URL additionally requires BOT_ALLOW_REMOTE=1. Credentials are read
 * only from environment variables and are never written to disk.
 */

const WebSocket = require("ws");

const baseUrl = process.env.BOT_BASE_URL || "https://tibiago.cyrk.fun";
const account = process.env.BOT_ACCOUNT;
const password = process.env.BOT_PASSWORD;
const shouldWalk = process.env.BOT_WALK === "1";
const printRaw = process.env.BOT_PRINT_RAW === "1";
const durationMs = Math.max(5, Number(process.env.BOT_DURATION_SECONDS || 60)) * 1000;
const stepMs = Math.max(700, Number(process.env.BOT_STEP_MS || 900));

const CLIENT = { LATENCY: 0, LOGOUT: 1, MOVE: 2 };
const SERVER = { CREATURE_STATE: 12, PLAYER_LOGIN: 17, PLAYER_LOGOUT: 18 };
const DIRECTIONS = [0, 1, 2, 3]; // north, east, south, west
const PROPERTY_NAMES = {
  0: "name", 1: "health", 2: "maxHealth", 3: "mana", 4: "maxMana",
  5: "capacity", 6: "maxCapacity", 7: "attack", 8: "defense",
  9: "attackSpeed", 10: "speed", 13: "role", 14: "sex", 15: "vocation",
  18: "magic", 19: "fist", 20: "club", 21: "sword", 22: "axe",
  23: "distance", 24: "shielding", 25: "fishing", 26: "experience"
};

if (!account || !password) {
  console.error("Set BOT_ACCOUNT and BOT_PASSWORD before running this QA tool.");
  process.exit(1);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(baseUrl) && process.env.BOT_ALLOW_REMOTE !== "1") {
  console.error("Remote use needs BOT_ALLOW_REMOTE=1. The default target is the local server only.");
  process.exit(1);
}

function readableString(buffer, offset) {
  if (offset >= buffer.length) return null;
  let length = buffer[offset];
  let start = offset + 1;
  let end = start + length;
  if (end > buffer.length) return null;
  let value = buffer.subarray(start, end).toString("utf8");
  if (!/^[\x20-\x7eÀ-ž]{1,80}$/u.test(value)) return null;
  return { value: value, next: end };
}

function readUInt16(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function tryReadCreatureState(buffer, offset) {
  // CreatureStatePacket layout mirrors src/network/protocol.js. Frames may be
  // concatenated, so this is intentionally a strict scanner rather than a
  // general packet decoder.
  if (buffer[offset] !== SERVER.CREATURE_STATE || offset + 35 >= buffer.length) return null;

  let index = offset + 1;
  let id = readUInt32(buffer, index); index += 4;
  let kind = buffer[index++];
  let x = readUInt16(buffer, index); index += 2;
  let y = readUInt16(buffer, index); index += 2;
  let z = readUInt16(buffer, index); index += 2;
  let direction = buffer[index++];

  // Outfit: id (2), four colours (4), mount (2), three flags (3).
  index += 11;
  if (index + 11 > buffer.length || id === 0 || kind > 2 || direction > 7 || z > 15 || x < 100 || y < 100) return null;

  let health = readUInt32(buffer, index); index += 4;
  let maxHealth = readUInt32(buffer, index); index += 4;
  let speed = readUInt16(buffer, index); index += 2;
  let repeatedKind = buffer[index++];
  let name = readableString(buffer, index);
  if (!name || repeatedKind !== kind || maxHealth === 0 || health > maxHealth || speed > 10000) return null;

  index = name.next;
  let conditionCount = buffer[index++];
  if (index + conditionCount > buffer.length || conditionCount > 32) return null;

  return {
    id: id,
    type: ["player", "monster", "npc"][kind],
    name: name.value,
    position: { x: x, y: y, z: z },
    bytes: index + conditionCount - offset
  };
}

function inspectPropertyFrames(buffer) {
  let index = 0;
  let found = false;

  // The server batches outgoing packets. This decodes a consecutive batch of
  // property updates, which is what the walker receives after each movement.
  while (index < buffer.length && buffer[index] === 37) {
    if (index + 6 > buffer.length) return found;
    let id = readUInt32(buffer, index + 1);
    let property = buffer[index + 5];
    let name = PROPERTY_NAMES[property] || "property#" + property;
    index += 6;

    if (property === 0) {
      let value = readableString(buffer, index);
      if (!value) return found;
      console.log("   PROPERTY: creature %d %s = %s", id, name, value.value);
      index = value.next;
    } else {
      if (index + 4 > buffer.length) return found;
      console.log("   PROPERTY: creature %d %s = %d", id, name, readUInt32(buffer, index));
      index += 4;
    }
    found = true;
  }

  return found;
}

function inspectFrame(data) {
  let buffer = Buffer.from(data);
  console.log("<- WebSocket frame: %d bytes, first opcode %d", buffer.length, buffer[0]);
  if (printRaw) console.log(buffer.subarray(0, 96).toString("hex"));
  inspectPropertyFrames(buffer);

  for (let index = 0; index < buffer.length; index++) {
    let creature = tryReadCreatureState(buffer, index);
    if (!creature) continue;
    console.log("   CREATURE_STATE: %s %s at %d, %d, %d (id %d)", creature.type, creature.name, creature.position.x, creature.position.y, creature.position.z, creature.id);
    index += creature.bytes - 1;
  }

  // Login/logout notices are short and illustrate information that is globally
  // announced by the game. This is best-effort inspection, not an exploit.
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] !== SERVER.PLAYER_LOGIN && buffer[index] !== SERVER.PLAYER_LOGOUT) continue;
    let name = readableString(buffer, index + 1);
    if (name) console.log("   %s: %s", buffer[index] === SERVER.PLAYER_LOGIN ? "PLAYER_LOGIN" : "PLAYER_LOGOUT", name.value);
  }
}

function getWebSocketUrl(login) {
  let endpoint = new URL(login.host);
  endpoint.searchParams.set("token", login.token);
  return endpoint.toString();
}

async function login() {
  let endpoint = new URL("/api/login", baseUrl);
  endpoint.searchParams.set("account", account);
  endpoint.searchParams.set("password", password);
  let response = await fetch(endpoint, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error("Login API returned HTTP " + response.status);
  return response.json();
}

async function main() {
  let loginResponse = await login();
  let socketUrl = getWebSocketUrl(loginResponse);
  console.log("Connected through %s; packet transport is %s.", new URL(socketUrl).origin, socketUrl.startsWith("wss:") ? "WSS/TLS" : "plain WS");

  let socket = new WebSocket(socketUrl);
  let moveTimer = null;
  let step = 0;

  socket.on("open", function () {
    console.log("WebSocket open. Recording only this test character's incoming frames.");
    if (shouldWalk) {
      moveTimer = setInterval(function () {
        let direction = DIRECTIONS[step++ % DIRECTIONS.length];
        socket.send(Buffer.from([CLIENT.MOVE, direction]));
        console.log("-> MOVE %d", direction);
      }, stepMs);
    }
  });

  socket.on("message", inspectFrame);
  socket.on("error", error => console.error("WebSocket error:", error.message));
  socket.on("close", () => console.log("WebSocket closed."));

  setTimeout(function () {
    if (moveTimer) clearInterval(moveTimer);
    if (socket.readyState === WebSocket.OPEN) socket.send(Buffer.from([CLIENT.LOGOUT]));
    socket.close();
  }, durationMs);
}

main().catch(error => {
  console.error("QA bot failed:", error.message);
  process.exitCode = 1;
});
