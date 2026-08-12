"use strict";

const Condition = requireModule("combat/condition");
const MailboxHandler = requireModule("utils/mailbox-handler");
const GuildExpRanking = requireModule("utils/guild-exp-ranking");

const {
  ItemInformationPacket,
  CreatureInformationPacket,
  ChunkPacket,
  CreatureStatePacket,
  CreatureSkullPacket,
  CreatureTeleportPacket
} = requireModule("network/protocol");

const PUBLIC_READABLE_ITEM_NAMES = new Set([
  "blackboard",
  "sign",
  "street sign"
]);
const PUBLIC_READ_DISTANCE = 8;

const PacketHandler = function () {

  /*
   * Class PacketHandler
   * Handles incoming packets
   */

  this.mailboxHandler = new MailboxHandler();
  this.__creatureResyncWindows = new WeakMap();

}

PacketHandler.prototype.handleCreatureResync = function (gameSocket, id) {
  /*
   * Repair one creature reference without periodically resending the whole
   * visible world. A client may only request a living creature it can really
   * see, and each connection is limited to a small number of repairs.
   */
  id = Number(id);
  if (
    !gameSocket
    || typeof gameSocket.isController !== "function"
    || !gameSocket.isController()
    || !gameSocket.player
    || !Number.isInteger(id)
    || id <= 0
  ) {
    return false;
  }

  let player = gameSocket.player;

  if (!(this.__creatureResyncWindows instanceof WeakMap)) {
    this.__creatureResyncWindows = new WeakMap();
  }

  let now = Date.now();
  let rate = this.__creatureResyncWindows.get(gameSocket);
  if (!rate) {
    rate = { attempts: [], ids: new Map(), chunks: new Map() };
  }

  if (!(rate.chunks instanceof Map)) rate.chunks = new Map();

  rate.attempts = rate.attempts.filter(function (timestamp) {
    return now - timestamp < 1000;
  });
  rate.ids.forEach(function (timestamp, creatureId) {
    if (now - timestamp >= 1000) rate.ids.delete(creatureId);
  });
  rate.chunks.forEach(function (timestamp, chunk) {
    if (now - timestamp >= 1000) rate.chunks.delete(chunk);
  });

  // Count every attempt before resolving the identifier so the endpoint
  // cannot be used as a high-rate creature-existence oracle.
  if (rate.attempts.length >= 5 || rate.ids.has(id)) {
    this.__creatureResyncWindows.set(gameSocket, rate);
    return false;
  }

  rate.attempts.push(now);
  rate.ids.set(id, now);
  this.__creatureResyncWindows.set(gameSocket, rate);

  let creature = gameServer.world.creatureHandler.getCreatureFromId(id);
  if (
    !gameServer.world.creatureHandler.isCreaturePositioned(player)
    || player.getProperty(CONST.PROPERTIES.HEALTH) <= 0
    || creature === null
    || !gameServer.world.creatureHandler.isCreaturePositioned(creature)
  ) {
    return false;
  }

  let observerChunk = player.getChunk();
  let creatureChunk = creature.getChunk();
  if (
    observerChunk === null
    || creatureChunk === null
    || !observerChunk.neighbours.includes(creatureChunk)
  ) {
    return false;
  }

  // A missing entity reference can be a symptom of a missing/replaced tile
  // too. Refresh the one authoritative chunk before recreating the creature.
  if (!rate.chunks.has(creatureChunk) && rate.chunks.size < 2) {
    rate.chunks.set(creatureChunk, now);
    gameSocket.write(new ChunkPacket(creatureChunk));
  }
  let isSelf = creature === player;
  if (!isSelf) {
    gameSocket.write(new CreatureStatePacket(creature));
  }

  if (
    !isSelf
    && creature.isPlayer && creature.isPlayer()
    && gameServer.world.combatHandler
  ) {
    let skull = gameServer.world.combatHandler
      .getPvPManager()
      .getSkullFor(player, creature);
    gameSocket.write(new CreatureSkullPacket(creature.getId(), skull));
  }

  // Existing-but-detached client objects ignore repeated state construction;
  // the following anchor makes them rebind to the authoritative tile too.
  gameSocket.write(new CreatureTeleportPacket(creature.getId(), creature.getPosition()));
  return true;
}

