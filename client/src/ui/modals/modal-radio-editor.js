const RadioEditorModal = function (element) {

  /*
   * GM editor for an internet-radio zone centered on the current player tile.
   */

  Modal.call(this, element);

  this.__url = document.getElementById("radio-editor-url");
  this.__radius = document.getElementById("radio-editor-radius");
  this.__fadeRadius = document.getElementById("radio-editor-fade-radius");
  this.__effects = document.getElementById("radio-editor-effects");
  this.__effectStyles = Array.from(document.querySelectorAll("input[name='radio-effect-style']"));
  this.__effectInterval = document.getElementById("radio-editor-effect-interval");
  this.__effectIntensity = document.getElementById("radio-editor-effect-intensity");
  this.__rhythmMode = document.getElementById("radio-editor-rhythm-mode");
  this.__beatBpm = document.getElementById("radio-editor-beat-bpm");
  this.__beatBpmLabel = document.getElementById("radio-editor-beat-bpm-label");
  this.__bassSensitivity = document.getElementById("radio-editor-bass-sensitivity");
  this.__bassSensitivityValue = document.getElementById("radio-editor-bass-sensitivity-value");
  this.__rhythmStatus = document.getElementById("radio-editor-rhythm-status");
  this.__weather = document.getElementById("radio-editor-weather");
  this.__light = document.getElementById("radio-editor-light");
  this.__spotlights = document.getElementById("radio-editor-spotlights");
  this.__legacyLasers = document.getElementById("radio-editor-legacy-lasers");
  this.__discoIntensity = document.getElementById("radio-editor-disco-intensity");
  this.__spotlightSpeed = document.getElementById("radio-editor-spotlight-speed");
  this.__spotlightSpeedValue = document.getElementById("radio-editor-spotlight-speed-value");
  this.__spotlightSpeed.oninput = this.__updateSpotlightSpeedValue.bind(this);
  this.__rhythmMode.onchange = this.__updateRhythmControls.bind(this);
  this.__beatBpm.oninput = this.__updateRhythmStatus.bind(this, true);
  this.__bassSensitivity.oninput = this.__updateRhythmControls.bind(this);
  this.__lastRhythmStatusAt = 0;

}

RadioEditorModal.prototype = Object.create(Modal.prototype);
RadioEditorModal.prototype.constructor = RadioEditorModal;

RadioEditorModal.prototype.__updateSpotlightSpeedValue = function () {
  let value = Number(this.__spotlightSpeed.value);
  this.__spotlightSpeedValue.innerText = value === 0 ? "Static" : value + "%";
}

RadioEditorModal.prototype.__updateRhythmControls = function () {
  let sensitivity = Number(this.__bassSensitivity.value);
  this.__bassSensitivityValue.innerText = Math.round(sensitivity) + "%";
  this.__beatBpmLabel.innerText = this.__rhythmMode.value === "fixed"
    ? "Fixed BPM"
    : "Fallback BPM";
  this.__bassSensitivity.disabled = this.__rhythmMode.value === "fixed";
  this.__updateRhythmStatus(true);
}

RadioEditorModal.prototype.__updateRhythmStatus = function (force) {
  let now = performance.now();
  if (force !== true && now - this.__lastRhythmStatusAt < 250) return;
  this.__lastRhythmStatusAt = now;

  let soundManager = gameClient.interface && gameClient.interface.soundManager;
  if (!soundManager || typeof soundManager.getRadioRhythm !== "function") {
    this.__rhythmStatus.innerText = "Rhythm unavailable";
    return;
  }

  let rhythm = soundManager.getRadioRhythm(
    Number(this.__beatBpm.value),
    now,
    { mode: this.__rhythmMode.value }
  );
  let label = rhythm.source === "bass"
    ? "Bass detected"
    : rhythm.source === "fixed"
      ? "Fixed rhythm"
      : rhythm.analyserAvailable
        ? "Listening · fallback"
        : "Fallback rhythm";
  this.__rhythmStatus.innerText = label + " · " + Math.round(rhythm.bpm) + " BPM";
  this.__rhythmStatus.dataset.source = rhythm.source;
}

RadioEditorModal.prototype.handleOpen = function (config) {

  config = config || {};
  this.__url.value = config.url || "";
  this.__radius.value = Number.isInteger(config.radius) ? config.radius : 4;
  this.__fadeRadius.value = Number.isInteger(config.fadeRadius) ? config.fadeRadius : 5;
  this.__effects.checked = config.effectsEnabled !== false;
  let effectStyles = Array.isArray(config.effectStyles) && config.effectStyles.length > 0
    ? config.effectStyles
    : ["disco"];
  this.__effectStyles.forEach(function (element) {
    element.checked = effectStyles.indexOf(element.value) !== -1;
  });
  this.__effectInterval.value = Number.isFinite(config.effectInterval) ? config.effectInterval : 2;
  this.__effectIntensity.value = Number.isInteger(config.effectIntensity) ? config.effectIntensity : 3;
  this.__rhythmMode.value = config.rhythmMode === "fixed" ? "fixed" : "auto";
  this.__beatBpm.value = Number.isInteger(config.beatBpm) ? config.beatBpm : 0;
  this.__bassSensitivity.value = Number.isInteger(config.bassSensitivity) ? config.bassSensitivity : 50;
  this.__weather.value = config.weather || "none";
  this.__light.value = config.light || "none";
  this.__spotlights.checked = config.spotlightsEnabled === true;
  this.__legacyLasers.checked = config.legacyLasersEnabled === true;
  this.__discoIntensity.value = Number.isInteger(config.discoCanvasIntensity) ? config.discoCanvasIntensity : 60;
  this.__spotlightSpeed.value = Number.isInteger(config.spotlightSpeed) && config.spotlightSpeed >= 0 && config.spotlightSpeed <= 250 ? config.spotlightSpeed : 100;
  this.__updateSpotlightSpeedValue();
  this.__updateRhythmControls();

  setTimeout(function () {
    this.__url.focus();
  }.bind(this), 0);

}

