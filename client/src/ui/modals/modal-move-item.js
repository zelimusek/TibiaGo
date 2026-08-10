const MoveItemModal = function(element) {

  /*
   * Class MoveItemModal
   * Wrapper for the modal that can move an item
   *
   * API:
   *
   * MoveItemModal.handleOpen(properties) - Implements callback fired when modal is opened
   * MoveItemModal.handleConfirm - Implements callback fired when modal is closed by confirmation
   *
   * MoveItemModal.__redrawModal - Redraws the modal and DOM elements
   * MoveItemModal.__changeSelectedCount - Updates the selected count amount
   *
   */

  // Inherit from modal
  Modal.call(this, element);

  // Reference the canvas to show the preview of what is being moved
  this.__canvas = new Canvas("move-count-sprite", 32, 32);

  // Specific HTML elements
  this.__slider = document.getElementById("item-amount");
  this.__numberInput = document.getElementById("item-amount-input");
  this.__output = document.getElementById("item-count");

  // Keep mouse/touch slider input and direct keyboard input synchronized.
  this.__slider.addEventListener("input", this.__changeSelectedCount.bind(this, this.__slider));
  this.__numberInput.addEventListener("input", this.__changeSelectedCount.bind(this, this.__numberInput));
  this.__numberInput.addEventListener("keydown", this.__handleNumberKeyDown.bind(this));
  
  // State properties of the modal
  this.__properties = null;
  this.__count = null;

}

MoveItemModal.prototype = Object.create(Modal.prototype);
MoveItemModal.constructor = MoveItemModal;

MoveItemModal.prototype.handleOpen = function(properties) {

  /*
   * Function MoveItemModal.handleOpen
   * Callback fired when the slider is slid and the selected count changes
   */

  this.__properties = properties;
  

  this.__count = properties.item.count;

  // Set the current count and maximum
  this.__slider.value = this.__slider.max = this.__count;
  this.__numberInput.value = this.__count;
  this.__numberInput.max = this.__count;

  this.__changeSelectedCount(this.__slider);

  // Selecting the value makes typing a replacement number immediate.
  this.__numberInput.focus();
  this.__numberInput.select();

}

MoveItemModal.prototype.handleConfirm = function() {

  /*
   * Function MoveItemModal.handleConfirm
   * Callback fired when confirm is pressed: write the move event to the server
   */

  // Write to server and return true to close modal
  gameClient.mouse.sendItemMove(
    this.__properties.fromObject,
    this.__properties.toObject,
    this.__count
  );

  // Closes the modal
  return true;

}

MoveItemModal.prototype.__redrawModal = function() {

  /*
   * Function MoveItemModal.__redrawModal
   * Internal function to redraw the modal (canvas, count) after a new selection is made
   */

  // Set the count
  this.__output.innerHTML = this.__count;

  // Create a temporary fake item class with the new count
  let item = new Item(this.__properties.item.id, this.__count);

  this.__canvas.clear();
  this.__canvas.drawSprite(item, new Position(0, 0), 32);

}

MoveItemModal.prototype.__changeSelectedCount = function(source) {

  /*
   * Function MoveItemModal
   * Callback fired when the slider is slid and the selected count changes
   */

  let amount = Number(source.value);
  let max = Number(this.__slider.max);

  if (!Number.isFinite(amount)) {
    amount = 1;
  }

  amount = Math.trunc(amount);

  // When shift is pressed do in steps of 10 gold
  if(gameClient.keyboard.isShiftDown()) {
    if(amount !== max) {
      amount = Math.round(amount / 10) * 10;
    }
  }

  this.__count = Math.min(max, Math.max(1, amount));
  this.__slider.value = this.__count;
  this.__numberInput.value = this.__count;

  // Redraw the DOM elements in the modal
  this.__redrawModal();

}

MoveItemModal.prototype.__handleNumberKeyDown = function(event) {

  if (event.key !== "Enter" && event.keyCode !== 13) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  gameClient.interface.modalManager.handleConfirm();

}
