const RadioEditorModal = function (element) {

  /*
   * GM editor for an internet-radio zone centered on the current player tile.
   */

  Modal.call(this, element);

  this.__url = document.getElementById("radio-editor-url");
  this.__radius = document.getElementById("radio-editor-radius");
  this.__fadeRadius = document.getElementById("radio-editor-fade-radius");

}

RadioEditorModal.prototype = Object.create(Modal.prototype);
RadioEditorModal.prototype.constructor = RadioEditorModal;

RadioEditorModal.prototype.handleOpen = function (config) {

  config = config || {};
  this.__url.value = config.url || "";
  this.__radius.value = Number.isInteger(config.radius) ? config.radius : 4;
  this.__fadeRadius.value = Number.isInteger(config.fadeRadius) ? config.fadeRadius : 5;

  setTimeout(function () {
    this.__url.focus();
  }.bind(this), 0);

}

RadioEditorModal.prototype.handleConfirm = function () {

  let url = this.__url.value.trim();
  let radius = Number(this.__radius.value);
  let fadeRadius = Number(this.__fadeRadius.value);

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

  // Commands are handled by the server in the Default channel and are not
  // echoed to chat, so saving stays an in-game GM action.
  gameClient.send(new ChannelMessagePacket(
    CONST.CHANNEL.DEFAULT,
    1,
    "/radio set %s %s %s".format(url, radius, fadeRadius)
  ));

  return true;

}
