"use strict";

function onStart(creature) {
  if (creature.isPlayer()) {
    creature.sendCancelMessage("You are paralyzed.");
    creature.setProperty(CONST.PROPERTIES.SPEED, creature.getSpeed());
    return;
  }

  // Monsters use their property directly for movement timing. Keep the
  // pre-paralyze value on the condition so it can be restored exactly.
  this.originalSpeed = creature.getProperty(CONST.PROPERTIES.SPEED);
  creature.setProperty(
    CONST.PROPERTIES.SPEED,
    Math.max(10, Math.floor(this.originalSpeed * 0.4))
  );
}

function onExpire(creature) {
  if (creature.isPlayer()) {
    creature.sendCancelMessage("You are no longer paralyzed.");
    creature.setProperty(CONST.PROPERTIES.SPEED, creature.getSpeed());
    return;
  }

  if (this.originalSpeed !== undefined) {
    creature.setProperty(CONST.PROPERTIES.SPEED, this.originalSpeed);
  }
}

function onTick() {}

module.exports.onStart = onStart;
module.exports.onExpire = onExpire;
module.exports.onTick = onTick;
