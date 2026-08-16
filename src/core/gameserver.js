"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const Database = requireModule("core/database");
const Enum = requireModule("utils/enum");
const GameLoop = requireModule("core/gameloop");
const HTTPServer = requireModule("network/http-server");
const IPCSocket = requireModule("ipc/ipcsocket");
const QuestManager = requireModule("core/quest-manager");

const GameServer = function () {

  /*
   * Class GameServer
   *
   * Main container for the Tibia HTML5 Gameserver
   *
   * GameServer API:
   *
   * GameServer.initialize() - Returns true if the internal tick counter is a multiple of the passed modulus.
   * GameServer.loop() - Returns true if a player with a particular name is online
   *
   */

  // Signal interrupt received: gracefully shut down server
  process.on("SIGINT", this.scheduleShutdown.bind(this, CONFIG.SERVER.MS_SHUTDOWN_SCHEDULE));
  process.on("SIGTERM", this.scheduleShutdown.bind(this, CONFIG.SERVER.MS_SHUTDOWN_SCHEDULE));

  // Connect to the information database that keeps all the server data
  this.database = new Database();

  // Create the game loop with an interval and callback function
  this.gameLoop = new GameLoop(
    CONFIG.SERVER.MS_TICK_INTERVAL,
    this.__loop.bind(this)
  );

  // Open the server for HTTP connections
  this.HTTPServer = new HTTPServer(
    CONFIG.SERVER.HOST,
    CONFIG.SERVER.PORT
  );

  // The IPC socket for communicating with the server
  this.IPCSocket = new IPCSocket();

  // Quest Manager
  this.questManager = new QuestManager();

  // State variables to keep the current server status
  this.__serverStatus = null;
  this.__initialized = null;

}

// Game server status
GameServer.prototype.STATUS = new Enum(
  "OPEN",
  "OPENING",
  "CLOSING",
  "CLOSED"
);

GameServer.prototype.isShutdown = function () {

  /*
   * Function GameServer.isShutdown
   * Returns true if the status of the gameserver is closing
   */

  return this.__serverStatus === this.STATUS.CLOSING;

}

GameServer.prototype.initialize = function () {

  /*
   * Function GameServer.initialize
   * Initializes the game server and starts the internal game loop
   */

  // State variable to keep the current server status
  this.__serverStatus = this.STATUS.OPEN;

  // When the server was started
  this.__initialized = Date.now();

  // Database
  this.database.initialize();

  // Start the gameloop
  this.gameLoop.initialize();

  // Listen for incoming connections
  this.HTTPServer.listen();

}

GameServer.prototype.setServerStatus = function (serverStatus) {

  /*
   * Function GameServer.setServerStatus
   * Sets the server status to one the available server statuses
   */

  this.__serverStatus = serverStatus;

}

const { closeDatabase } = requireModule("db");

