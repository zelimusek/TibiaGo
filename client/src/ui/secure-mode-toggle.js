const SecureModeToggle = function () {

  /*
   * Class SecureModeToggle
   * Owns the standalone Secure Mode control displayed over the game screen.
   */

  this.secureMode = true;
  this.button = document.getElementById("secure-mode-toggle");

  if (this.button === null) {
    console.warn("SecureModeToggle: Button not found");
    return;
  }

  this.button.addEventListener("click", this.toggle.bind(this));
  this.__updateVisualState();

};

SecureModeToggle.prototype.toggle = function (event) {

  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (
    typeof gameClient === "undefined" ||
    gameClient === null ||
    !gameClient.networkManager ||
    !gameClient.networkManager.isConnected()
  ) {
    return;
  }

  this.secureMode = !this.secureMode;
  gameClient.send(new SecureModePacket(this.secureMode));
  this.__updateVisualState();

};

SecureModeToggle.prototype.setFromServer = function (enabled) {

  this.secureMode = enabled !== false;
  this.__updateVisualState();

};

SecureModeToggle.prototype.__updateVisualState = function () {

  if (this.button === null) {
    return;
  }

  let label = "Secure Mode: " + (this.secureMode ? "On" : "Off");

  this.button.classList.toggle("is-enabled", this.secureMode);
  this.button.setAttribute("data-secure", String(this.secureMode));
  this.button.setAttribute("aria-pressed", String(this.secureMode));
  this.button.setAttribute("aria-label", label);
  this.button.title = label;

};
