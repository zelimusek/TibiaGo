const GenericLock = requireModule("utils/generic-lock");
const { ServerMessagePacket } = requireModule("network/protocol");

const PlayerIdleHandler = function(player) {

  /*
   * Class PlayerIdleHandler
   * Handles idle behavior of player and informs and kicks them after a set number of seconds
   */

  // Lock for informing and kicking the player
  this.__informLock = new GenericLock();
  this.__kickLock = new GenericLock();

  // When these locks run out apply these callback functions
  this.__informLock.on("unlock", this.__warnPlayer.bind(this, player));
  this.__kickLock.on("unlock", this.__kickPlayer.bind(this, player));

  // Start them locked
  this.extend();

}

PlayerIdleHandler.prototype.extend = function() {

  /*
   * PlayerIdleHandler.extend
   * Call this function to reset and extend the idle handler
   */

  // Lock or extend the inform and kick locks
  this.__informLock.lockSeconds(CONFIG.WORLD.IDLE.WARN_SECONDS);
  this.__kickLock.lockSeconds(CONFIG.WORLD.IDLE.WARN_SECONDS + CONFIG.WORLD.IDLE.KICK_SECONDS);

}

PlayerIdleHandler.prototype.__warnPlayer = function(player) {

  /*
   * PlayerIdleHandler.__warnPlayer
   * Warns the player they have been idle and are about to be disconnected from the game 
   */

  // A no-logout tile is also an idle-logout safe zone. Do not even send the
  // warning there, because the scheduled kick is ignored for the same reason.
  if(player.isInNoLogoutZone()) {
    return;
  }

  let warning = "You have been idle for %s seconds and will be disconnected after %s seconds.".format(CONFIG.WORLD.IDLE.WARN_SECONDS, CONFIG.WORLD.IDLE.KICK_SECONDS);

  player.write(new ServerMessagePacket(warning));

}

PlayerIdleHandler.prototype.__kickPlayer = function(player) {

  /*
   * PlayerIdleHandler.__kickPlayer
   * Disconnects an idle player unless their current tile forbids logout
   */

  if(player.isInNoLogoutZone()) {
    return;
  }

  player.disconnect();

}

PlayerIdleHandler.prototype.cleanup = function() {

  /*
   * Function PlayerIdleHandler.cleanup
   * Cleans up the remaining idle functions
   */

  // Cancelling the events is enough
  this.__informLock.cancel();
  this.__kickLock.cancel();

}

module.exports = PlayerIdleHandler;
