"use strict";

const { EffectMagicPacket } = requireModule("network/protocol");

const MAX_INTENSITY = 10;
const DECAY_INTERVAL_MS = 2500;
const USE_COOLDOWN_MS = 650;
const PIPE_SMOKE_EFFECT_BASE = 199;
const PIPE_INTOXICATION_EFFECT_BASE = 219;
const clouds = new Map();
const playerCooldowns = new Map();
const playerDoses = new Map();

function getCloudKey(position) {
  return position.x + "," + position.y + "," + position.z;
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

  let smokePacket = new EffectMagicPacket(position, PIPE_SMOKE_EFFECT_BASE + intensity);
  let intoxicationPacket = new EffectMagicPacket(position, PIPE_INTOXICATION_EFFECT_BASE + dose);
  let chunk = process.gameServer.world.getChunkFromWorldPosition(position);

  process.gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.POFF);
  if (chunk !== null) {
    chunk.broadcastFloor(position.z, smokePacket);
  } else {
    player.write(smokePacket);
  }
  player.write(intoxicationPacket);

  let handler = process.gameServer.world.creatureHandler;
  if (handler.partyAchievements) {
    handler.partyAchievements.increment(player, "pipeUses", 1);
  }

  return true;
};
