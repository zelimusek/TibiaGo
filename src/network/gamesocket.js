"use strict";

const PacketBuffer = requireModule("network/packet-buffer");
const PacketReader = requireModule("network/packet-reader");

const {
  LatencyPacket,
  ServerErrorPacket,
  PlayerLoginPacket,
  WorldTimePacket,
  PlayerStatePacket,
  ServerStatePacket,
  PlayerInfoPacket,
  ContainerAddPacket
} = requireModule("network/protocol");

const GameSocket = function (socket, account, connectionDetails) {

  /*
   * Class GameSocket
   * Wrapper for a websocket that is connected to the gameserver
   */

  // Wrap the websocket
  this.socket = socket;
  this.account = account;
  connectionDetails = connectionDetails || {};

  // Each websocket should reference a player in the gameworld
  this.player = null;
  this.__controller = false;

  // Keep the address
  this.__address = connectionDetails.address || this.getAddress().address;
  this.__countryCode = connectionDetails.countryCode || null;

  // Time of initial connection
  this.__connected = Date.now();

  // State variable to kick inactive sockets that no longer respond
  this.__alive = true;
  this.__lastPingAt = null;
  this.__lastPongAt = Date.now();
  this.__lastClientOpcode = null;
  this.__disconnectDiagnostic = null;

  // Per-connection transport diagnostics. These counters intentionally live
  // on GameSocket so two clients connected from the same browser/machine can
  // still be compared independently.
  this.__transportDiagnostic = {
    sequence: 0,
    framesSent: 0,
    bytesSent: 0,
    pendingSends: new Map(),
    lastFlushAt: null,
    lastFlushGapMs: 0,
    maxFlushGapMs: 0,
    lastQueueAgeMs: 0,
    maxQueueAgeMs: 0,
    lastCallbackMs: 0,
    maxCallbackMs: 0,
    lastWsBufferedAmount: 0,
    maxWsBufferedAmount: 0,
    lastTcpWritableLength: 0,
    maxTcpWritableLength: 0,
    lastLoggedAt: Object.create(null)
  };

  // Buffer incoming & outgoing messages are read and send once per server tick
  this.incomingBuffer = new PacketBuffer();
  this.outgoingBuffer = new PacketBuffer();

  // Attach the socket listeners
  this.socket.on("message", this.__handleSocketData.bind(this));
  this.socket.on("error", this.__handleSocketError.bind(this));
  this.socket.on("pong", this.__handlePong.bind(this));

}

GameSocket.prototype.getBytesWritten = function () {

  /*
   * Function WebsocketServer.getSocketDetails
   * Returns sent and received bytes for a socket
   */

  return this.socket._socket.bytesWritten;

}

GameSocket.prototype.getBytesRead = function () {

  /*
   * Function WebsocketServer.getSocketDetails
   * Returns sent and received bytes for a socket
   */

  return this.socket._socket.bytesRead;

}

GameSocket.prototype.__handleSocketError = function (error) {

  /*
   * Function WebsocketServer.__handleSocketError
   * Delegates to the close socket handler
   */

  this.close("socket-error", {
    message: error && error.message ? error.message : String(error || "Unknown WebSocket error")
  });

}

GameSocket.prototype.__handlePong = function (gameSocket) {

  /*
   * Function GameSocket.__handlePong
   * Updates the state for the ping/pong
   */

  this.__alive = true;
  this.__lastPongAt = Date.now();

}

GameSocket.prototype.isController = function () {

  /*
   * Function GameSocket.isController
   * Returns true if the game socket is controlling the player 
   */

  // This is possible
  if (this.player === null) {
    return false;
  }

  return this === this.player.socketHandler.getController();

}

GameSocket.prototype.getLastPacketReceived = function () {

  /*
   * Function GameSocket.getLastPacketReceived
   * Returns the timestamp of when the latest packet was received 
   */

  return this.incomingBuffer.__lastPacketReceived;

}

GameSocket.prototype.writeLatencyPacket = function () {

  /*
   * Function GameSocket.writeLatencyPacket
   * Latency requests are not subject to buffering: go to the socket
   */

  this.socket.send(new LatencyPacket().getBuffer());

}

GameSocket.prototype.isAlive = function () {

  /*
   * Function GameSocket.isAlive
   * Returns true if the gamesocket is still alive and responds to the ping-pong game
   */

  return this.__alive;

}

