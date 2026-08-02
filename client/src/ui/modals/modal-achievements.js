const AchievementsModal = function (element) {
  Modal.call(this, element);
  this.__summary = document.getElementById("achievements-summary");
  this.__list = document.getElementById("achievements-list");
  this.__data = null;
};

AchievementsModal.prototype = Object.create(Modal.prototype);
AchievementsModal.prototype.constructor = AchievementsModal;

AchievementsModal.prototype.handleOpen = function (data) {
  this.__data = data || { achievements: [], unlockedCount: 0, totalCount: 0 };
  this.__render();
};

AchievementsModal.prototype.__render = function () {
  let data = this.__data;
  this.__summary.innerText = "%s / %s unlocked".format(data.unlockedCount || 0, data.totalCount || 0);
  this.__list.innerHTML = "";

  (data.achievements || []).forEach(function (achievement) {
    let row = document.createElement("button");
    row.type = "button";
    row.className = "achievement-row achievement-" + achievement.rarity
      + (achievement.unlocked ? " unlocked" : " locked")
      + (achievement.active ? " active" : "");
    row.disabled = !achievement.unlocked;

    let icon = document.createElement("span");
    icon.className = "achievement-state";
    icon.innerText = achievement.unlocked ? (achievement.active ? "★" : "✓") : "🔒";

    let content = document.createElement("span");
    content.className = "achievement-content";
    let title = document.createElement("strong");
    title.innerText = achievement.title;
    let description = document.createElement("span");
    description.innerText = achievement.description;
    let progress = document.createElement("span");
    progress.className = "achievement-progress";
    progress.innerText = achievement.unlocked
      ? "Unlocked " + new Date(achievement.unlockedAt).toLocaleDateString()
      : "%s / %s".format(achievement.progress, achievement.target);
    content.appendChild(title);
    content.appendChild(description);
    content.appendChild(progress);
    row.appendChild(icon);
    row.appendChild(content);

    if (achievement.unlocked) {
      row.addEventListener("click", function () {
        let command = achievement.active ? "/title none" : "/title " + achievement.title;
        gameClient.send(new ChannelMessagePacket(CONST.CHANNEL.DEFAULT, 1, command));
      });
    }
    this.__list.appendChild(row);
  }, this);
};
