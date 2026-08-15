"use strict";

const DJBoothAnimation = function (screen) {

  this.screen = screen;
  this.__ready = false;
  this.__failed = false;
  this.__failureReported = false;
  this.__storageKey = "partyzone-dj-animation-enabled";
  this.__enabled = this.__readEnabledState();
  this.__armTargets = Object.create(null);
  this.__wallSpeaker = typeof Item === "function" ? new Item(5090, 1) : null;
  this.__wallSpeakerFixtures = [
    { key: "lower-left", x: 32508, y: 32353, z: 7 },
    { key: "upper-left", x: 32508, y: 32339, z: 7 },
    { key: "upper-right", x: 32522, y: 32339, z: 7 },
    { key: "lower-right", x: 32522, y: 32353, z: 7 }
  ];
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

DJBoothAnimation.prototype.__drawWallSpeakerMount = function (context, mountX, mountY, angle) {

  context.save();
  context.translate(mountX, mountY);
  context.rotate(angle);

  // The bracket remains rigidly attached to the pillar while the speaker
  // cabinet mounted at its end is allowed to breathe with the bass.
  context.fillStyle = "#17191d";
  context.fillRect(-3, -4, 15, 8);
  context.fillStyle = "#454b54";
  context.fillRect(-2, -2, 13, 3);
  context.fillStyle = "#9da6af";
  context.fillRect(-3, -1, 3, 3);
  context.restore();

};

DJBoothAnimation.prototype.__drawWallSpeakers = function (context, disco, rhythm) {

  if (!this.__wallSpeaker || !this.screen || typeof this.screen.drawSprite !== "function") return 0;

  let centerPosition = gameClient.renderer.getStaticScreenPosition(
    new Position(disco.center.x, disco.center.y, disco.center.z)
  );
  let centerX = (centerPosition.x + 0.5) * 32;
  let centerY = (centerPosition.y + 0.5) * 32;
  let pulse = Math.max(0, Math.min(1, Number(rhythm.pulse) || 0));
  let strength = Number.isFinite(Number(rhythm.strength))
    ? Math.max(0, Math.min(1.5, Number(rhythm.strength)))
    : 1;
  let cabinetScale = 0.50 * (1 + pulse * (0.045 + strength * 0.018));

  this.__wallSpeakerFixtures.forEach(function (fixture) {
    let screenPosition = gameClient.renderer.getStaticScreenPosition(
      new Position(fixture.x, fixture.y, fixture.z)
    );

    // The coordinates supplied by the map editor identify the bottom-right
    // tile occupied by the diagonal pillar. Its sprite crosses the tile's
    // upper-left corner, so that corner is also the natural mounting point.
    let mountX = screenPosition.x * 32;
    let mountY = screenPosition.y * 32;
    let facingAngle = Math.atan2(centerY - mountY, centerX - mountX);
    let cabinetX = mountX + Math.cos(facingAngle) * 10;
    let cabinetY = mountY + Math.sin(facingAngle) * 10;
    let cabinetPosition = new Position(cabinetX / 32, cabinetY / 32, fixture.z);

    this.__drawWallSpeakerMount(context, mountX, mountY, facingAngle);

    context.save();
    context.imageSmoothingEnabled = false;
    context.translate(cabinetX, cabinetY);
    // The original cabinet faces south. Rotate that forward edge towards the
    // centre of the dance floor independently for every corner.
    context.rotate(facingAngle - Math.PI * 0.5);
    context.scale(cabinetScale, cabinetScale);
    context.translate(-cabinetX, -cabinetY);
    this.screen.drawSprite(this.__wallSpeaker, cabinetPosition, 32);
    context.restore();
  }, this);

  return this.__wallSpeakerFixtures.length;

};

DJBoothAnimation.prototype.__smoothArmTarget = function (key, desired, now) {

  let state = this.__armTargets[key];
  if (!state || now - state.time > 250 || now < state.time) {
    state = { x: desired.x, y: desired.y, time: now };
    this.__armTargets[key] = state;
    return { x: state.x, y: state.y };
  }

  let elapsed = Math.max(0, now - state.time);
  let amount = 1 - Math.exp(-elapsed / 115);
  state.x += (desired.x - state.x) * amount;
  state.y += (desired.y - state.y) * amount;
  state.time = now;
  return { x: state.x, y: state.y };

};

DJBoothAnimation.prototype.__drawArm = function (context, creature, target, colors, bend, shoulderOffset) {

  if (!creature || creature.getPosition().z !== 7) return;

  let anchor = gameClient.renderer.getCreatureScreenPosition(creature);
  shoulderOffset = shoulderOffset || { x: 12, y: 5 };
  let shoulder = {
    // Start on top of the south-facing outfit's real foreground hand. Keeping
    // this per-outfit offset near the upper-right arm prevents the animated
    // sleeve from appearing to grow out of the chest or stomach.
    x: Math.round(anchor.x * 32 + shoulderOffset.x),
    y: Math.round(anchor.y * 32 + shoulderOffset.y)
  };
  let upperArm = {
    // Trace the short arm segment already painted into outfit 128 before
    // bending towards a deck. This masks that static limb instead of leaving
    // it visible as a third arm whenever Hubertuse reaches for the mixer.
    x: Math.round(anchor.x * 32 + 19),
    y: Math.round(anchor.y * 32 + 7)
  };
  let cuff = {
    // Keep only the final fifth uncovered as the hand.
    x: Math.round(shoulder.x + (target.x - shoulder.x) * 0.82),
    y: Math.round(shoulder.y + (target.y - shoulder.y) * 0.82)
  };
  let deltaX = cuff.x - upperArm.x;
  let deltaY = cuff.y - upperArm.y;
  let length = Math.max(1, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
  let elbow = {
    x: Math.round(upperArm.x + deltaX * 0.48 - deltaY / length * bend),
    y: Math.round(upperArm.y + deltaY * 0.48 + deltaX / length * bend)
  };

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = colors.sleeveShadow;
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(shoulder.x, shoulder.y);
  context.lineTo(upperArm.x, upperArm.y);
  context.lineTo(elbow.x, elbow.y);
  context.lineTo(cuff.x, cuff.y);
  context.stroke();
  context.strokeStyle = colors.sleeve;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(shoulder.x, shoulder.y - 1);
  context.lineTo(upperArm.x, upperArm.y - 1);
  context.lineTo(elbow.x, elbow.y - 1);
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
  context.fillRect(target.x - 2, target.y - 2, 4, 4);
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
    // A small rightward bias places both decks closer to the DJs' real hands
    // and avoids long, trunk-like reaches across the booth.
    let x = Math.round(consolePosition.x * 32 + 6);
    // Tuck the booth farther under the DJs. Its front edge hides the bottom of
    // their original arms while the animated foreground arm stays very short.
    let y = Math.round(consolePosition.y * 32 - 24);
    let context = this.screen.context;
    let scratch = Math.sin(rhythm.phase * Math.PI * 2) * 2.5;
    let beat = Number.isFinite(rhythm.sequence)
      ? rhythm.sequence
      : Math.floor(now / Math.max(1, 60000 / rhythm.bpm));

    context.save();
    context.imageSmoothingEnabled = false;
    this.__drawWallSpeakers(context, disco, rhythm);
    context.drawImage(this.__image, x, y, 96, 40);
    this.__drawDeckMotion(context, x, y, rhythm);

    let thomas = this.__findDJ("DJ Thomas");
    let hubertuse = this.__findDJ("DJ Hubertuse");
    let thomasTarget = this.__smoothArmTarget("thomas", {
      x: 25 + scratch * 0.55,
      y: 17 + scratch
    }, now);
    this.__drawArm(context, thomas, {
      x: Math.round(x + thomasTarget.x),
      y: Math.round(y + thomasTarget.y)
    }, {
      sleeve: "#c92d31",
      sleeveShadow: "#65161b",
      skin: "#e2aa72",
      skinShadow: "#885438"
    }, -4, { x: 12, y: 5 });

    let hubertuseUsesMixer = beat % 4 === 3;
    let hubertuseTarget = this.__smoothArmTarget("hubertuse", hubertuseUsesMixer ? {
      x: 55 + scratch * 0.25,
      y: 19
    } : {
      x: 72 - scratch * 0.55,
      y: 17 - scratch
    }, now);
    this.__drawArm(context, hubertuse, {
      x: Math.round(x + hubertuseTarget.x),
      y: Math.round(y + hubertuseTarget.y)
    }, {
      sleeve: "#315bd1",
      sleeveShadow: "#172966",
      skin: "#e2aa72",
      skinShadow: "#885438"
    }, hubertuseUsesMixer ? 2 : 4, { x: 12, y: 5 });
    context.restore();
    return true;
  } catch (error) {
    this.__reportFailure(error);
    return false;
  }

};
