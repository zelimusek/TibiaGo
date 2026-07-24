const RadioEditorModal = function (element) {

  /*
   * GM editor for an internet-radio zone centered on the current player tile.
   */

  Modal.call(this, element);

  this.__url = document.getElementById("radio-editor-url");
  this.__radius = document.getElementById("radio-editor-radius");
  this.__fadeRadius = document.getElementById("radio-editor-fade-radius");
  this.__effects = document.getElementById("radio-editor-effects");
  this.__effectStyle = document.getElementById("radio-editor-effect-style");
  this.__effectInterval = document.getElementById("radio-editor-effect-interval");
  this.__effectIntensity = document.getElementById("radio-editor-effect-intensity");
  this.__beatBpm = document.getElementById("radio-editor-beat-bpm");

}

RadioEditorModal.prototype = Object.create(Modal.prototype);
RadioEditorModal.prototype.constructor = RadioEditorModal;

RadioEditorModal.prototype.handleOpen = function (config) {

  config = config || {};
  this.__url.value = config.url || "";
  this.__radius.value = Number.isInteger(config.radius) ? config.radius : 4;
  this.__fadeRadius.value = Number.isInteger(config.fadeRadius) ? config.fadeRadius : 5;
  this.__effects.checked = config.effectsEnabled !== false;
  this.__effectStyle.value = config.effectStyle || "disco";
  this.__effectInterval.value = Number.isFinite(config.effectInterval) ? config.effectInterval : 2;
  this.__effectIntensity.value = Number.isInteger(config.effectIntensity) ? config.effectIntensity : 3;
  this.__beatBpm.value = Number.isInteger(config.beatBpm) ? config.beatBpm : 0;

  setTimeout(function () {
    this.__url.focus();
  }.bind(this), 0);

}

RadioEditorModal.prototype.handleConfirm = function () {

  let url = this.__url.value.trim();
  let radius = Number(this.__radius.value);
  let fadeRadius = Number(this.__fadeRadius.value);
  let effectsEnabled = this.__effects.checked ? 1 : 0;
  let effectStyle = this.__effectStyle.value;
  let effectInterval = Number(this.__effectInterval.value);
  let effectIntensity = Number(this.__effectIntensity.value);
  let beatBpm = Number(this.__beatBpm.value);

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

  if (!Number.isInteger(beatBpm) || (beatBpm !== 0 && (beatBpm < 40 || beatBpm > 240))) {
    gameClient.interface.setCancelMessage("Beat BPM must be 0 or a whole number from 40 to 240.");
    return false;
  }

  // Commands are handled by the server in the Default channel and are not
  // echoed to chat, so saving stays an in-game GM action.
  gameClient.send(new ChannelMessagePacket(
    CONST.CHANNEL.DEFAULT,
    1,
    "/radio set %s %s %s %s %s %s %s %s".format(url, radius, fadeRadius, effectsEnabled, effectStyle, effectInterval, effectIntensity, beatBpm)
  ));

  return true;

}