PacketHandler.prototype.handleTileUse = function (player, tile) {

  /*
   * Function PacketHandler.handleTileUse
   * Handles the tile use event
   */

  // For the rest of the actions the player must be besides the tile
  if (!player.position.besides(tile.position)) {
    return null;
  }

  return tile.getTopItem();

}

PacketHandler.prototype.handleLogout = function (gameSocket) {

  /*
   * Function PacketHandler.handleLogout
   * Handles a logout request from the player
   */

  // Block request because the player is still in combat. Dead players must be
  // allowed to logout so their respawn state can be saved immediately.
  if (!gameSocket.player.isZeroHealth() && gameSocket.player.isInCombat()) {
    return gameSocket.player.sendCancelMessage("You cannot logout while in combat.");
  }

  if (!gameSocket.player.isZeroHealth() && gameSocket.player.isInNoLogoutZone()) {
    return gameSocket.player.sendCancelMessage("You may not logout here.");
  }

  // Otherwise feel free to close the gamesocket and clean up
  gameSocket.close();

}

PacketHandler.prototype.__handlePushCreature = function (creature, position) {

  /*
   * Function PacketHandler.__handlePushCreature
   * Handles pushing of a monster to an adjacent tile
   */

  // Must be adjacent
  if (!position.besides(creature.position)) {
    return;
  }

  // Apply it on the next tick. A longer delay lets a wandering monster leave
  // its original tile before the drag is processed.
  gameServer.world.eventQueue.addEvent(creature.push.bind(creature, position), 1);

}

PacketHandler.prototype.__resolveSmartItemDestination = function (toWhere, toIndex) {
  /* Dropping onto the equipped backpack means putting the item inside it. */
  if (
    toWhere.constructor.name === "Equipment" &&
    Number(toIndex) === CONST.EQUIPMENT.BACKPACK
  ) {
    let backpack = toWhere.peekIndex(CONST.EQUIPMENT.BACKPACK);

    if (backpack !== null && backpack.isContainer && backpack.isContainer()) {
      return { toWhere: backpack, toIndex: 0 };
    }
  }

  return { toWhere, toIndex };
}

PacketHandler.prototype.__getSmartContainerMaximumAddCount = function (
  player,
  container,
  item,
  fromWhere,
  requestedCount
) {
  /*
   * A container drop targets the container, not necessarily the occupied slot
   * under the cursor. Find the capacity that addThingSmart can really use.
   */
  if (
    container === fromWhere &&
    (!item.isStackable() || requestedCount >= item.count)
  ) {
    return requestedCount;
  }

  let slots = container.getSlots
    ? container.getSlots()
    : (container.container && container.container.getSlots
      ? container.container.getSlots()
      : []);
  let maximum = 0;
  let isFull = slots.length > 0 && slots.every(function (slot) {
    return slot !== null;
  });

  for (let index = 0; index < slots.length; index++) {
    let slotMaximum = container.getMaximumAddCount(player, item, index);

    // addThingSmart uses the first compatible stack in a full container.
    // Limiting to that exact capacity prevents stack overflow from being lost.
    if (isFull && slotMaximum > 0) {
      return slotMaximum;
    }

    maximum = Math.max(maximum, slotMaximum);
  }

  if (maximum > 0) {
    return maximum;
  }

  // addThingSmart only descends into nested containers when this one is full.
  for (let index = 0; index < slots.length; index++) {
    let child = slots[index];

    if (child !== null && child.isContainer && child.isContainer()) {
      let childMaximum = this.__getSmartContainerMaximumAddCount(
        player,
        child,
        item,
        fromWhere,
        requestedCount
      );

      // addThingSmart descends into the first nested container that accepts
      // the item, so its capacity is the effective limit for this move.
      if (childMaximum > 0) {
        return childMaximum;
      }
    }
  }

  return maximum;
}

