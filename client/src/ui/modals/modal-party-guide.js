const PartyGuideModal = function (element) {
  Modal.call(this, element);
  this.__section = "rules";
  Array.from(this.element.querySelectorAll(".party-guide-tab")).forEach(function (button) {
    button.addEventListener("click", this.__selectSection.bind(this, button.getAttribute("data-guide-tab")));
  }, this);
};

PartyGuideModal.prototype = Object.create(Modal.prototype);
PartyGuideModal.prototype.constructor = PartyGuideModal;

PartyGuideModal.prototype.handleOpen = function () {
  this.__selectSection(this.__section);
};

PartyGuideModal.prototype.__selectSection = function (section) {
  let valid = ["rules", "games", "achievements", "ranks"];
  this.__section = valid.indexOf(section) === -1 ? "rules" : section;
  Array.from(this.element.querySelectorAll(".party-guide-tab")).forEach(function (button) {
    button.classList.toggle("selected", button.getAttribute("data-guide-tab") === this.__section);
  }, this);
  Array.from(this.element.querySelectorAll(".party-guide-panel")).forEach(function (panel) {
    panel.classList.toggle("selected", panel.getAttribute("data-guide-panel") === this.__section);
  }, this);
};
