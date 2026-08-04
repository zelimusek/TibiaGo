const PartyManiacsModal = function (element) {
  Modal.call(this, element);
  this.__status = document.getElementById("party-maniacs-status");
  this.__list = document.getElementById("party-maniacs-list");
  this.__ranking = "party-time";
  this.__data = null;
  Array.from(this.element.querySelectorAll(".party-maniacs-tab")).forEach(function (button) {
    button.addEventListener("click", this.__selectRanking.bind(this, button.getAttribute("data-ranking")));
  }, this);
};

PartyManiacsModal.prototype = Object.create(Modal.prototype);
PartyManiacsModal.prototype.constructor = PartyManiacsModal;

PartyManiacsModal.prototype.handleOpen = function () {
  this.__status.innerText = "Loading the party legends...";
  this.__list.innerHTML = "";
  fetch("/api/party-maniacs", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Leaderboard HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      this.__data = data;
      this.__render();
    }.bind(this))
    .catch(function () {
      this.__status.innerText = "Party Maniacs rankings are temporarily unavailable.";
    }.bind(this));
};

PartyManiacsModal.prototype.__selectRanking = function (ranking) {
  this.__ranking = ranking === "achievements" ? "achievements" : "party-time";
  this.__render();
};

PartyManiacsModal.prototype.__formatTime = function (seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  let hours = Math.floor(seconds / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? "%sh %sm".format(hours, minutes) : "%sm".format(minutes);
};

PartyManiacsModal.prototype.__render = function () {
  Array.from(this.element.querySelectorAll(".party-maniacs-tab")).forEach(function (button) {
    button.classList.toggle("selected", button.getAttribute("data-ranking") === this.__ranking);
  }, this);
  if (!this.__data) return;

  let achievementRanking = this.__ranking === "achievements";
  let entries = achievementRanking ? this.__data.achievements : this.__data.partyTime;
  this.__status.innerText = achievementRanking
    ? "Most achievements unlocked"
    : "Longest time partying with /radio";
  this.__list.innerHTML = "";
  (entries || []).forEach(function (entry, index) {
    let row = document.createElement("div");
    row.className = "party-maniacs-row" + (entry.online ? " online" : "");

    let position = document.createElement("strong");
    position.className = "party-maniacs-position";
    position.innerText = "#" + (index + 1);
    let player = document.createElement("span");
    player.className = "party-maniacs-player";
    let name = document.createElement("strong");
    name.innerText = entry.name;
    let details = document.createElement("small");
    details.innerText = achievementRanking
      ? "%s / %s achievements · %s".format(entry.unlockedCount, entry.totalAchievements, this.__formatTime(entry.seconds))
      : "%s · %s".format(entry.clubRank, this.__formatTime(entry.seconds));
    player.appendChild(name);
    player.appendChild(details);
    let online = document.createElement("span");
    online.className = "party-maniacs-online";
    online.innerText = entry.online ? "ONLINE" : "";
    row.appendChild(position);
    row.appendChild(player);
    row.appendChild(online);
    this.__list.appendChild(row);
  }, this);
  if (!entries || entries.length === 0) this.__status.innerText = "Nobody has joined the party yet.";
};