PacketHandler.prototype.moveItem = function (player, packet) {

  /*
   * Function PacketHandler.moveItem
   * Internal private function that moves one object from one place to another: very important!
   */

  let { fromWhere, fromIndex, toWhere, toIndex, count } = packet;

  // Invalid source or target location
  if (fromWhere === null || toWhere === null) {
    return;
  }

  // If moving from a tile the player must be adjacent to that particular tile!
  if (fromWhere.constructor.name === "Tile") {

    // Server check: is the player besides the tile?
    if (!player.position.besides(fromWhere.position)) {
      return player.sendCancelMessage("You are not close enough.");
    }

  }

  // If throwing to a tile check if the player can reach it
  if (toWhere.constructor.name === "Tile") {

    if (!player.position.inLineOfSight(toWhere.position)) {
      return player.sendCancelMessage("You cannot throw this item here.");
    }

  }

  // Get the item that is being moved
  let fromItem = fromWhere.peekIndex(fromIndex);

  // No item means this may be a creature push from one tile to another.
  if (fromItem === null) {
    let creature = fromWhere.getCreature ? fromWhere.getCreature() : null;

    if (creature === null || creature.isPlayer()) {
      return;
    }

    let prototype = creature.getPrototype ? creature.getPrototype() : null;
    let isPushable = prototype && prototype.flags && prototype.flags.pushable === true;

    if (!isPushable) {
      return player.sendCancelMessage("You cannot move this creature.");
    }

    if (toWhere.constructor.name !== "Tile") {
      return;
    }

    if (!fromWhere.position.besides(toWhere.position)) {
      return;
    }

    if (toWhere.isOccupiedAny && toWhere.isOccupiedAny()) {
      return player.sendCancelMessage("You cannot move this creature there.");
    }

    return this.__handlePushCreature(creature, toWhere.position);
  }

  // Runtime Bomberman obstacles use ordinary map sprites, some of which are
  // normally moveable containers. The round tag is the authoritative rule:
  // no arena wall, crate, bomb or power-up may be dragged by a player.
  if (fromItem.__bombermanRoundTag) {
    return player.sendCancelMessage("You cannot move this Bomberman object.");
  }

  // Can the item be moved at all?
  if (!fromItem.isMoveable() || fromItem.hasUniqueId()) {
    return player.sendCancelMessage("You cannot move this item.");
  }

  // Treat the equipped backpack icon as a shortcut to the backpack contents.
  let destination = this.__resolveSmartItemDestination(toWhere, toIndex);
  toWhere = destination.toWhere;
  toIndex = destination.toIndex;

  // Moving to a place where there is a floor change (or teleporter)
  if (toWhere.constructor.name === "Tile") {

    if (toWhere.hasItems() && toWhere.itemStack.isMailbox() && this.mailboxHandler.canMailItem(fromItem)) {
      return this.mailboxHandler.sendThing(fromWhere, toWhere, player, fromItem);
    }

    // Check if the tile itself is blocking (mountains, walls, etc.)
    if (toWhere.isBlockSolid()) {
      return player.sendCancelMessage("You cannot throw there.");
    }

    // Thrown inside a teleport or stair?
    toWhere = gameServer.world.lattice.findDestination(player, toWhere);

    // No valid destination
    if (toWhere === null) {
      return player.sendCancelMessage("You cannot add this item here.");
    }

    // Trashholders have special handling
    if (toWhere.isTrashholder()) {
      return this.__addThingToTrashholder(fromItem, fromWhere, fromIndex, toWhere, count);
    }

    // Solid for items
    if (toWhere.hasItems() && toWhere.itemStack.isItemSolid()) {
      return player.sendCancelMessage("You cannot add this item here.");
    }

    if (fromItem.isBlockSolid() && toWhere.isOccupiedAny()) {
      return player.sendCancelMessage("You cannot add this item here.");
    }

  }

  // Check for containers and capacity
  if (toWhere.getTopParent() === player) {
    if (!player.hasSufficientCapacity(fromItem)) {
      if (fromWhere.constructor.name === "DepotContainer" || toWhere.getTopParent() !== fromWhere.getTopParent()) {
        return player.sendCancelMessage("Your capacity is insufficient to carry this item.");
      }
    }
  }

  let isSmartContainer = (
    toWhere.constructor.name === "DepotContainer" ||
    (toWhere.isContainer && toWhere.isContainer())
  );

  // Container drops are semantic "put inside" actions. An occupied slot under
  // the cursor must not hide another empty slot or compatible stack.
  let maxCount = isSmartContainer
    ? this.__getSmartContainerMaximumAddCount(
      player,
      toWhere,
      fromItem,
      fromWhere,
      count
    )
    : toWhere.getMaximumAddCount(player, fromItem, toIndex);

  // No items can be added there.
  if (maxCount === 0) {
    return player.sendCancelMessage("You cannot add this item here.");
  }

  // Make sure to limit the moved count to what the player wants to move and the maximum
  let realCount = Math.min(count, maxCount);

  this.__moveItem(player, fromWhere, fromIndex, toWhere, toIndex, realCount);

}