GameSocket.prototype.ping = function () {

  /*
   * Function GameSocket.ping
   * Requests a pong from the gamesocket
   */

  // Not alive from previous ping: bye bye
  if (!this.isAlive()) {
    return this.terminate("ping-timeout", {
      lastPingAt: this.__lastPingAt,
      lastPongAt: this.__lastPongAt
    });
  }

  // Set to not being alive: will be set to alive after receiving the pong
  this.__alive = false;

  // Send a ping
  this.__lastPingAt = Date.now();
  this.socket.ping();

}

GameSocket.prototype.id = function () {

  return this.socket._socket.id;

}

GameSocket.prototype.getAddress = function () {

  /*
   * Function GameSocket.getAddress
   * Returns IPV4,6 address parameters from the wrapped socket
   */

  let socket = this.socket._socket;
  return {
    address: socket.remoteAddress || (socket.address && socket.address().address) || "",
    family: socket.remoteFamily || (socket.address && socket.address().family) || "",
    port: socket.remotePort || 0
  };

}


GameSocket.prototype.serializeWorld = function (chunk) {

  /*
   * Function GameSocket.serializeWorld
   * Serializes the visible world chunks around the spectated player
   */

  // Serializes the visible neighbours
  chunk.neighbours.forEach(chunk => chunk.serialize(this));

}

GameSocket.prototype.writeWorldState = function (player) {

  /*
   * Function GameSocket.writeWorldState
   * Writes the spectator login packets to the gameSocket for a particular player that describes the state of the game world
   */

  // Write the required server data to the client
  this.write(new ServerStatePacket());

  // Write the friend list
  //player.friendlist.writeFriendList(gameSocket);

  // Serialize the game world on request
  this.serializeWorld(player.getChunk());

  this.write(new PlayerStatePacket(player));

  this.write(new WorldTimePacket(gameServer.world.clock.getTime()));

  // Inform everyone of the new player
  gameServer.world.broadcastPacket(new PlayerLoginPacket(player.getProperty(CONST.PROPERTIES.NAME)));

  // Write the player spells
  player.spellbook.writeSpells(this);

}

GameSocket.prototype.attachPlayerController = function (player) {

  /*
   * Function Player.attachPlayerController
   * Attaches a gamesocket controller to the player that is allowed to control the player
   */

  // Set state that this gamesocket is a controller
  this.__controller = true;

  // Attach a controller
  player.attachController(this);

}

GameSocket.prototype.__isLatencyRequest = function (buffer) {

  /*
   * Function WebsocketServer.__isLatencyRequest
   * Returns true if the message is a latency request
   */

  return buffer.length === 1 && buffer[0] === CONST.PROTOCOL.CLIENT.LATENCY;

}

GameSocket.prototype.__handleSocketData = function (buffer) {

  /*
   * Function GameSocket.__handleSocketData
   * Handles incoming socket data
   */

  // Array buffer was not received
  if (!Buffer.isBuffer(buffer)) {
    return this.close("non-binary-client-packet", {
      receivedType: buffer === null ? "null" : typeof buffer
    });
  }

  // If latency request do not buffer: immediately write the response
  if (this.__isLatencyRequest(buffer)) {
    return this.writeLatencyPacket();
  }

  // Only player controllers may interact with the server
  if (!this.isController()) {
    return;
  }

  // Buffer the incoming message. The buffers are read once per server tick
  this.incomingBuffer.add(buffer);

}

GameSocket.prototype.closeError = function (message, diagnosticReason, diagnosticDetails) {

  /*
   * Function GameSocket.closeError
   * Closes the game socket with a particular error
   */

  this.socket.send(new ServerErrorPacket(message).getBuffer());

  // Gracefully close
  let details = Object.assign({ message: message }, diagnosticDetails || {});
  this.close(diagnosticReason || "server-error", details);

}

GameSocket.prototype.write = function (packet) {

  /*
   * Function GameSocket.write
   * Writes a message to the outgoing buffer
   */

  // Exceeds the maximum size: disconnect the game socket for safety
  if (packet.overflow()) {
    return this.closeError("Internal server error: game packet overflow.", "outgoing-packet-overflow", {
      packetType: packet && packet.constructor ? packet.constructor.name : "UnknownPacket"
    });
  }

  // Add it
  this.outgoingBuffer.add(packet.getBuffer());

}

