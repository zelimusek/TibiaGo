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
      remotePort: 12345,
      writableLength: 0,
      bufferSize: 0
    };
    this.bufferedAmount = 0;
    this.readyState = 1;
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

const transportSocket = new MockSocket();
transportSocket.bufferedAmount = 2048;
transportSocket._socket.writableLength = 1024;
const transportGameSocket = new GameSocket(transportSocket, "111111", { address: "127.0.0.1" });
transportGameSocket.outgoingBuffer.add(Buffer.from([1, 2, 3]));
const queue = transportGameSocket.outgoingBuffer.getDiagnostics();
const sequence = transportGameSocket.beginOutgoingFlush(queue);
let transport = transportGameSocket.getTransportDiagnostic();
assert.strictEqual(sequence, 1);
assert.strictEqual(transport.framesSent, 1);
assert.strictEqual(transport.bytesSent, 3);
assert.strictEqual(transport.pendingSends, 1);
assert.strictEqual(transport.buffers.wsBufferedAmount, 2048);
assert.strictEqual(transport.buffers.tcpWritableLength, 1024);
transportGameSocket.completeOutgoingFlush(sequence, null);
transport = transportGameSocket.getTransportDiagnostic();
assert.strictEqual(transport.pendingSends, 0);
assert.strictEqual(transport.sequence, 1);

console.log("PASS: WebSocket diagnostics preserve ping timeouts and close reasons.");