PacketHandler.prototype.__addItemToMailbox = function (player, direction) {

}

PacketHandler.prototype.handleItemLook = function (player, packet) {

  /*
   * Function PacketHandler.handleItemLook
   * Handles a look event at an item or creature or tile
   */

  // Invalid thing supplied
  if (packet.which === null) {
    return;
  }

  // Looking at a living creature on the tile
  let creature = this.__getLookCreature(packet.which);
  if (creature !== null) {
    return player.write(new CreatureInformationPacket(creature));
  }

  // Get the item at the requested index
  let thing = packet.which.peekIndex(packet.index);

  // Overwrite with the thing itself
  if (thing === null) {
    thing = packet.which;
  }

  // Check if thing has hasUniqueId method (Tiles don't have this method)
  let hasUniqueId = thing.hasUniqueId ? thing.hasUniqueId() : false;
  let includeDetails = !hasUniqueId && (packet.which.constructor.name !== "Tile" || player.isBesidesThing(packet.which));

  // Public signs and blackboards are intended to be read by a crowd. Their
  // description contains the familiar "It reads:" text, so allow that part of
  // Look from a modest distance without making private readable items public.
  if (this.__canReadPublicItemFromDistance(player, thing)) {
    includeDetails = true;
  }

  const position = thing.getPosition ? thing.getPosition() : null;
  const isGuildExpNoticeboard = position &&
    position.x === 32405 && position.y === 32175 && position.z === 7 &&
    thing.id === 1811;
  const readableContent = gameServer.world.creatureHandler.getReadableContent
    ? gameServer.world.creatureHandler.getReadableContent(thing)
    : null;

  return player.write(new ItemInformationPacket(
    thing,
    includeDetails,
    isGuildExpNoticeboard ? GuildExpRanking.getDescription() : null,
    readableContent
  ));

}

PacketHandler.prototype.__canReadPublicItemFromDistance = function (player, thing) {

  if (!player || !thing || !thing.getName || !thing.getPosition) {
    return false;
  }

  const name = String(thing.getName() || "").trim().toLowerCase();
  if (!PUBLIC_READABLE_ITEM_NAMES.has(name)) {
    return false;
  }

  const playerPosition = player.position;
  const thingPosition = thing.getPosition();
  if (!playerPosition || !thingPosition || playerPosition.z !== thingPosition.z) {
    return false;
  }

  return Math.max(
    Math.abs(playerPosition.x - thingPosition.x),
    Math.abs(playerPosition.y - thingPosition.y)
  ) <= PUBLIC_READ_DISTANCE;

}

PacketHandler.prototype.__getLookCreature = function (which) {
  if (!which || which.constructor.name !== "Tile") return null;

  let creature = which.getCreature();
  if (creature === null) return null;

  // A dead player remains attached to the server tile until the death window
  // is acknowledged. The corpse is already present by then, so Look must skip
  // the stale creature reference and resolve the clicked stack item instead.
  if (creature.isDead) return null;
  if (typeof creature.isZeroHealth === "function" && creature.isZeroHealth()) return null;
  return creature;
};

