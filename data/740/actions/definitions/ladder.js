module.exports = function useLadder(player, tile, index, item) {

  // A player may use the ladder immediately after stepping onto its SQM.
  // Keep the movement guard for ladders used from a neighbouring tile.
  if (player.isMoving() && !player.getPosition().equals(tile.position)) {
    return true;
  }

  let attempts = new Array(tile.position.ladder(), tile.position.ladderNorth());

  for (let attempt of attempts) {

    let attemptTile = process.gameServer.world.getTileFromWorldPosition(attempt);

    if (!player.isTileOccupied(attemptTile)) {
      process.gameServer.world.creatureHandler.teleportCreature(player, attempt);
      player.movementHandler.__moveLock.lock(10);
      return true;
    }

  }

  return true;

}
