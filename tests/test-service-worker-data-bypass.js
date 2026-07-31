"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const handlers = {};
let networkFetches = 0;
let cacheLookups = 0;
let responsePromise = null;
let activationPromise = null;
let claimCalls = 0;

const context = vm.createContext({
  URL,
  Promise,
  fetch(request) {
    networkFetches++;
    return Promise.resolve({ ok: true, request });
  },
  caches: {
    match() {
      cacheLookups++;
      return Promise.resolve(null);
    },
    open() {
      return Promise.resolve({
        addAll() {},
        put() {},
      });
    },
    keys() {
      return Promise.resolve([]);
    },
    delete() {
      return Promise.resolve(true);
    },
  },
  self: {
    location: { origin: "https://tibiago.cyrk.fun" },
    clients: {
      claim() {
        claimCalls++;
        return Promise.resolve();
      },
    },
    skipWaiting() {},
    addEventListener(name, callback) {
      handlers[name] = callback;
    },
  },
});

const workerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "service-worker.js"),
  "utf8"
);
vm.runInContext(workerSource, context, { filename: "client/service-worker.js" });

handlers.activate({
  waitUntil(promise) {
    activationPromise = promise;
  },
});

handlers.fetch({
  request: {
    method: "GET",
    mode: "cors",
    url: "https://tibiago.cyrk.fun/data/760/Tibia.spr?v=fresh",
  },
  respondWith(promise) {
    responsePromise = promise;
  },
});

assert(responsePromise, "The Service Worker must answer the asset request.");

Promise.all([responsePromise, activationPromise]).then(function () {
  assert.strictEqual(networkFetches, 1);
  assert.strictEqual(
    cacheLookups,
    0,
    "Tibia data must go straight to the network instead of Cache Storage."
  );
  assert.strictEqual(claimCalls, 1);
  assert.doesNotMatch(
    workerSource,
    /client\.navigate\(/,
    "The worker must not race the HTML controllerchange reload."
  );
  console.log("PASS: Service Worker claims once and bypasses Cache Storage for Tibia data.");
}).catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