RadioEditorModal.prototype.handleConfirm = function () {

  let url = this.__url.value.trim();
  let radius = Number(this.__radius.value);
  let fadeRadius = Number(this.__fadeRadius.value);
  let effectsEnabled = this.__effects.checked ? 1 : 0;
  let effectStyles = this.__effectStyles
    .filter(function (element) { return element.checked; })
    .map(function (element) { return element.value; });
  let effectInterval = Number(this.__effectInterval.value);
  let effectIntensity = Number(this.__effectIntensity.value);
  let rhythmMode = this.__rhythmMode.value;
  let beatBpm = Number(this.__beatBpm.value);
  let bassSensitivity = Number(this.__bassSensitivity.value);
  let weather = this.__weather.value;
  let light = this.__light.value;
  let spotlightsEnabled = this.__spotlights.checked ? 1 : 0;
  let legacyLasersEnabled = this.__legacyLasers.checked ? 1 : 0;
  let discoCanvasIntensity = Number(this.__discoIntensity.value);
  let spotlightSpeed = Number(this.__spotlightSpeed.value);

  try {
    let parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch (error) {
    gameClient.interface.setCancelMessage("Enter a valid http:// or https:// radio URL.");
    return false;
  }

  if (!Number.isInteger(radius) || radius < 0 || radius > 50) {
    gameClient.interface.setCancelMessage("Radius must be a whole number from 0 to 50.");
    return false;
  }

  if (!Number.isInteger(fadeRadius) || fadeRadius < 0 || fadeRadius > 50) {
    gameClient.interface.setCancelMessage("Radius Effect must be a whole number from 0 to 50.");
    return false;
  }

  if (!Number.isFinite(effectInterval) || effectInterval < 0.5 || effectInterval > 30) {
    gameClient.interface.setCancelMessage("Effect frequency must be from 0.5 to 30 seconds.");
    return false;
  }

  if (!Number.isInteger(effectIntensity) || effectIntensity < 1 || effectIntensity > 12) {
    gameClient.interface.setCancelMessage("Effect intensity must be a whole number from 1 to 12.");
    return false;
  }

  if (effectStyles.length === 0) {
    gameClient.interface.setCancelMessage("Select at least one effect style.");
    return false;
  }

  if (!Number.isInteger(beatBpm) || (beatBpm !== 0 && (beatBpm < 40 || beatBpm > 240))) {
    gameClient.interface.setCancelMessage("Beat BPM must be 0 or a whole number from 40 to 240.");
    return false;
  }

  if (["auto", "fixed"].indexOf(rhythmMode) === -1) {
    gameClient.interface.setCancelMessage("Choose Auto bass or Fixed BPM rhythm mode.");
    return false;
  }

  if (!Number.isInteger(bassSensitivity) || bassSensitivity < 1 || bassSensitivity > 100) {
    gameClient.interface.setCancelMessage("Bass sensitivity must be a whole number from 1 to 100.");
    return false;
  }

  if (!Number.isInteger(discoCanvasIntensity) || discoCanvasIntensity < 10 || discoCanvasIntensity > 100) {
    gameClient.interface.setCancelMessage("Club effect intensity must be a whole number from 10 to 100.");
    return false;
  }

  if (!Number.isInteger(spotlightSpeed) || spotlightSpeed < 0 || spotlightSpeed > 250 || spotlightSpeed % 5 !== 0) {
    gameClient.interface.setCancelMessage("Spotlight speed must be from 0% to 250% in steps of 5%.");
    return false;
  }

  // Commands are handled by the server in the Default channel and are not
  // echoed to chat, so saving stays an in-game GM action.
  gameClient.send(new ChannelMessagePacket(
    CONST.CHANNEL.DEFAULT,
    1,
    "/radio set %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s".format(url, radius, fadeRadius, effectsEnabled, effectStyles.join(","), effectInterval, effectIntensity, beatBpm, weather, light, spotlightsEnabled, legacyLasersEnabled, discoCanvasIntensity, spotlightSpeed, rhythmMode, bassSensitivity)
  ));

  return true;

}

RadioEditorModal.prototype.handleRender = function () {
  this.__updateRhythmStatus(false);
}