GameServer.prototype.shutdown = async function () {

  /*
   * Function GameServer.shutdown
   * Shuts down the game server and disconnects all clients
   */

  // Inform operator
  console.log("The game server is shutting down.");

  this.setServerStatus(this.STATUS.CLOSED);

  // Close the HTTP server
  this.HTTPServer.close();

  // Close IPC socket
  this.IPCSocket.close();

  // Wait for pending database operations (e.g. saving characters logic upon socket disconnect)
  console.log("Waiting for pending database operations...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Flush and close the shared database connection before terminating Node.
  // This is essential for embedded PGlite (WAL/checkpoint durability) and
  // lets a regular PostgreSQL pool finish in-flight writes cleanly.
  console.log("Closing the database connection...");
  try {
    await closeDatabase();
  } catch (error) {
    console.error("Could not close the database cleanly:", error);
    process.exitCode = 1;
  }

  console.log("Server shutdown complete.");
  process.exit(process.exitCode || 0);

}

GameServer.prototype.isFeatureEnabled = function () {

  /*
   * Function GameServer.isFeatureEnabled
   * Implement different version features here..
   */

  CONFIG.SERVER.CLIENT_VERSION > 1000;

}

GameServer.prototype.scheduleShutdown = function (seconds) {

  /*
   * Function GameServer.scheduleShutdown
   * Schedules the server to shutdown in a configured time
   */

  // The server is already shutting down
  if (this.__serverStatus === this.STATUS.CLOSING) {
    return console.log("Shutdown command refused because the server is already shutting down.");
  }

  // Update the server status
  this.setServerStatus(this.STATUS.CLOSING);

  // Write to all connected sockets
  this.world.broadcastMessage("The gameserver is closing in %s seconds. Please log out in a safe place.".format(Math.floor(1E-3 * seconds)));

  // Use the timeout function not the event queue
  setTimeout(this.shutdown.bind(this), seconds);

}

GameServer.prototype.__spawnReplacementProcess = function () {

  /*
   * Starts a detached helper which waits until the current process has
   * completed its graceful shutdown and then launches the same entry point.
   * Keeping the wait in another process prevents the restart from dying with
   * this Node.js instance.
   */

  let workingDirectory = process.cwd();
  let entryPoint = path.resolve(
    process.argv[1] || path.join(workingDirectory, "server-production.js")
  );
  let logDirectory = path.join(workingDirectory, "logs");
  let logFile = path.join(logDirectory, "server.log");
  let pidFile = path.join(workingDirectory, ".server-production.pid");

  fs.mkdirSync(logDirectory, { recursive: true });

  let helperSource = [
    '"use strict";',
    'const childProcess = require("child_process");',
    'const fs = require("fs");',
    "const entryPoint = " + JSON.stringify(entryPoint) + ";",
    "const workingDirectory = " + JSON.stringify(workingDirectory) + ";",
    "const pidFile = " + JSON.stringify(pidFile) + ";",
    "setTimeout(function () {",
    "  const server = childProcess.spawn(process.execPath, [entryPoint], {",
    "    cwd: workingDirectory,",
    "    detached: true,",
    '    stdio: "inherit",',
    "    env: process.env",
    "  });",
    '  fs.writeFileSync(pidFile, String(server.pid), "utf8");',
    "  server.unref();",
    "}, 5000);"
  ].join("\n");

  let logDescriptor = fs.openSync(logFile, "a");
  let helper;

  try {
    helper = childProcess.spawn(process.execPath, ["-e", helperSource], {
      cwd: workingDirectory,
      detached: true,
      stdio: ["ignore", logDescriptor, logDescriptor],
      env: process.env
    });
  } finally {
    fs.closeSync(logDescriptor);
  }

  helper.once("error", function (error) {
    console.error("The restart helper failed:", error);
  });
  helper.unref();

  return helper.pid;

}

GameServer.prototype.restart = function () {

  /*
   * Launches the replacement helper before beginning the normal graceful
   * shutdown. Websocket disconnects save every connected character, and the
   * replacement waits longer than that shutdown grace period.
   */

  try {
    let helperPid = this.__spawnReplacementProcess();
    console.log("Restart helper started with PID %s.".format(helperPid));
  } catch (error) {
    console.error("Could not schedule the replacement server:", error);
    this.setServerStatus(this.STATUS.OPEN);
    this.world.broadcastMessage(
      "The gameserver restart was cancelled because the replacement process could not be started."
    );
    return false;
  }

  this.shutdown();
  return true;

}

GameServer.prototype.scheduleRestart = function (milliseconds) {

  /*
   * Schedules a graceful restart. The delay is expressed in milliseconds to
   * match scheduleShutdown and the existing server configuration.
   */

  if (this.__serverStatus === this.STATUS.CLOSING) {
    console.log("Restart command refused because the server is already shutting down.");
    return false;
  }

  this.setServerStatus(this.STATUS.CLOSING);

  this.world.broadcastMessage(
    "The gameserver is restarting in %s seconds. Please log out in a safe place."
      .format(Math.ceil(milliseconds / 1000))
  );

  setTimeout(this.restart.bind(this), milliseconds);
  return true;

}

GameServer.prototype.__loop = function () {

  /*
   * Function GameServer.__loop
   * Callback function fired every time a server tick happens
   */

  // Handle the input / output buffers for all connected clients
  this.HTTPServer.websocketServer.socketHandler.flushSocketBuffers();

  // Complete a tick in the world
  this.world.tick();

}

GameServer.prototype.isClosed = function () {

  /*
   * Function GameServer.isClosed
   * Returns true if the status of the gameserver is closed
   */

  return this.__serverStatus === this.STATUS.CLOSED;

}

GameServer.prototype.__handleUncaughtException = function (error, origin) {

  /*
   * Function GameServer.__handleUncaughtException
   * Handles an uncaught exception in the server
   */

  // Shut the server down
  this.shutdown();

}

module.exports = GameServer;
