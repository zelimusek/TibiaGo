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
  this.__minusButton = document.getElementById("item-amount-minus");
  this.__plusButton = document.getElementById("item-amount-plus");
  this.__output = document.getElementById("item-count");

  // Keep the slider, buttons and direct numeric keyboard input synchronized.
  this.__slider.addEventListener("input", this.__changeSelectedCount.bind(this, this.__slider));
  this.__minusButton.addEventListener("click", this.__stepSelectedCount.bind(this, -1));
  this.__plusButton.addEventListener("click", this.__stepSelectedCount.bind(this, 1));
  this.element.addEventListener("keydown", this.__handleKeyDown.bind(this));
  this.element.setAttribute("tabindex", "-1");
  
  // State properties of the modal
  this.__properties = null;
  this.__count = null;
  this.__typedAmount = "";
  this.__lastTypedAt = 0;

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
  this.__typedAmount = "";
  this.__lastTypedAt = 0;

  this.__changeSelectedCount(this.__slider);

  // Keep keyboard input inside the modal, even though no text field is shown.
  this.element.focus();

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

  // Redraw the DOM elements in the modal
  this.__redrawModal();

}

MoveItemModal.prototype.__stepSelectedCount = function(step) {

  this.__typedAmount = "";
  this.__lastTypedAt = 0;
  this.__slider.value = this.__count + step;
  this.__changeSelectedCount(this.__slider);
  this.element.focus();

}

MoveItemModal.prototype.__handleKeyDown = function(event) {

  let direction = 0;

  if (event.key === "ArrowLeft" || event.keyCode === 37) {
    direction = -1;
  } else if (event.key === "ArrowRight" || event.keyCode === 39) {
    direction = 1;
  }

  if (direction !== 0) {
    event.preventDefault();
    event.stopPropagation();
    this.__stepSelectedCount(direction);
    return;
  }

  let isDigit = typeof event.key === "string" && /^[0-9]$/.test(event.key);

  if (isDigit) {
    event.preventDefault();
    event.stopPropagation();

    let now = Date.now();
    if (now - this.__lastTypedAt > 1000) {
      this.__typedAmount = "";
    }

    this.__typedAmount += event.key;
    this.__lastTypedAt = now;
    this.__changeSelectedCount({ value: this.__typedAmount });
    return;
  }

  if (event.key === "Backspace" && this.__typedAmount.length > 0) {
    event.preventDefault();
    event.stopPropagation();
    this.__typedAmount = this.__typedAmount.slice(0, -1);
    this.__lastTypedAt = Date.now();
    this.__changeSelectedCount({ value: this.__typedAmount || 1 });
    return;
  }

  if (event.key !== "Enter" && event.keyCode !== 13) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  gameClient.interface.modalManager.handleConfirm();

}
