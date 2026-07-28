"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const button = { hidden: true };
const bodyClasses = new Set();

const documentMock = {
  fullscreenElement: null,
  webkitFullscreenElement: null,
  mozFullScreenElement: null,
  msFullscreenElement: null,
  body: {
    classList: {
      contains(name) {
        return bodyClasses.has(name);
      },
    },
  },
  getElementById(id) {
    return id === "restore-fullscreen" ? button : null;
  },
};

const context = vm.createContext({
  console,
  document: documentMock,
  window: {},
});

const interfaceFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "ui",
  "interface.js"
);

vm.runInContext(
  fs.readFileSync(interfaceFile, "utf8") + "\nthis.Interface = Interface;",
  context,
  { filename: interfaceFile }
);

const gameInterface = Object.create(context.Interface.prototype);
gameInterface.__fullScreenPreferred = true;

gameInterface.__updateFullScreenRestoreButton();
assert.strictEqual(
  button.hidden,
  true,
  "The button must stay hidden on the login screen."
);

bodyClasses.add("game-active");
gameInterface.__updateFullScreenRestoreButton();
assert.strictEqual(
  button.hidden,
  false,
  "Leaving fullscreen during an active game must reveal the recovery button."
);

documentMock.fullscreenElement = {};
gameInterface.__updateFullScreenRestoreButton();
assert.strictEqual(button.hidden, true);

documentMock.fullscreenElement = null;
gameInterface.__updateFullScreenRestoreButton();
assert.strictEqual(button.hidden, false);

gameInterface.__fullScreenPreferred = false;
gameInterface.__updateFullScreenRestoreButton();
assert.strictEqual(
  button.hidden,
  true,
  "A session that did not request fullscreen must not be prompted."
);

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "new.css"),
  "utf8"
);

assert.match(html, /id="restore-fullscreen"[^>]*hidden/);
assert.match(css, /#restore-fullscreen\[hidden\]/);

console.log(
  "PASS: fullscreen recovery appears only when an active fullscreen game is interrupted."
);
