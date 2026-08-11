"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let feedback = { innerHTML: "" };
let actions = { style: { display: "none" } };
let focusCount = 0;
let selectCount = 0;
let password = {
  focus() { focusCount++; },
  select() { selectCount++; }
};
let transitions = [];

function Modal() {}
Modal.prototype = {};

const modalManager = {
  close() { transitions.push("close"); },
  open(id) { transitions.push("open:" + id); }
};

const context = {
  console,
  Modal,
  document: {
    getElementById(id) {
      if (id === "serve-feedback") return feedback;
      if (id === "user-password") return password;
      return null;
    }
  },
  gameClient: {
    interface: { modalManager }
  }
};

vm.createContext(context);
const textModalSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "modals", "modal-text.js"),
  "utf8"
);
vm.runInContext(textModalSource + "\nthis.TextModal = TextModal;", context);

const textModal = Object.create(context.TextModal.prototype);
textModal.__confirmActions = actions;
textModal.__returnToLogin = false;
textModal.__focusElementId = null;

textModal.handleOpen("Connecting to Gameworld...");
assert.strictEqual(actions.style.display, "none", "progress messages must not become dismissible");
assert.strictEqual(textModal.handleConfirm(), true);

textModal.handleOpen({
  message: "The account number or password is incorrect.",
  dismissible: true,
  returnToLogin: true,
  focusElementId: "user-password"
});
assert.strictEqual(feedback.innerHTML, "The account number or password is incorrect.");
assert.strictEqual(actions.style.display, "", "authentication errors need a touch-friendly OK button");
assert.strictEqual(textModal.handleConfirm(), false);
assert.deepStrictEqual(transitions, ["close", "open:floater-enter"]);
assert.strictEqual(focusCount, 1, "the password field should regain focus");
assert.strictEqual(selectCount, 1, "the wrong password should be selected for replacement");

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);
assert.ok(html.includes('id="login-feedback-ok"'), "the login feedback modal needs an OK button");

const modalManagerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "modals", "modal-manager.js"),
  "utf8"
);
vm.runInContext(modalManagerSource + "\nthis.ModalManager = ModalManager;", context);

let keyboardCloseCount = 0;
const keyboardManager = Object.create(context.ModalManager.prototype);
keyboardManager.close = function () { keyboardCloseCount++; };
keyboardManager.__openedModal = {
  handleConfirm() { return false; }
};
keyboardManager.handleConfirm();
assert.strictEqual(keyboardCloseCount, 0, "Enter must not close a replacement or rejected modal");

console.log("PASS: authentication errors can be dismissed and retried by touch.");
