const ScreenElement = function (id) {

  /*
   * Class ScreenElement
   * Base class for DOM elements on the game screen
   *
   * API:
   *
   * ScreenElement.remove() - removes the screen element DOM
   * ScreenElement.hide() - hides the screen element DOM
   * ScreenElement.show() - shows the screen element DOM
   *
   */

  // Specific classes implement and create the element
  this.element = document.getElementById(id).cloneNode(true);

  // Keep clones hidden until their first valid position is known. Showing a
  // newly appended creature label at the browser default (0, 0) produces a
  // one-frame dot/ghost in the top-left corner of the game screen.
  this.hide();

}

ScreenElement.prototype.remove = function () {

  /*
   * Function ScreenElement.remove
   * Removes the element from the DOM
   */

  this.element.remove();

}

ScreenElement.prototype.hide = function () {

  /*
   * Function ScreenElement.hide
   * Hides the element from the game screen
   */

  this.element.style.display = "none";

}

ScreenElement.prototype.show = function () {

  /*
   * Function ScreenElement.show
   * Shows the element on the game screen
   */

  this.element.style.display = "block";

}

ScreenElement.prototype.__updateTextPosition = function (offset, clampToScreen) {

  /*
   * Function ScreenElement.__updateTextPosition
   * Actually applies the transform
   */

  let rect = gameClient.renderer.screen.canvas.getBoundingClientRect();

  let left = offset.left;
  let top = offset.top;

  // Messages and floating numbers may remain readable at an edge. Creature
  // nameplates opt out so an off-screen NPC is clipped instead of being
  // attached to the top-left corner.
  if (clampToScreen !== false) {
    left = left.clamp(0, rect.width - this.element.offsetWidth);
    top = top.clamp(0, rect.height - this.element.offsetHeight);
  }

  // Set the style to transform
  this.element.style.transform = "translate(" + left + "px, " + top + "px)";

  // Show synchronously after positioning. A queued show could run after the
  // visibility manager had already hidden an off-screen creature.
  this.show();

}

ScreenElement.prototype.__getAbsoluteOffset = function (position) {

  /*
   * Function ScreenElement.__getAbsoluteOffset
   * Returns the offset of the screen element based on its properties and the screen size
   */

  // Determine the fraction based on the size of the screen
  let scale = gameClient.interface.getSpriteScalingVector();

  // Calculate the text position in canvas coordinates and center them
  // Use separate X and Y scales to handle non-uniform stretching on mobile
  let left = (scale.x * position.x) - (0.5 * this.element.offsetWidth);
  let top = (scale.y * position.y) - (0.5 * this.element.offsetHeight);

  // Return the new offsets
  return { left, top }

}
