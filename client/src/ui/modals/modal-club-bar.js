const ClubBarModal = function(element) {
  Modal.call(this, element);
  this.list = document.getElementById("club-bar-list");
  this.selected = null;
};
ClubBarModal.prototype = Object.create(Modal.prototype);
ClubBarModal.prototype.constructor = ClubBarModal;
ClubBarModal.prototype.handleOpen = function(config) {
  document.getElementById("club-bar-title").innerText = config.name;
  this.list.innerHTML = ""; this.selected = null;
  let items = config.items || [];
  document.getElementById("club-bar-text").innerText = config.text || "Choose an option.";
  items.forEach(function(drink) {
    let button = document.createElement("button"); button.className = "club-bar-item";
    button.innerHTML = "<span>" + drink.name + "</span><b>" + (drink.price ? drink.price + " gp" : "") + "</b>";
    button.onclick = function() { this.selected = drink.key; Array.from(this.list.children).forEach(x => x.classList.remove("selected")); button.classList.add("selected"); }.bind(this);
    this.list.appendChild(button);
  }, this);
};
ClubBarModal.prototype.handleConfirm = function() {
  if(!this.selected) return false;
  gameClient.send(new ChannelMessagePacket(CONST.CHANNEL.DEFAULT, 1, this.selected));
  return true;
};
