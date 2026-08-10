"use strict";

const fs = require("fs");
const path = require("path");

const RegistrationPolicy = function (options) {
  options = options || {};
  this.__settingsPath = options.settingsPath === false
    ? null
    : (options.settingsPath || getDataFile("registration-settings.json"));
  this.__enabled = this.__load();
};

RegistrationPolicy.prototype.__load = function () {
  if (this.__settingsPath === null || !fs.existsSync(this.__settingsPath)) {
    return true;
  }

  try {
    const stored = JSON.parse(fs.readFileSync(this.__settingsPath, "utf8"));
    return typeof stored.enabled === "boolean" ? stored.enabled : true;
  } catch (error) {
    console.error("Could not load registration settings:", error.message);
    return true;
  }
};

RegistrationPolicy.prototype.__save = function (enabled) {
  if (this.__settingsPath === null) return true;

  const temporaryPath = this.__settingsPath + ".tmp";
  try {
    fs.mkdirSync(path.dirname(this.__settingsPath), { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify({ enabled }, null, 2) + "\n", "utf8");
    fs.renameSync(temporaryPath, this.__settingsPath);
    return true;
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      // The temporary file may not have been created.
    }
    console.error("Could not save registration settings:", error.message);
    return false;
  }
};

RegistrationPolicy.prototype.isEnabled = function () {
  return this.__enabled === true;
};

RegistrationPolicy.prototype.setEnabled = function (enabled) {
  enabled = enabled === true;
  if (!this.__save(enabled)) {
    return { ok: false, message: "Could not save the registration setting." };
  }

  this.__enabled = enabled;
  return {
    ok: true,
    message: "Account registration is now " + (enabled ? "enabled." : "disabled."),
  };
};

RegistrationPolicy.prototype.getStatus = function () {
  return "Account registration is " + (this.isEnabled() ? "enabled." : "disabled.");
};

module.exports = RegistrationPolicy;
