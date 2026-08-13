"use strict";

const { CreaturePropertyPacket } = requireModule("network/protocol");

function onStart(creature, properties) {

  /*
   * Function onStart
   * Callback fired on condition start
   */

  creature.sendCancelMessage("You feel fast.");

  if (properties && Number(properties.bonusFactor) > 1) {
    creature.__hasteBonusFactor = Number(properties.bonusFactor);
  }

  // Update the authoritative server-side speed as well as the client. Without
  // this, the animation looked faster but movement stayed at the old rate.
  if (creature.isPlayer && creature.isPlayer()) {
    let newSpeed = creature.getSpeed();
    creature.setProperty(CONST.PROPERTIES.SPEED, newSpeed);
  }

}

function onExpire(creature) {

  /*
   * Function onExpire
   * Callback fired on condition expire
   */

  creature.sendCancelMessage("Your speed returns to normal.");

  delete creature.__hasteBonusFactor;

  // Broadcast the restored speed to all spectators
  if (creature.isPlayer && creature.isPlayer()) {
    let newSpeed = creature.getSpeed();
    creature.setProperty(CONST.PROPERTIES.SPEED, newSpeed);
  }

}

function onTick(creature) {

  /*
   * Function onTick
   * Callback fired every condition tick
   */

}

module.exports.onStart = onStart;
module.exports.onExpire = onExpire;
module.exports.onTick = onTick;
