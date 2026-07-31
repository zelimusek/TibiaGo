const Position = requireModule("utils/position");

module.exports = function magicWall(source, target) {

  /*
   * function magicWall
   * Code that handles the magic wall rune
   */

  // Get circle position for the GFB
  process.gameServer.world.sendDistanceEffect(source.position, target.position, CONST.EFFECT.PROJECTILE.ENERGY);

  let tile = process.gameServer.world.getTileFromWorldPosition(target.position);
  if (tile) {
    let wall = process.gameServer.database.createThing(1498);
    wall.fieldOwner = source;
    if (tile.addTopThing(wall) !== true) return false;
  }

  return true;

}
