const MessageElement = function (entity, message, color) {

  /*
   * Class MessageElement
   * Wrapper for all sorts of DOM elements on the game screen (e.g., text & character panels)
   *
   * API:
   *
   * MessageElement.getDuration() - Returns the duration in tick frames how long the element should stay on the screen
   * MessageElement.setMessage(message) - Sets the message within the message element
   * MessageElement.setColor(color) - Sets the color of the message element
   *
   */

  // Inherit from text element
  ScreenElement.call(this, "message-element-prototype");

  // Freeze speech at the exact visual world position where it was spoken.
  // A creature that is mid-step already owns its destination position while
  // the sprite is still offset towards the previous tile, so preserve that
  // movement offset instead of letting the bubble jump one SQM ahead.
  this.__entity = entity;
  this.__position = entity.__position.copy();
  this.__visualOffset = { x: 0, y: 0 };

  if (
    typeof entity.getPosition === "function" &&
    typeof entity.getMoveOffset === "function"
  ) {
    let moveOffset = entity.getMoveOffset();
    let tile = gameClient.world.getTileFromWorldPosition(entity.getPosition());
    let elevation = tile ? tile.__renderElevation : 0;

    this.__visualOffset.x = moveOffset.x + elevation;
    this.__visualOffset.y = moveOffset.y + elevation;
  }

  this.__message = message;
  this.__color = color;

  this.setMessage(message);

  this.setColor(color);

}

MessageElement.prototype = Object.create(ScreenElement.prototype);
MessageElement.prototype.constructor = MessageElement;

MessageElement.prototype.getDuration = function () {

  /*
   * Function ScreenElement.getDuration
   * Returns the duration of the text element to remain on the screen
   */

  return 15 * Math.sqrt(this.__message.length);

}

MessageElement.prototype.setMessage = function (message) {

  /*
   * Function ScreenElement.setMessage
   * Sets the message of the screen text element
   */

  let [nameElement, textElement] = this.element.querySelectorAll("span");

  // Removed underline as requested and added " says:"
  nameElement.innerHTML = this.__entity.name + " says:";
  textElement.innerHTML = message;

}

MessageElement.prototype.setColor = function (color) {

  /*
   * Function ScreenElement.setColor
   * Sets the color of the screen text element
   */

  let [nameElement, textElement] = this.element.querySelectorAll("span");

  textElement.style.color = Interface.prototype.getHexColor(color);
  nameElement.style.color = Interface.prototype.getHexColor(color);

}

MessageElement.prototype.setTextPosition = function () {

  /*
   * Function ScreenElement.setTextPosition
   * Requests the offset of the text element and updates the text position
   */

  // Convert the frozen world anchor on every camera update. Do not read the
  // speaker's current position here: subsequent player, NPC or monster
  // movement must leave the speech exactly where it was spoken.
  let screenPosition = gameClient.renderer.getStaticScreenPosition(this.__position);
  screenPosition.x -= this.__visualOffset.x;
  screenPosition.y -= this.__visualOffset.y;

  let offset = this.__getAbsoluteOffset(screenPosition);
  let fraction = gameClient.interface.getSpriteScaling();

  // Center the text horizontally (match CharacterElement)
  // Speech sits a few virtual pixels left of the tile centre, matching the
  // visual centre of the Tibia outfit rather than its rectangular sprite box.
  offset.left += fraction * 0.35;

  // Keep speech directly below the nameplate, but above the sprite. The old
  // desktop calculation added a positive offset and pushed text into the
  // character body below the health bar.
  let isMobile = gameClient.touch && gameClient.touch.isMobileMode;
  // Desktop speech belongs between the status/nameplate and the character
  // sprite. A small upward shift keeps it under the HP bars without covering
  // them (or the nickname) as the larger previous offset did.
  offset.top -= isMobile ? (fraction * 1.8) : (fraction * 0.05);

  this.__updateTextPosition(offset);

}
