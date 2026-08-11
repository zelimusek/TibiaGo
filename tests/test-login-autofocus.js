"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let focused = 0;
let opened = null;
const username = {
  focus() { focused++; }
};

const context = {
  console,
  document: {
    getElementById(id) {
      return id === "user-username" ? username : null;
    }
  }
};

vm.createContext(context);
const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "modals", "modal-manager.js"),
  "utf8"
);
vm.runInContext(source + "\nthis.ModalManager = ModalManager;", context);

const manager = Object.create(context.ModalManager.prototype);
manager.open = function (id) { opened = id; };
manager.__openLogin();

assert.strictEqual(opened, "floater-enter", "Enter Game should open the account modal");
assert.strictEqual(focused, 1, "the username field should receive focus immediately");

context.document.getElementById = function () { return null; };
assert.doesNotThrow(() => manager.__openLogin(), "missing login input should fail safely");

console.log("PASS: Enter Game opens the login modal with username focused.");