GameSocket.prototype.recordClientOpcode = function (opcode) {

  this.__lastClientOpcode = opcode;

}

GameSocket.prototype.__setDisconnectDiagnostic = function (reason, details) {

  if (!reason) {
    return;
  }

  this.__disconnectDiagnostic = {
    reason: reason,
    details: details || null,
    timestamp: Date.now()
  };

}

GameSocket.prototype.getDisconnectDiagnostic = function () {

  return {
    connectedAt: this.__connected,
    lastClientOpcode: this.__lastClientOpcode,
    lastPingAt: this.__lastPingAt,
    lastPongAt: this.__lastPongAt,
    alive: this.__alive,
    initiated: this.__disconnectDiagnostic
  };

}

GameSocket.prototype.__readTransportBuffers = function () {

  let websocket = this.socket;
  let tcpSocket = websocket && websocket._socket ? websocket._socket : null;
  return {
    wsBufferedAmount: websocket && Number.isFinite(websocket.bufferedAmount)
      ? websocket.bufferedAmount
      : 0,
    tcpWritableLength: tcpSocket && Number.isFinite(tcpSocket.writableLength)
      ? tcpSocket.writableLength
      : 0,
    tcpBufferSize: tcpSocket && Number.isFinite(tcpSocket.bufferSize)
      ? tcpSocket.bufferSize
      : 0,
    readyState: websocket && Number.isFinite(websocket.readyState)
      ? websocket.readyState
      : null
  };

}

GameSocket.prototype.__getTransportIdentity = function () {

  let name = null;
  try {
    name = this.player ? this.player.getProperty(CONST.PROPERTIES.NAME) : null;
  } catch (error) {
    name = null;
  }

  return {
    character: name,
    socketId: this.id(),
    connectedForMs: Math.max(0, Date.now() - this.__connected),
    address: this.__address
  };

}

GameSocket.prototype.__logTransportAnomaly = function (reason, details) {

  let now = Date.now();
  let lastLoggedAt = this.__transportDiagnostic.lastLoggedAt[reason] || 0;
  if (now - lastLoggedAt < 5000) {
    return;
  }
  this.__transportDiagnostic.lastLoggedAt[reason] = now;

  let loop = typeof gameServer !== "undefined"
    && gameServer.gameLoop
    && gameServer.gameLoop.getDataDetails
    ? gameServer.gameLoop.getDataDetails()
    : null;
  console.warn("[WS FLOW DIAGNOSTIC] " + JSON.stringify(Object.assign(
    {},
    this.__getTransportIdentity(),
    { reason: reason, serverLoop: loop },
    details || {}
  )));

}

GameSocket.prototype.beginOutgoingFlush = function (queue) {

  let diagnostic = this.__transportDiagnostic;
  let now = Date.now();
  let buffers = this.__readTransportBuffers();
  let sequence = ++diagnostic.sequence;
  let gap = diagnostic.lastFlushAt === null ? 0 : Math.max(0, now - diagnostic.lastFlushAt);

  diagnostic.framesSent++;
  diagnostic.bytesSent += Number(queue.bytes) || 0;
  diagnostic.lastFlushAt = now;
  diagnostic.lastFlushGapMs = gap;
  diagnostic.maxFlushGapMs = Math.max(diagnostic.maxFlushGapMs, gap);
  diagnostic.lastQueueAgeMs = Number(queue.ageMs) || 0;
  diagnostic.maxQueueAgeMs = Math.max(diagnostic.maxQueueAgeMs, diagnostic.lastQueueAgeMs);
  diagnostic.lastWsBufferedAmount = buffers.wsBufferedAmount;
  diagnostic.maxWsBufferedAmount = Math.max(diagnostic.maxWsBufferedAmount, buffers.wsBufferedAmount);
  diagnostic.lastTcpWritableLength = buffers.tcpWritableLength;
  diagnostic.maxTcpWritableLength = Math.max(diagnostic.maxTcpWritableLength, buffers.tcpWritableLength);
  diagnostic.pendingSends.set(sequence, {
    sequence: sequence,
    startedAt: now,
    packets: Number(queue.packets) || 0,
    bytes: Number(queue.bytes) || 0,
    queueAgeMs: Number(queue.ageMs) || 0,
    bufferedBefore: buffers
  });

  if (diagnostic.lastQueueAgeMs >= 150) {
    this.__logTransportAnomaly("server-outgoing-queue-delay", {
      sequence: sequence,
      packets: Number(queue.packets) || 0,
      bytes: Number(queue.bytes) || 0,
      queueAgeMs: diagnostic.lastQueueAgeMs,
      buffers: buffers
    });
  }

  return sequence;

}