PacketHandler.prototype.handleContainerClose = function (player, containerId) {

  /*
   * Function PacketHandler.handleContainerClose
   * Handles an incoming request to close a container
   */

  let container = player.containerManager.getContainerFromId(containerId);

  if (container !== null) {
    return player.containerManager.closeContainer(container);
  }

}

PacketHandler.prototype.handleTargetCreature = function (player, id) {

  /*
   * Function PacketHandler.handleTargetCreature
   * Handles an incoming creature target packet
   */

  // Cancel target
  if (id === 0) {
    return player.actionHandler.targetHandler.setTarget(null);
  }

  let creature = gameServer.world.creatureHandler.getCreatureFromId(id);

  // No creature found
  if (creature === null) {
    return player.actionHandler.targetHandler.setTarget(null);
  }

  // Only monsters and other players are valid combat targets. NPCs and the
  // attacking player are never attackable.
  if (creature === player || (!creature.isMonster() && !creature.isPlayer())) {
    player.actionHandler.targetHandler.setTarget(null);
    return player.sendCancelMessage("You may not attack this creature.");
  }

  if (!player.canSee(creature.position)) {
    return player.actionHandler.targetHandler.setTarget(null);
  }

  if (!gameServer.world.combatHandler.canAttack(player, creature, true)) {
    return player.actionHandler.targetHandler.setTarget(null);
  }

  return player.actionHandler.targetHandler.setTarget(creature);

}

