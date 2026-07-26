const Position = requireModule("utils/position");

module.exports = function greatFireball(source, target) {

  /*
   * function suddenDeath
   * Code that handles the sudden death rune
   */

  // Get circle position for the GFB
  process.gameServer.world.sendDistanceEffect(source.position, target.position, CONST.EFFECT.PROJECTILE.FIRE);
  // Use the normal three-stage fire field so it expires instead of remaining
  // permanently on the map.
  target.addTopThing(process.gameServer.database.createThing(1492));

  // Casting directly under a creature should affect it immediately.
  target.creatures.forEach(function(creature) {
    target.itemStack.applyFieldDamage(creature);
  });

  return true;

}