GameSocket.prototype.completeOutgoingFlush = function (sequence, error) {

  let diagnostic = this.__transportDiagnostic;
  let pending = diagnostic.pendingSends.get(sequence);
  if (!pending) {
    return;
  }

  diagnostic.pendingSends.delete(sequence);
  let callbackMs = Math.max(0, Date.now() - pending.startedAt);
  let buffers = this.__readTransportBuffers();
  diagnostic.lastCallbackMs = callbackMs;
  diagnostic.maxCallbackMs = Math.max(diagnostic.maxCallbackMs, callbackMs);
  diagnostic.lastWsBufferedAmount = buffers.wsBufferedAmount;
  diagnostic.maxWsBufferedAmount = Math.max(diagnostic.maxWsBufferedAmount, buffers.wsBufferedAmount);
  diagnostic.lastTcpWritableLength = buffers.tcpWritableLength;
  diagnostic.maxTcpWritableLength = Math.max(diagnostic.maxTcpWritableLength, buffers.tcpWritableLength);

  if (error || callbackMs >= 200 || buffers.wsBufferedAmount >= 65536 || buffers.tcpWritableLength >= 65536) {
    this.__logTransportAnomaly(error ? "server-websocket-send-error" : "server-websocket-send-delay", {
      sequence: sequence,
      packets: pending.packets,
      bytes: pending.bytes,
      queueAgeMs: pending.queueAgeMs,
      callbackMs: callbackMs,
      pendingSends: diagnostic.pendingSends.size,
      bufferedBefore: pending.bufferedBefore,
      bufferedAfter: buffers,
      error: error && error.message ? error.message : error ? String(error) : null
    });
  }

}

GameSocket.prototype.inspectTransportHealth = function () {

  let diagnostic = this.__transportDiagnostic;
  let now = Date.now();
  // WebSocket send callbacks are completed in order, just like the frames.
  // Map preserves insertion order, so the first entry is the oldest without
  // scanning a potentially growing queue on every 50 ms server tick.
  let oldest = diagnostic.pendingSends.values().next().value || null;

  if (oldest === null || now - oldest.startedAt < 300) {
    return;
  }

  this.__logTransportAnomaly("server-websocket-send-pending", {
    sequence: oldest.sequence,
    pendingForMs: now - oldest.startedAt,
    pendingSends: diagnostic.pendingSends.size,
    packets: oldest.packets,
    bytes: oldest.bytes,
    queueAgeMs: oldest.queueAgeMs,
    buffers: this.__readTransportBuffers()
  });

}

GameSocket.prototype.getTransportDiagnostic = function () {

  let diagnostic = this.__transportDiagnostic;
  let now = Date.now();
  let oldest = diagnostic.pendingSends.values().next().value || null;
  let oldestPendingMs = oldest ? Math.max(0, now - oldest.startedAt) : 0;

  return {
    sequence: diagnostic.sequence,
    framesSent: diagnostic.framesSent,
    bytesSent: diagnostic.bytesSent,
    pendingSends: diagnostic.pendingSends.size,
    oldestPendingMs: oldestPendingMs,
    lastFlushGapMs: diagnostic.lastFlushGapMs,
    maxFlushGapMs: diagnostic.maxFlushGapMs,
    lastQueueAgeMs: diagnostic.lastQueueAgeMs,
    maxQueueAgeMs: diagnostic.maxQueueAgeMs,
    lastCallbackMs: diagnostic.lastCallbackMs,
    maxCallbackMs: diagnostic.maxCallbackMs,
    buffers: this.__readTransportBuffers()
  };

}

GameSocket.prototype.terminate = function (reason, details) {

  /*
   * Function GameSocket.terminate
   * Terminates the websocket
   */

  this.__setDisconnectDiagnostic(reason || "server-terminate", details);
  this.socket.terminate();

}

GameSocket.prototype.close = function (reason, details) {

  /*
   * Function GameSocket.close
   * Closes the websocket
   */

  this.__setDisconnectDiagnostic(reason || "server-close", details);
  this.socket.close();

}

module.exports = GameSocket;
