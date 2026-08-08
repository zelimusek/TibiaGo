"use strict";

const ServerLogger = requireModule("utils/logger");

const GameLoop = function(interval, callback) {

  /*
   * Class GameLoop
   * Wrapper for the main gameserver loop
   */

  this.__gameLoopStart = null;
  this.__gameLoopEnd = null;
  this.__loopTimeout = null

  // The loop counter
  this.__internalTickCounter = 0;

  // Callback function fired every loop tick at an interval
  this.__callback = callback;
  this.__interval = interval;
  this.__drift = 0;
  this.__lastTickStartedAt = null;
  this.__lastSchedulingDelay = 0;
  this.__maxSchedulingDelay = 0;
  this.__lastExecutionTime = 0;
  this.__maxExecutionTime = 0;
  this.__lastStallLogAt = 0;

  // The logger is attached to the game loop
  this.logger = new ServerLogger();

}

GameLoop.prototype.initialize = function() {

  /*
   * Function GameLoop.initialize
   * Delegates to the internal looping function
   */

  // Start the loop
  this.__internalLoop();

}

GameLoop.prototype.getCurrentFrame = function() {

  /*
   * Function GameLoop.getCurrentFrame
   * Returns the current game server frame from the event queue
   */

  return this.__internalTickCounter;

}

GameLoop.prototype.getDataDetails = function() {

  /*
   * Function WebsocketServer.getDataDetails
   * Gets the data details (received & sent) from the network manager
   */

  return new Object({
    "drift": this.__drift,
    "tick": this.__internalTickCounter,
    "lastSchedulingDelay": this.__lastSchedulingDelay,
    "maxSchedulingDelay": this.__maxSchedulingDelay,
    "lastExecutionTime": this.__lastExecutionTime,
    "maxExecutionTime": this.__maxExecutionTime,
  });

}

GameLoop.prototype.tickModulus = function(modulus) {

  /*
   * Function GameLoop.tickModulus
   * Only returns TRUE when the tick counter passes through the modulus parameter
   */

  return (this.getCurrentFrame() % modulus) === 0;

}

GameLoop.prototype.__estimateLoopDrift = function() {

  /*
   * Function GameLoop.__estimateLoopDrift
   * Estimates the gameLoop drift in miliseconds which is the quantity that describes how long the server slept since the previous tick
   */

  // Start of the new frame
  this.__gameLoopStart = Date.now();

  if (this.__lastTickStartedAt !== null) {
    this.__lastSchedulingDelay = Math.max(
      0,
      this.__gameLoopStart - this.__lastTickStartedAt - this.__interval
    );
    this.__maxSchedulingDelay = Math.max(
      this.__maxSchedulingDelay,
      this.__lastSchedulingDelay
    );
  }
  this.__lastTickStartedAt = this.__gameLoopStart;

  // Ignore drift on the first server tick
  if(this.__gameLoopEnd === null) {
    return 0;
  }

  // Estimate the setTimeout drift to keep the tick interval but drop frames if the drift becomes too large
  this.__drift = (this.__drift + (this.__gameLoopStart - this.__gameLoopEnd) - this.__interval) % -this.__interval;

}

GameLoop.prototype.__estimateNextTimeout = function() {

  /*
   * Function GameLoop.__estimateNextTimeout
   * This is the main looping function for the game server that is executed every server tick
   */

  this.__gameLoopEnd = Date.now();

  // Calculate the drift of the tick
  let gameLoopExecutionTime = (this.__gameLoopEnd - this.__gameLoopStart);
  this.__lastExecutionTime = gameLoopExecutionTime;
  this.__maxExecutionTime = Math.max(this.__maxExecutionTime, gameLoopExecutionTime);

  if ((this.__lastSchedulingDelay >= 100 || gameLoopExecutionTime >= 100)
      && this.__gameLoopEnd - this.__lastStallLogAt >= 5000) {
    this.__lastStallLogAt = this.__gameLoopEnd;
    let memory = process.memoryUsage();
    console.warn("[GAME LOOP STALL] " + JSON.stringify({
      tick: this.__internalTickCounter,
      schedulingDelayMs: this.__lastSchedulingDelay,
      executionMs: gameLoopExecutionTime,
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      externalMb: Math.round(memory.external / 1024 / 1024)
    }));
  }

  // Save to average the loop execution time for logging
  this.logger.__gameLoopExecutionTime += gameLoopExecutionTime;

  // Calculate the timeout for the next tick to keep as close as possible to the tick interval, including potential drift and execution
  return this.__interval - this.__drift - gameLoopExecutionTime;

}

GameLoop.prototype.__internalLoop = function() {

  /*
   * Function GameLoop.__internalLoop
   * This is the main looping function for the game server that is executed every server tick
   */

  // Increment the tick counter
  this.__internalTickCounter++

  // Server was closed: abort the loop
  if(process.gameServer.isClosed()) {
    return console.log("Game loop has been aborted.");
  }

  // Estimate the drift from the previous call
  this.__estimateLoopDrift();

  // The game server callback
  this.__callback();

  // Delegate to the logger every 20th frame
  if(this.tickModulus(CONFIG.LOGGING.INTERVAL)) {
    this.logger.log();
  }

  // Send a ping to all clients
  if(this.tickModulus(CONFIG.SERVER.PING_INTERVAL)) {
    gameServer.HTTPServer.websocketServer.socketHandler.ping();
  }

  // Schedule the next tick
  this.__loopTimeout = setTimeout(
    this.__internalLoop.bind(this),
    Math.min(this.__interval, this.__estimateNextTimeout())
  );

}

module.exports = GameLoop;
