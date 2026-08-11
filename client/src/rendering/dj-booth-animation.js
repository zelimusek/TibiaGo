"use strict";

const DJBoothAnimation = function (screen) {

  this.screen = screen;
  this.__ready = false;
  this.__failed = false;
  this.__failureReported = false;
  this.__storageKey = "partyzone-dj-animation-enabled";
  this.__enabled = this.__readEnabledState();
  this.__image = new Image();
  this.__image.onload = function () {
    this.__ready = true;
  }.bind(this);
  this.__image.onerror = function () {
    this.__failed = true;
    this.__reportFailure(new Error("Could not load the DJ console sprite."));
  }.bind(this);
  this.__image.src = "/png/dj-booth/console.png";

  // Emergency client-local fallback. It survives refreshes and never affects
  // the NPCs, radio stream, map or other PartyZone canvas effects.
  window.partyZoneDjAnimation = {
    enable: this.setEnabled.bind(this, true),
    disable: this.setEnabled.bind(this, false),
    status: function () { return this.__enabled && !this.__failed; }.bind(this)
  };

};

DJBoothAnimation.prototype.__readEnabledState = function () {

  let query = new URLSearchParams(window.location.search).get("djAnimation");
  if (query === "off" || query === "0" || query === "false") {
    return false;
  }

  try {
    return window.localStorage.getItem(this.__storageKey) !== "false";
  } catch (error) {
    return true;
  }

};

DJBoothAnimation.prototype.setEnabled = function (enabled) {

  this.__enabled = enabled === true;
  try {
    window.localStorage.setItem(this.__storageKey, this.__enabled ? "true" : "false");
  } catch (error) {
    // Storage may be unavailable in a private browser. The in-memory switch
    // still provides a safe fallback for the current session.
  }
  return this.__enabled;

};

DJBoothAnimation.prototype.__reportFailure = function (error) {

  if (this.__failureReported) return;
  this.__failureReported = true;
  this.__failed = true;
  console.warn("PartyZone DJ animation disabled:", error);
  if (window.tibiaDiagnostics) {
    window.tibiaDiagnostics.record("dj-booth-animation-error", {
      message: error && error.message ? String(error.message) : String(error),
      stack: error && error.stack ? String(error.stack).slice(0, 3000) : ""
    }, true);
  }

};

DJBoothAnimation.prototype.__isPartyZone = function (disco) {

  let center = disco && disco.center;
  return this.__enabled
    && this.__ready
    && !this.__failed
    && center
    && center.x === 32515
    && center.y === 32346
    && center.z === 7
    && gameClient.player
    && gameClient.player.getPosition().z === center.z;

};

DJBoothAnimation.prototype.__findDJ = function (name) {

  let wanted = String(name).toLowerCase();
  let creatures = gameClient.world ? Object.values(gameClient.world.activeCreatures) : [];
  return creatures.find(function (creature) {
    return creature && String(creature.name || "").toLowerCase() === wanted;
  }) || null;

};

DJBoothAnimation.prototype.__getRhythm = function (disco, now) {

  let soundManager = gameClient.interface && gameClient.interface.soundManager;
  if (soundManager && typeof soundManager.getRadioRhythm === "function") {
    return soundManager.getRadioRhythm(disco.beatBpm, now);
  }

  let bpm = Number(disco.beatBpm);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) bpm = 140;
  let beatDuration = 60000 / bpm;
  let phase = (now % beatDuration) / beatDuration;
  return {
    bpm: bpm,
    phase: phase,
    pulse: Math.max(0, Math.sin(phase * Math.PI * 2)),
    sequence: Math.floor(now / beatDuration)
  };

};

DJBoothAnimation.prototype.__drawDeckMotion = function (context, x, y, rhythm) {

  let angle = rhythm.phase * Math.PI * 2;
  let pulse = Math.max(0, Math.min(1, Number(rhythm.pulse) || 0));

  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 0.62 + pulse * 0.28;
  context.fillStyle = "#ff4bd8";
  context.fillRect(Math.round(x + 25 + Math.cos(angle) * 8), Math.round(y + 20 + Math.sin(angle) * 8), 2, 2);
  context.fillStyle = "#43e8ff";
  context.fillRect(Math.round(x + 72 + Math.cos(-angle) * 8), Math.round(y + 20 + Math.sin(-angle) * 8), 2, 2);

  let meterHeight = 3 + Math.round(pulse * 8);
  context.fillStyle = pulse > 0.72 ? "#ffb329" : "#41e6ff";
  context.fillRect(x + 47, y + 23 - meterHeight, 2, meterHeight);
  context.fillStyle = "#ff4bd8";
  context.fillRect(x + 51, y + 23 - Math.max(2, meterHeight - 2), 2, Math.max(2, meterHeight - 2));
  context.restore();

};

