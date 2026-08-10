"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PARTY_TRACK_PREFIX = "party-track:";
const SUPPORTED_EXTENSIONS = new Set([".mp3"]);
// The library travels through one game packet when /radio opens. Keep enough
// headroom for long UTF-8 filenames and the rest of the editor configuration.
const MAX_LIBRARY_TRACKS = 60;
const MAX_QUEUE_TRACKS = 50;
const MIN_TRACK_DURATION_MS = 5000;
const MAX_TRACK_DURATION_MS = 4 * 60 * 60 * 1000;
const QUEUE_LEAD_IN_MS = 2000;

const PartyRadioQueue = function (creatureHandler, options) {
  options = options || {};
  this.__creatureHandler = creatureHandler || null;
  this.__musicDirectory = options.musicDirectory
    || path.resolve(process.cwd(), "client", "party-music");
  this.__publicBase = options.publicBase || "/party-music/";
  this.__states = new Map();
  this.__revision = 0;
};

PartyRadioQueue.PARTY_TRACK_PREFIX = PARTY_TRACK_PREFIX;

PartyRadioQueue.prototype.__trackId = function (filename) {
  return crypto.createHash("sha256").update(filename).digest("hex").slice(0, 20);
};

PartyRadioQueue.prototype.__displayName = function (filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

PartyRadioQueue.prototype.getLibrary = function () {
  try {
    fs.mkdirSync(this.__musicDirectory, { recursive: true });
  } catch (error) {
    console.error("Could not create party music directory:", error.message);
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(this.__musicDirectory, { withFileTypes: true });
  } catch (error) {
    console.error("Could not read party music directory:", error.message);
    return [];
  }

  return entries
    .filter(function (entry) {
      return entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
    })
    .sort(function (left, right) {
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    })
    .slice(0, MAX_LIBRARY_TRACKS)
    .map(function (entry) {
      let stats = fs.statSync(path.join(this.__musicDirectory, entry.name));
      return {
        id: this.__trackId(entry.name),
        filename: entry.name,
        name: this.__displayName(entry.name),
        url: this.__publicBase + encodeURIComponent(entry.name) + "?v=" + Math.floor(stats.mtimeMs),
        bytes: stats.size,
        modifiedAt: Math.floor(stats.mtimeMs)
      };
    }, this);
};

PartyRadioQueue.prototype.getStatus = function (zoneId) {
  let state = this.__states.get(zoneId);
  if (!state) return null;

  return {
    active: true,
    currentIndex: state.currentIndex,
    after: state.after,
    tracks: state.tracks.map(function (track) {
      return {
        id: track.id,
        name: track.name,
        durationMs: track.durationMs
      };
    })
  };
};

PartyRadioQueue.prototype.start = function (zoneId, requestedTracks, after) {
  let library = this.getLibrary();
  let byId = new Map(library.map(function (track) { return [track.id, track]; }));

  if (!Array.isArray(requestedTracks) || requestedTracks.length === 0) {
    return { ok: false, message: "Add at least one MP3 to the queue." };
  }
  if (requestedTracks.length > MAX_QUEUE_TRACKS) {
    return { ok: false, message: "A party queue can contain at most " + MAX_QUEUE_TRACKS + " tracks." };
  }

  let tracks = [];
  for (let index = 0; index < requestedTracks.length; index++) {
    let requested = requestedTracks[index] || {};
    let libraryTrack = byId.get(String(requested.id || ""));
    let durationMs = Math.round(Number(requested.durationMs));
    if (!libraryTrack) {
      return { ok: false, message: "One of the selected MP3 files no longer exists. Refresh the library." };
    }
    if (!Number.isFinite(durationMs)
      || durationMs < MIN_TRACK_DURATION_MS
      || durationMs > MAX_TRACK_DURATION_MS) {
      return { ok: false, message: "Could not determine a valid duration for " + libraryTrack.name + "." };
    }
    tracks.push(Object.assign({}, libraryTrack, { durationMs: durationMs }));
  }

  let state = {
    id: ++this.__revision,
    zoneId: zoneId,
    after: after === "repeat" ? "repeat" : "radio",
    tracks: tracks,
    currentIndex: 0,
    trackStartedAt: Date.now() + QUEUE_LEAD_IN_MS
  };
  this.__states.set(zoneId, state);
  this.__broadcast(zoneId);

  return {
    ok: true,
    message: "Party queue scheduled with " + tracks.length + " track" + (tracks.length === 1 ? "" : "s") + "."
  };
};

PartyRadioQueue.prototype.stop = function (zoneId) {
  if (!this.__states.has(zoneId)) {
    return { ok: true, message: "The internet radio is already live." };
  }
  this.__states.delete(zoneId);
  this.__broadcast(zoneId);
  return { ok: true, message: "Party queue stopped. Returning to internet radio." };
};

PartyRadioQueue.prototype.getPlayback = function (zoneId, now) {
  let state = this.__states.get(zoneId);
  if (!state) return null;
  let track = state.tracks[state.currentIndex];
  if (!track) return null;

  now = Number.isFinite(now) ? now : Date.now();
  return {
    type: "local",
    revision: String(state.id) + ":" + String(state.currentIndex),
    title: track.name,
    url: track.url,
    index: state.currentIndex,
    total: state.tracks.length,
    durationMs: track.durationMs,
    positionMs: Math.max(0, now - state.trackStartedAt),
    startsInMs: Math.max(0, state.trackStartedAt - now)
  };
};

PartyRadioQueue.prototype.encodePlayback = function (zoneId, now) {
  let playback = this.getPlayback(zoneId, now);
  return playback
    ? PARTY_TRACK_PREFIX + encodeURIComponent(JSON.stringify(playback))
    : null;
};

PartyRadioQueue.prototype.tick = function (now) {
  now = Number.isFinite(now) ? now : Date.now();
  let changedZones = [];

  this.__states.forEach(function (state, zoneId) {
    let changed = false;
    let guard = state.tracks.length + 1;
    while (guard-- > 0) {
      let current = state.tracks[state.currentIndex];
      if (!current || now < state.trackStartedAt + current.durationMs) break;

      state.trackStartedAt += current.durationMs;
      state.currentIndex++;
      changed = true;

      if (state.currentIndex < state.tracks.length) continue;
      if (state.after === "repeat") {
        state.currentIndex = 0;
        state.id = ++this.__revision;
        continue;
      }

      this.__states.delete(zoneId);
      break;
    }
    if (changed) changedZones.push(zoneId);
  }, this);

  changedZones.forEach(this.__broadcast.bind(this));
};

PartyRadioQueue.prototype.__broadcast = function (zoneId) {
  if (!this.__creatureHandler
    || typeof this.__creatureHandler.resyncRadioZonePlayers !== "function") return;
  this.__creatureHandler.resyncRadioZonePlayers(zoneId);
};

module.exports = PartyRadioQueue;
