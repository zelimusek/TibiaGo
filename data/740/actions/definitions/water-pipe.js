"use strict";

const { RadioStreamPacket } = requireModule("network/protocol");

const MAX_INTENSITY = 10;
const DECAY_INTERVAL_MS = 2500;
const USE_COOLDOWN_MS = 650;
const clouds = new Map();
const playerCooldowns = new Map();
const playerDoses = new Map();

function getCloudKey(position) {
  return position.x + "," + position.y + "," + position.z;
}

function getRadius(intensity) {
  if (intensity >= 9) return 4;
  if (intensity >= 6) return 3;
  if (intensity >= 3) return 2;
  return 1;
}

module.exports = function useWaterPipe(player, tile, index, item) {
  let now = Date.now();
  let playerId = player.getId();
  let cooldownUntil = playerCooldowns.get(playerId) || 0;

  if (now < cooldownUntil) {
    return true;
  }

  playerCooldowns.set(playerId, now + USE_COOLDOWN_MS);

  let position = item.getPosition();
  if (!position) {
    position = player.getPosition();
  }

  let key = getCloudKey(position);
  let cloud = clouds.get(key);
  let intensity = 0;

  if (cloud) {
    intensity = Math.max(0, cloud.intensity - Math.floor((now - cloud.lastUsed) / DECAY_INTERVAL_MS));
  }

  intensity = Math.min(MAX_INTENSITY, intensity + 1);
  clouds.set(key, { intensity: intensity, lastUsed: now });

  let previousDose = playerDoses.get(playerId);
  let dose = previousDose
    ? Math.max(0, previousDose.intensity - Math.floor((now - previousDose.lastUsed) / DECAY_INTERVAL_MS))
    : 0;
  dose = Math.min(MAX_INTENSITY, dose + 1);
  playerDoses.set(playerId, { intensity: dose, lastUsed: now });

  let radius = getRadius(intensity);
  let duration = 10000 + intensity * 1400;
  let payload = encodeURIComponent(JSON.stringify({
    x: position.x,
    y: position.y,
    z: position.z,
    intensity: intensity,
    radius: radius,
    duration: duration,
    sourceId: playerId,
    dose: dose,
    seed: (now + position.x * 31 + position.y * 17) >>> 0
  }));
  let packet = new RadioStreamPacket(true, "pipe-smoke:" + payload, 0);
  let chunk = process.gameServer.world.getChunkFromWorldPosition(position);

  process.gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.POFF);
  if (chunk !== null) {
    chunk.broadcastFloor(position.z, packet);
  } else {
    player.write(packet);
  }

  return true;
};