DJBoothAnimation.prototype.__drawArm = function (context, creature, target, colors, sway) {

  if (!creature || creature.getPosition().z !== 7) return;

  let anchor = gameClient.renderer.getCreatureScreenPosition(creature);
  let shoulder = {
    // Start at the lower/front part of the outfit. The booth overlaps this
    // point, making the short extra limb read as the DJ's foreground arm.
    x: Math.round(anchor.x * 32 + 15),
    y: Math.round(anchor.y * 32 + 15)
  };
  let cuff = {
    // Keep almost the whole reach covered by the coloured sleeve. Only the
    // final quarter is skin, avoiding the long third-arm/trunk appearance.
    x: Math.round(shoulder.x + (target.x - shoulder.x) * 0.74 + sway * 0.08),
    y: Math.round(shoulder.y + (target.y - shoulder.y) * 0.74)
  };

  context.save();
  context.lineCap = "square";
  context.lineJoin = "miter";
  context.strokeStyle = colors.sleeveShadow;
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(shoulder.x, shoulder.y);
  context.lineTo(cuff.x, cuff.y);
  context.stroke();
  context.strokeStyle = colors.sleeve;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(shoulder.x, shoulder.y - 1);
  context.lineTo(cuff.x, cuff.y - 1);
  context.stroke();
  context.strokeStyle = colors.skinShadow;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(cuff.x, cuff.y);
  context.lineTo(target.x, target.y);
  context.stroke();
  context.strokeStyle = colors.skin;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(cuff.x, cuff.y - 1);
  context.lineTo(target.x, target.y - 1);
  context.stroke();
  context.fillStyle = colors.skin;
  context.fillRect(target.x - 2, target.y - 2, 5, 4);
  context.restore();

};

DJBoothAnimation.prototype.draw = function (disco) {

  if (!this.__isPartyZone(disco)) return false;

  try {
    let now = performance.now();
    let rhythm = this.__getRhythm(disco, now);
    let consolePosition = gameClient.renderer.getStaticScreenPosition(
      new Position(disco.center.x - 1, disco.center.y - 8, disco.center.z)
    );
    let x = Math.round(consolePosition.x * 32);
    // Pull the booth half a tile towards the DJs. Besides shortening their
    // reach, this lets its front edge naturally cover the bottom of outfits.
    let y = Math.round(consolePosition.y * 32 - 16);
    let context = this.screen.context;
    let scratch = Math.sin(rhythm.phase * Math.PI * 2) * 4;
    let beat = Number.isFinite(rhythm.sequence)
      ? rhythm.sequence
      : Math.floor(now / Math.max(1, 60000 / rhythm.bpm));

    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(this.__image, x, y, 96, 40);
    this.__drawDeckMotion(context, x, y, rhythm);

    let thomas = this.__findDJ("DJ Thomas");
    let hubertuse = this.__findDJ("DJ Hubertuse");
    this.__drawArm(context, thomas, {
      x: Math.round(x + 25 + scratch * 0.45),
      y: Math.round(y + 20 + scratch)
    }, {
      sleeve: "#c92d31",
      sleeveShadow: "#65161b",
      skin: "#e2aa72",
      skinShadow: "#885438"
    }, scratch);

    let hubertuseUsesMixer = beat % 4 === 3;
    this.__drawArm(context, hubertuse, hubertuseUsesMixer ? {
      x: Math.round(x + 49 + scratch * 0.75),
      y: y + 28
    } : {
      x: Math.round(x + 72 - scratch * 0.45),
      y: Math.round(y + 20 - scratch)
    }, {
      sleeve: "#315bd1",
      sleeveShadow: "#172966",
      skin: "#e2aa72",
      skinShadow: "#885438"
    }, -scratch);
    context.restore();
    return true;
  } catch (error) {
    this.__reportFailure(error);
    return false;
  }

};
