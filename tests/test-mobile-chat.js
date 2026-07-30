"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    classes,
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
    toggle(name, enabled) {
      if (typeof enabled === "boolean") {
        enabled ? classes.add(name) : classes.delete(name);
        return enabled;
      }

      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }

      classes.add(name);
      return true;
    },
  };
}

const chatContainer = { classList: createClassList() };
const mobileToolbar = {
  classList: createClassList(),
  attributes: {},
  styles: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  style: {
    setProperty(name, value, priority) {
      mobileToolbar.styles[name] = { value, priority };
    },
  },
};
const expandButton = {
  innerHTML: "",
  title: "",
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
};
const lockCalls = [];
let unlockCalls = 0;

const context = vm.createContext({
  console,
  navigator: {
    maxTouchPoints: 0,
    vibrate() {},
  },
  document: {
    getElementById(id) {
      return id === "chat-lock-resize" ? expandButton : null;
    },
    querySelector(selector) {
      if (selector === "#game-wrapper .main .lower") {
        return chatContainer;
      }
      if (selector === "#game-wrapper .main .lower .wrapper-header") {
        return mobileToolbar;
      }
      assert.fail("Unexpected selector: " + selector);
    },
  },
  window: {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
  },
  gameClient: {
    interface: {
      channelManager: {
        unlockInputForTouch() {
          unlockCalls++;
        },
        setInputLocked(value) {
          lockCalls.push(value);
        },
      },
    },
  },
});

const touchFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "input",
  "touch.js"
);
vm.runInContext(
  fs.readFileSync(touchFile, "utf8") + "\nthis.Touch = Touch;",
  context,
  { filename: touchFile }
);

const touch = Object.create(context.Touch.prototype);
touch.chatExpandBtn = expandButton;
const touchEvent = {
  preventDefault() {},
  stopPropagation() {},
};

touch.__handleChatButton(touchEvent);
assert.strictEqual(
  mobileToolbar.attributes["data-mobile-chat-ready"],
  "true",
  "Opening chat must prepare the proven desktop channel toolbar for mobile."
);
assert.deepStrictEqual(mobileToolbar.styles.display, {
  value: "flex",
  priority: "important",
});
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-active"),
  true,
  "The mobile chat button should open the chat."
);
assert.strictEqual(
  unlockCalls,
  0,
  "Opening mobile chat should not summon the keyboard before the composer is tapped."
);
assert.deepStrictEqual(lockCalls, [true]);

touch.__handleChatExpandButton(touchEvent);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-expanded"),
  true,
  "The expand button should enlarge the mobile chat."
);
assert.strictEqual(expandButton.innerHTML, "unfold_less");

const increments = [];
context.gameClient.interface.channelManager.handleChannelIncrement = (value) => {
  increments.push(value);
};
touch.__handleMobileChannelIncrement(-1, touchEvent);
touch.__handleMobileChannelIncrement(1, touchEvent);
assert.deepStrictEqual(increments, [-1, 1]);

touch.__handleChatButton(touchEvent);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-active"),
  false,
  "The mobile chat button should close an open chat."
);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-expanded"),
  false,
  "Closing chat should reset its expanded state."
);
assert.deepStrictEqual(lockCalls, [true, true]);

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);
assert.match(html, /id="chat-lock-resize"/);
assert.match(html, /id="left-channel"/);
assert.match(html, /id="right-channel"/);
assert.match(html, /id="cheader"/);
assert.doesNotMatch(html, /id="mobile-chat-header"/);

const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "mobile.css"),
  "utf8"
);
assert.match(css, /\.mobile-chat-active\.mobile-chat-expanded/);
assert.match(css, /min-height:\s*92px/);
assert.match(css, /#game-wrapper\s+\.main\s+\.lower\.mobile-chat-active[\s\S]*?max-height:\s*none\s*!important/);
assert.match(css, /#game-wrapper\s+\.main\s+\.lower\s+\.wrapper-header\s*\{\s*display:\s*flex/);
assert.match(css, /#game-wrapper\s+\.main\s+\.lower\s+\.chat-header/);
assert.match(css, /#game-wrapper\s+\.main\s+\.lower\s+#chat-lock-resize/);
assert.match(css, /\.mobile-chat-keyboard-open/);
assert.match(css, /\.mobile-chat-keyboard-open\s+\.wrapper-header/);
assert.match(css, /\.mobile-chat-active:focus-within/);
assert.match(css, /z-index:\s*10002\s*!important/);
assert.match(css, /font-size:\s*16px\s*!important/);

const channelManagerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "utils", "channel-manager.js"),
  "utf8"
);
assert.doesNotMatch(channelManagerSource, /__updateMobileChannelLabel/);

const touchSource = fs.readFileSync(touchFile, "utf8");
assert.match(touchSource, /document\.getElementById\('chat-lock-resize'\)/);
assert.match(touchSource, /document\.getElementById\('left-channel'\)/);
assert.match(touchSource, /document\.getElementById\('right-channel'\)/);
assert.match(touchSource, /__prepareMobileChat/);
assert.match(touchSource, /__bindMobileChatViewport/);
assert.match(touchSource, /window\.visualViewport/);
assert.match(touchSource, /mobile-status-bar/);
assert.match(touchSource, /style\.setProperty\('display', 'flex', 'important'\)/);
assert.doesNotMatch(touchSource, /__ensureMobileChatHeader/);

const serviceWorkerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "service-worker.js"),
  "utf8"
);
assert.match(serviceWorkerSource, /tibiago-static-v17/);
assert.match(serviceWorkerSource, /client\.navigate\(target\.href\)/);
assert.match(
  serviceWorkerSource,
  /requestUrl\.pathname\.startsWith\("\/data\/"\)/,
  "Large game assets must bypass Service Worker Cache Storage."
);
assert.match(html, /interactive-widget=resizes-content/);
assert.match(html, /enterkeyhint="send"/);
assert.match(html, /mobile\.css\?v=20260730\.6/);
assert.match(html, /screen-element\.css\?v=20260729\.4/);
assert.match(html, /launcher\.js\?v=20260730\.6/);
assert.match(html, /service-worker\.js\?v=17/);

const launcherSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "launcher.js"),
  "utf8"
);
assert.match(launcherSource, /CLIENT_BUILD\s*=\s*"20260730\.6"/);
assert.match(launcherSource, /encodeURIComponent\(CLIENT_BUILD\)/);

console.log("PASS: mobile chat input, sizing and channel controls work by touch.");
