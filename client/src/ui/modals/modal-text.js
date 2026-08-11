const TextModal = function(id) {

  Modal.call(this, id);

  this.__confirmActions = document.getElementById("login-feedback-actions");
  this.__returnToLogin = false;
  this.__focusElementId = null;

}

TextModal.prototype = Object.create(Modal.prototype);
TextModal.constructor = TextModal;

TextModal.prototype.handleOpen = function(x) {

  let options = x && typeof x === "object" && x.dismissible === true ? x : null;
  let message = options ? options.message : x;

  this.__returnToLogin = options ? options.returnToLogin === true : false;
  this.__focusElementId = options ? options.focusElementId || null : null;
  this.__confirmActions.style.display = options ? "" : "none";
  document.getElementById("serve-feedback").innerHTML = message;

}

TextModal.prototype.handleConfirm = function () {

  if (!this.__returnToLogin) {
    return true;
  }

  // Perform the transition synchronously so a tap on OK remains a user
  // gesture and may open the software keyboard on mobile browsers.
  let modalManager = gameClient.interface.modalManager;
  modalManager.close();
  modalManager.open("floater-enter");

  let input = this.__focusElementId
    ? document.getElementById(this.__focusElementId)
    : null;
  if (input) {
    input.focus();
    if (typeof input.select === "function") {
      input.select();
    }
  }

  // The original information modal has already been replaced with the login
  // modal, so its generic button handler must not close the new modal again.
  return false;

}