PacketHandler.prototype.handlePlayerSay = function (player, packet) {

  /*
   * Function PacketHandler.handlePlayerSay
   * When player says a message handle it
   */

  // Spell words mapping to spell IDs
  const SPELL_WORDS = {
    // Existing spells (IDs 0-9)
    "exana flam": 0,           // Cure Burning
    "exevo mas flam": 1,       // Explosion
    "exura": 2,                // Light Healing
    "utana vid": 3,            // Invisible
    "utevo res ina": 4,        // Creature Illusion (handled separately below)
    "utevo lux": 5,            // Light
    "exori mort": 6,           // Death Strike
    "exani tera": 7,           // Temple Teleport (Hearthstone)
    "utani hur": 8,            // Haste
    "exani hur": 9,            // Levitate
    // New healing spells
    "exura gran": 10,          // Intense Healing
    "exura vita": 11,          // Ultimate Healing
    "exana pox": 12,           // Antidote
    // New attack spells
    "exori vis": 13,           // Energy Strike
    "exori flam": 14,          // Flame Strike
    "exevo flam hur": 15,      // Fire Wave
    "exevo vis lux": 16,       // Energy Beam
    // New support spells
    "utani gran hur": 17,      // Strong Haste
    "utamo vita": 18,          // Magic Shield
    "utevo gran lux": 19       // Great Light
  };

  // Check if message is a spell
  let messageLower = packet.message.toLowerCase().trim();

  // Special handling for Creature Illusion (utevo res ina "monster")
  if (messageLower.startsWith("utevo res ina ")) {
    let monsterName = messageLower.substring(14).replace(/"/g, "").trim(); // Remove prefix and quotes
    let monster = gameServer.database.getMonsterByName(monsterName);

    if (monster) {
      // Cast Morph (ID 4) with the monster's look type
      // Monster outfit is in monster.data.creatureStatistics.outfit
      let look = (monster.data && monster.data.creatureStatistics) ? monster.data.creatureStatistics.outfit : null;
      let lookId = look ? look.id : CONST.LOOKTYPES.OTHER.GAMEMASTER;

      return player.spellbook.handleSpell(4, { id: lookId });
    } else {
      player.sendCancelMessage("A creature with that name does not exist.");
      return;
    }
  }

  if (SPELL_WORDS.hasOwnProperty(messageLower)) {
    let spellId = SPELL_WORDS[messageLower];

    // First, show the spell words as speech on screen and in chat (like real Tibia)
    // We access the speech handler directly to force the orange color for spells
    player.speechHandler.internalCreatureSay(packet.message, CONST.COLOR.ORANGE);

    // Then execute the spell
    return player.spellbook.handleSpell(spellId);
  }

  // Write to the appropriate channel identifier
  let channel = gameServer.world.channelManager.getChannel(packet.id);

  // The channel must exist
  if (channel !== null) {
    return channel.send(player, packet);
  }

}

PacketHandler.prototype.__moveItem = function (player, fromWhere, fromIndex, toWhere, toIndex, count) {

  /*
   * Function PacketHandler.__moveItem
   * Internal private function that moves one object from one place to another
   */

  // Remove the requested item and amount from the source
  let movedItem = fromWhere.removeIndex(fromIndex, count);

  // Cannot take the requested item and count
  if (movedItem === null) {
    return;
  }

  let existthing = null;
  if (toWhere.constructor.name === "Tile") {
    existthing = toWhere.getTopItem();
  }

  // Use smart placement for containers and depot (auto-stack and first empty slot)
  if (toWhere.constructor.name === "DepotContainer" || (toWhere.isContainer && toWhere.isContainer())) {
    // Use addThingSmart which handles stacking and empty slot logic
    let added = toWhere.addThingSmart(movedItem);
    if (!added) {
      // Failed to add - container might be full, return item to source
      fromWhere.addThing(movedItem, fromIndex);
      player.sendCancelMessage("There is not enough room.");
      return;
    }
  } else {
    // Add the taken item to the new target location (Tile, Equipment, etc.)
    toWhere.addThing(movedItem, toIndex);
  }

  if (toWhere.constructor.name === "Tile") {
    if (existthing === null) {
      toWhere.emit("add", player, movedItem);
    } else {
      existthing.emit("add", player, movedItem);
    }
  }

  // We have to check each players' adjacency after the container has been moved
  if (movedItem.constructor.name === "Container") {
    if (fromWhere.getTopParent() !== toWhere.getTopParent()) {
      movedItem.checkPlayersAdjacency();
    }
  }

  // Emit the move event for the item
  movedItem.emit("move", player, toWhere, movedItem);

}

PacketHandler.prototype.__addThingToTrashholder = function (fromItem, fromWhere, fromIndex, toWhere, count) {

  /*
   * Function PacketHandler.addThingToTrashholder
   * Adds an item to the trashholder and completely deletes it
   */

  // Send deletion magic
  gameServer.world.sendMagicEffect(toWhere.position, toWhere.getTrashEffect());

  // Make sure to clean up the item
  fromItem.cleanup();

  // Delete the item and count
  return fromWhere.removeIndex(fromIndex, count);

}

PacketHandler.prototype.writeText = function (player, packet) {

  /*
   * Function PacketHandler.writeText
   * Handles writing text to an item (labels, letters, books)
   */

  // Read the item ID and content from packet
  let itemId = packet.readUInt32();
  let content = packet.readString();

  // Find the item in player's inventory
  // The itemId is the server-side thing ID
  let item = player.containerManager.findItemById(itemId);

  if (item === null) {
    return player.sendCancelMessage("You cannot edit this item.");
  }

  // Check if item is writeable
  if (!item.isWriteable || !item.isWriteable()) {
    return player.sendCancelMessage("This item cannot be edited.");
  }

  // Set the content
  item.setContent(content);

  // Send confirmation message
  player.sendCancelMessage("Your text has been saved.");

}

PacketHandler.prototype.handleQuestLog = function (player, questId) {
  /*
   * Function PacketHandler.handleQuestLog
   * Handles request for quest log data
   */

  console.log("PacketHandler: handleQuestLog called for questId:", questId);

  const { QuestLogPacket, QuestLinePacket } = requireModule("network/protocol");

  if (questId === 0) {
    // Send Quest List
    let quests = gameServer.questManager.getQuestList(player);
    console.log("PacketHandler: Sending quest list with " + quests.length + " quests.");
    player.socketHandler.write(new QuestLogPacket(quests));
  } else {
    // Send Quest Missions
    let missions = gameServer.questManager.getQuestMissions(player, questId);
    console.log("PacketHandler: Sending quest missions for quest " + questId);
    if (missions.length > 0) {
      player.socketHandler.write(new QuestLinePacket(questId, missions));
    }
  }
}

module.exports = PacketHandler;
