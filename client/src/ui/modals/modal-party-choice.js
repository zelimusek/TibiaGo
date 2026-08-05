const PartyChoiceModal = function (element) {
  Modal.call(this, element);
  this.blocksDismissal = true;
  this.__timer = document.getElementById("party-choice-timer");
  this.__interval = null;
  Array.from(this.element.querySelectorAll("[data-party-choice]")).forEach(function (button) {
    button.addEventListener("click", this.__choose.bind(this, button.getAttribute("data-party-choice")));
  }, this);
};

PartyChoiceModal.prototype = Object.create(Modal.prototype);
PartyChoiceModal.prototype.constructor = PartyChoiceModal;

PartyChoiceModal.prototype.handleOpen = function (data) {
  data = data || {};
  clearInterval(this.__interval);
  let durationMs = Math.max(1000, Number(data.durationMs) || 30000);
  let endsAt = Date.now() + durationMs;
  let renderTimer = function () {
    let seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    this.__timer.innerText = "Make your choice: %s second%s".format(seconds, seconds === 1 ? "" : "s");
    if (seconds <= 0) clearInterval(this.__interval);
  }.bind(this);
  renderTimer();
  this.__interval = setInterval(renderTimer, 250);
  Array.from(this.element.querySelectorAll("[data-party-choice]")).forEach(function (button) {
    button.disabled = false;
  });
};

PartyChoiceModal.prototype.__choose = function (choice) {
  Array.from(this.element.querySelectorAll("[data-party-choice]")).forEach(function (button) {
    button.disabled = true;
  });
  clearInterval(this.__interval);
  gameClient.send(new ChannelMessagePacket(CONST.CHANNEL.DEFAULT, 1, "/party-choice " + choice));
  gameClient.interface.modalManager.close(true);
};
