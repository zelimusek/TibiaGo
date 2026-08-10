"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

require("../require");

const RegistrationPolicy = requireModule("auth/registration-policy");
const LoginServer = requireModule("auth/login-server");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "partyzone-registration-"));
const settingsPath = path.join(temporaryRoot, "registration-settings.json");

try {
  let policy = new RegistrationPolicy({ settingsPath });
  assert.strictEqual(policy.isEnabled(), true, "Registration should default to enabled.");
  assert.strictEqual(policy.setEnabled(false).ok, true);
  assert.strictEqual(policy.isEnabled(), false);

  policy = new RegistrationPolicy({ settingsPath });
  assert.strictEqual(policy.isEnabled(), false, "Disabled state should survive a restart.");
  assert.strictEqual(policy.setEnabled(true).ok, true);

  policy = new RegistrationPolicy({ settingsPath });
  assert.strictEqual(policy.isEnabled(), true, "Enabled state should survive a restart.");

  const networkSource = fs.readFileSync(
    path.join(__dirname, "../client/src/network/network-manager.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server-production.js"), "utf8");
  const loginSource = fs.readFileSync(path.join(__dirname, "../src/auth/login-server.js"), "utf8");
  const clientBootstrapSource = fs.readFileSync(
    path.join(__dirname, "../client/src/core/index.js"),
    "utf8"
  );
  assert.match(networkSource, /case 403:[^\n]*registration is currently closed/i);
  assert.match(networkSource, /fetch\("\/api\/registration"/);
  assert.match(serverSource, /pathname === "\/api\/registration"/);
  assert.match(loginSource, /if \(!this\.registrationPolicy\.isEnabled\(\)\)/);
  assert.match(clientBootstrapSource, /username\.value = ""/);
  assert.match(clientBootstrapSource, /password\.value = ""/);
  assert.match(clientBootstrapSource, /antiAliasing\.checked = true/);

  const loginServer = Object.create(LoginServer.prototype);
  loginServer.registrationPolicy = { isEnabled: () => false };
  let ended = false;
  const response = {
    statusCode: 200,
    end() { ended = true; },
  };
  loginServer.__createAccount({}, response);
  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(ended, true, "Closed registration should end before touching the database.");

  console.log("PASS: registration policy persists and is enforced by server and client.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
