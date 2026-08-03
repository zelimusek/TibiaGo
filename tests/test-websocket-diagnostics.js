"use strict";

const assert = require("assert");
const EventEmitter = require("events");
require("../require");

const GameSocket = requireModule("network/gamesocket");

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this._socket = {
      id: 55,
      bytesWritten: 0,
      bytesRead: 0,
      remoteAddress: "127.0.0.1",
      remoteFamily: "IPv4",
      remotePort: 12345
    };
    this.terminated = false;
    this.closed = false;
    this.destroyed = false;
  }
  send() {}
  ping() {}
  terminate() { this.terminated = true; }
  close() { this.closed = true; }
}

const socket = new MockSocket();
const gameSocket = new GameSocket(socket, "111111", { address: "127.0.0.1" });

gameSocket.recordClientOpcode(37);
gameSocket.ping();
gameSocket.ping();

let diagnostic = gameSocket.getDisconnectDiagnostic();
assert.strictEqual(socket.terminated, true);
assert.strictEqual(diagnostic.lastClientOpcode, 37);
assert.strictEqual(diagnostic.initiated.reason, "ping-timeout");
assert.ok(Number.isInteger(diagnostic.lastPingAt));
assert.ok(Number.isInteger(diagnostic.lastPongAt));

const secondSocket = new MockSocket();
const secondGameSocket = new GameSocket(secondSocket, "111111", { address: "127.0.0.1" });
secondGameSocket.close("unknown-client-opcode", { opcode: 255 });
diagnostic = secondGameSocket.getDisconnectDiagnostic();
assert.strictEqual(secondSocket.closed, true);
assert.strictEqual(diagnostic.initiated.reason, "unknown-client-opcode");
assert.strictEqual(diagnostic.initiated.details.opcode, 255);

console.log("PASS: WebSocket diagnostics preserve ping timeouts and close reasons.");
