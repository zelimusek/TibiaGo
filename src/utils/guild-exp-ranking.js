"use strict";

const https = require("https");

const GUILD_EXP_ENDPOINT = "https://cyrk.fun/api/game/guild-exp-top?window=24h";
const CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

let cache = { entries: [], updatedAt: 0, error: "" };
let refreshPromise = null;

function formatExperience(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("en-US");
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => body += chunk);
      response.on("end", () => {
        if (response.statusCode !== 200) {
          return reject(new Error("CYRK ranking HTTP " + response.statusCode));
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error("CYRK ranking returned invalid JSON"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("CYRK ranking request timed out")));
    request.on("error", reject);
  });
}

function refresh() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetchJson(GUILD_EXP_ENDPOINT)
    .then(payload => {
      if (!payload || !payload.success || !Array.isArray(payload.entries)) {
        throw new Error("CYRK ranking response is incomplete");
      }
      cache = {
        entries: payload.entries.slice(0, 3),
        updatedAt: Date.now(),
        error: ""
      };
    })
    .catch(err => {
      cache.error = err.message;
      console.warn("Could not refresh CYRK guild EXP ranking:", err.message);
    })
    .finally(() => { refreshPromise = null; });

  return refreshPromise;
}

function getDescription() {
  if (!cache.updatedAt || Date.now() - cache.updatedAt >= CACHE_MS) {
    refresh();
  }

  if (!cache.entries.length) {
    return "The CYRK guild EXP podium is being updated. Look again in a moment.";
  }

  const podium = cache.entries.map((entry, index) => {
    const place = Number(entry.place) || index + 1;
    const name = String(entry.name || "Unknown").slice(0, 40);
    const level = Number(entry.level) || 0;
    return `${place}. ${name} - ${formatExperience(entry.gained)} EXP (Level ${level})`;
  });

  return "CYRK Guild EXP Podium (last 24h):\n" + podium.join("\n") + ".";
}

// Warm the cache during server startup, so the first look at the noticeboard
// normally already has a complete podium to display.
refresh();

module.exports = { getDescription, refresh };
