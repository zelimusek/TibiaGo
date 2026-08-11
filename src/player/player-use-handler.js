"use strict";

const GenericLock = requireModule("utils/generic-lock");
const { ReadTextPacket } = requireModule("network/protocol");

const UseHandler = function (player) {

  /*
   * Class UseHandler
   * Wrapper for the logic that handles using items
   */

  // Always reference the parent player
  this.__player = player;

  // The lock that prevents things being used too quickly
  this.__useWithLock = new GenericLock();

}

UseHandler.prototype.GLOBAL_USE_COOLDOWN = 20;

UseHandler.prototype.__resolveCarriedItem = function (serverId) {
  let found = this.__player.containerManager.findCarriedItemByType(serverId);
  if (found === null) this.__player.sendCancelMessage("You do not have this item.");
  return found;
};

UseHandler.prototype.handleInventoryItemUse = function (serverId) {
  let found = this.__resolveCarriedItem(serverId);
  if (found === null) return;
  return this.handleItemUse({ which: found.which, index: found.index });
};

UseHandler.prototype.handleInventoryItemUseWith = function (serverId, packet) {
  let found = this.__resolveCarriedItem(serverId);
  if (found === null) return;
  packet.fromWhere = found.which;
  packet.fromIndex = found.index;
  return this.handleActionUseWith(packet);
};

UseHandler.prototype.handleInventoryItemUseOnCreature = function (serverId, creatureId) {
  let found = this.__resolveCarriedItem(serverId);
  if (found === null) return;
  return this.handleActionUseOnCreature({
    fromWhere: found.which,
    fromIndex: found.index,
    creatureId: creatureId
  });
};

UseHandler.prototype.handleActionUseWith = function (packet) {

  /*
   * Function UseHandler.handleActionUseWith
   * Called when a client request is made to use an item with another item
   */

  // This function is not available
  if (this.__useWithLock.isLocked()) {
    return this.__player.sendCancelMessage("You cannot use this object yet.");
  }

  // Both must be present in the packet
  if (packet.fromWhere === null || packet.toWhere === null) {
    return;
  }

  // Must be besides the from (using) item
  if (!this.__player.isBesidesThing(packet.fromWhere)) {
    return this.__player.sendCancelMessage("You have to move closer to use this item.");
  }

  // Fetch the item
  let item = packet.fromWhere.peekIndex(packet.fromIndex);

  // If there is no item there is nothing to do
  if (item === null) {
    return;
  }

  // Emit the event for the prototype listeners
  item.emit("useWith", this.__player, item, packet.toWhere, packet.toIndex);

  // Explicitly handle key uses
  if (item.constructor.name === "Key") {
    item.handleKeyUse(this.__player, packet.toWhere);
  }

  if (item.constructor.name === "FluidContainer") {
    item.handleUseWith(this.__player, item, packet.toWhere, packet.toIndex);
  }

  // Lock the action for the coming global cooldown
  this.__useWithLock.lock(UseHandler.prototype.GLOBAL_USE_COOLDOWN);

}

UseHandler.prototype.handleActionUseOnCreature = function (packet) {

  /*
   * Function UseHandler.handleActionUseOnCreature
   * Called when a client uses an item (like a rune) on a creature from the battle list
   */

  // This function is not available
  if (this.__useWithLock.isLocked()) {
    return this.__player.sendCancelMessage("You cannot use this object yet.");
  }

  // Must have a valid source
  if (packet.fromWhere === null) {
    return;
  }

  // Must be besides the from (using) item
  if (!this.__player.isBesidesThing(packet.fromWhere)) {
    return this.__player.sendCancelMessage("You have to move closer to use this item.");
  }

  // Fetch the item
  let item = packet.fromWhere.peekIndex(packet.fromIndex);

  // If there is no item there is nothing to do
  if (item === null) {
    return;
  }

  // Get the creature by ID
  let creature = gameServer.world.creatureHandler.getCreatureFromId(packet.creatureId);

  if (creature === null) {
    return this.__player.sendCancelMessage("This creature does not exist.");
  }

  // Get the creature's tile
  let tile = creature.getTile();

  if (tile === null) {
    return this.__player.sendCancelMessage("Cannot use on this creature.");
  }

  // Check line of sight
  if (!this.__player.position.inLineOfSight(tile.position)) {
    return this.__player.sendCancelMessage("Target is not in line of sight.");
  }

  // Emit the event for the prototype listeners (runas are handled via "useWith" event)
  item.emit("useWith", this.__player, item, tile, 0);

  // Lock the action for the coming global cooldown
  this.__useWithLock.lock(UseHandler.prototype.GLOBAL_USE_COOLDOWN);

}

UseHandler.prototype.handleItemUse = function (packet) {

  /*
   * Function UseHandler.handleItemUse
   * Handles a use event for the tile
   */

  // An invalid tile or container was requested
  if (packet.which === null) {
    return;
  }

  let item;
  // Delegate to the appropriate handler
  if (packet.which.constructor.name === "Tile") {
    item = this.handleTileUse(packet.which);
  } else if (packet.which.constructor.name === "Equipment" || packet.which.constructor.name === "DepotContainer" || packet.which.isContainer()) {
    item = packet.which.peekIndex(packet.index);
  }

  if (item === null) {
    return;
  }

  // Bomberman crates reuse a regular container sprite. Never let its normal
  // use/rotate/container handlers run while it belongs to an active arena.
  if (item.__bombermanRoundTag) {
    return this.__player.sendCancelMessage("You cannot use this Bomberman object.");
  }

  // Emitter
  item.emit("use", this.__player, packet.which, packet.index, item);

  if (item.isDoor()) {
    item.toggle(this.__player);
  }

  if (item.isMailbox()) {
    return this.__player.containerManager.inbox.pop(item.getPosition());
  }

  if (item.hasUniqueId()) {
    return;
  }

  // If the item clicked is a container: toggle it
  if (item.isContainer() || item.isDepot()) {
    return this.__player.containerManager.toggleContainer(item);
  }

  // Rotate the item
  if (item.isRotateable()) {
    return item.rotate();
  }

  // Readable
  if (item.isReadable()) {

    if (item.isHangable() && !this.__player.canUseHangable(item)) {
      return this.__player.sendCancelMessage("You have to move to the other side.");
    }

    let content = gameServer.world.creatureHandler.getReadableContent
      ? gameServer.world.creatureHandler.getReadableContent(item)
      : item.getContent();

    return this.__player.write(new ReadTextPacket(item, content));

  }

}

UseHandler.prototype.handleTileUse = function (tile) {

  /*
   * Function UseHandler.handleTileUse
   * Handles the tile use event
   */

  // For the rest of the actions the player must be besides the tile
  if (!this.__player.position.besides(tile.position)) {
    return null;
  }

  // If there are no items on the tile, return the tile itself to allow using the base tile (e.g. sewer grate)
  let item = tile.getTopItem();

  if (item === null) {
    return tile;
  }

  return item;

}

module.exports = UseHandler;
