module.exports = function useSewerGrate(player, tile, index, item) {

  // A player may use the grate immediately after stepping onto its SQM.
  // Keep the movement guard for grates used from a neighbouring tile.
  if (player.isMoving() && !player.getPosition().equals(tile.position)) {
    return true;
  }

  // Teleport the player and 
  process.gameServer.world.creatureHandler.teleportCreature(player, tile.position.down());
  player.movementHandler.__moveLock.lock(10);

  return true;

}
