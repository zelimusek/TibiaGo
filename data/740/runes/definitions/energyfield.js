const Position = requireModule("utils/position");

module.exports = function greatFireball(source, target) {

  /*
   * function suddenDeath
   * Code that handles the sudden death rune
   */

  // Get circle position for the GFB
  process.gameServer.world.sendDistanceEffect(source.position, target.position, CONST.EFFECT.PROJECTILE.ENERGY);
  let field = process.gameServer.database.createThing(1495);
  field.fieldOwner = source;
  if (target.addTopThing(field) !== true) {
    return false;
  }

  target.players.forEach(function(creature) {
    target.itemStack.applyFieldDamage(creature, source);
  });
  target.monsters.forEach(function(creature) {
    target.itemStack.applyFieldDamage(creature, source);
  });

  return true;

}
