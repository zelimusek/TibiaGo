const HotbarConfigModal = function (element) {

  /*
   * Class HotbarConfigModal
   * Unified hotbar editor for item, spell, text and action slots.
   */

  Modal.call(this, element);

  this.__index = null;
  this.__activeTab = "items";
  this.__content = document.getElementById("hotbar-config-content");
  this.__tabs = Array.from(this.element.querySelectorAll(".hotbar-config-tabs button"));

  this.__tabs.forEach(function (button) {
    button.addEventListener("click", this.__selectTab.bind(this, button.getAttribute("data-tab")));
  }, this);

}

HotbarConfigModal.prototype = Object.create(Modal.prototype);
HotbarConfigModal.prototype.constructor = HotbarConfigModal;

HotbarConfigModal.prototype.handleOpen = function (index) {

  this.__index = index;
  this.__selectTab("items");

}

HotbarConfigModal.prototype.__internalButtonClick = function (target) {

  if (target.getAttribute("action") === "clear") {
    gameClient.interface.hotbarManager.clearSlot(this.__index);
    return true;
  }

  return Modal.prototype.__internalButtonClick.call(this, target);

}

HotbarConfigModal.prototype.__selectTab = function (tab) {

  this.__activeTab = tab;

  this.__tabs.forEach(function (button) {
    button.className = button.getAttribute("data-tab") === tab ? "selected" : "";
  });

  switch (tab) {
    case "items": return this.__renderItems();
    case "spells": return this.__renderSpells();
    case "text": return this.__renderText();
    case "actions": return this.__renderActions();
  }

}

HotbarConfigModal.prototype.__getCarriedItems = function () {

  let entries = new Array();
  let seen = new Set();

  let addContainer = function (container) {
    if (!container || !container.slots) {
      return;
    }

    container.slots.forEach(function (slot, index) {
      let item = slot.item;

      if (item === null || seen.has(item.id)) {
        return;
      }

      seen.add(item.id);
      entries.push({
        item: item,
        object: {
          which: container,
          index: index
        }
      });
    });
  };

  addContainer(gameClient.player.equipment);
  Array.from(gameClient.player.__openedContainers || []).forEach(addContainer);

  return entries;

}

HotbarConfigModal.prototype.__renderItems = function () {

  let items = this.__getCarriedItems();
  this.__content.innerHTML = "";
  this.__content.className = "hotbar-config-content hotbar-config-item-list";

  if (items.length === 0) {
    this.__content.innerHTML = "<div class=\"hotbar-config-empty\">Open a backpack or equip items first.</div>";
    return;
  }

  items.forEach(function (entry) {
    let row = document.createElement("div");
    row.className = "hotbar-config-item-row";
    row.appendChild(this.__createItemCanvas(entry.item));

    let label = document.createElement("span");
    label.innerHTML = this.__getItemName(entry.item).capitalize();
    row.appendChild(label);

    row.addEventListener("click", this.__renderItemModes.bind(this, entry.item));
    this.__content.appendChild(row);
  }, this);

}

HotbarConfigModal.prototype.__renderItemModes = function (item) {

  this.__content.innerHTML = "";
  this.__content.className = "hotbar-config-content hotbar-config-modes";

  let title = document.createElement("h3");
  title.innerHTML = "Select use mode:";
  this.__content.appendChild(title);

  this.__addModeButton(item, "Use on Self", "self");
  this.__addModeButton(item, "Use on Target", "target");
  this.__addModeButton(item, "Use on Crosshair", "crosshair");

  if (this.__isRingLike(item)) {
    this.__addModeButton(item, "Move to Ring Slot", "equip-ring");
  }

}

HotbarConfigModal.prototype.__addModeButton = function (item, label, mode) {

  let button = document.createElement("button");
  button.innerHTML = label;
  button.addEventListener("click", function () {
    gameClient.interface.hotbarManager.addItemSlot(this.__index, item.id, mode);
    gameClient.interface.modalManager.close();
  }.bind(this));

  this.__content.appendChild(button);

}

HotbarConfigModal.prototype.__isRingLike = function (item) {

  let name = this.__getItemName(item).toLowerCase();
  let proto = item.getDataObject ? item.getDataObject() : null;
  let slotType = proto && proto.properties ? proto.properties.slotType : null;

  return name.includes("ring") || slotType === "ring";

}

HotbarConfigModal.prototype.__renderSpells = function () {

  this.__content.innerHTML = "";
  this.__content.className = "hotbar-config-content hotbar-config-spell-list";

  gameClient.interface.SPELLS.forEach(function (spell, sid) {
    let row = document.createElement("div");
    row.className = "hotbar-config-spell-row";

    let canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    row.appendChild(canvas);

    canvas.getContext("2d").drawImage(
      HotbarManager.prototype.ICONS,
      32 * spell.icon.x,
      32 * spell.icon.y,
      32, 32,
      0, 0,
      32, 32
    );

    let label = document.createElement("span");
    label.innerHTML = spell.name;
    row.appendChild(label);

    row.addEventListener("click", function () {
      gameClient.interface.hotbarManager.addSlot(this.__index, sid);
      gameClient.interface.modalManager.close();
    }.bind(this));

    this.__content.appendChild(row);
  }, this);

}

HotbarConfigModal.prototype.__renderText = function () {

  this.__content.innerHTML = "";
  this.__content.className = "hotbar-config-content hotbar-config-text";

  let input = document.createElement("input");
  input.type = "text";
  input.placeholder = "e.g. exura, hi, trade...";
  input.value = gameClient.interface.hotbarManager.slots[this.__index].text || "";
  this.__content.appendChild(input);

  let button = document.createElement("button");
  button.innerHTML = "Save Text";
  button.addEventListener("click", function () {
    let text = input.value.trim();
    if (text.length === 0) {
      return;
    }
    gameClient.interface.hotbarManager.addTextSlot(this.__index, text);
    gameClient.interface.modalManager.close();
  }.bind(this));

  this.__content.appendChild(button);
  input.focus();

}

HotbarConfigModal.prototype.__renderActions = function () {

  this.__content.innerHTML = "<div class=\"hotbar-config-empty\">Actions will come here later.</div>";
  this.__content.className = "hotbar-config-content";

}

HotbarConfigModal.prototype.__createItemCanvas = function (item) {

  let canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;

  let slotCanvas = new Canvas(canvas, 32, 32);
  slotCanvas.drawSprite(item, new Position(0, 0), 32);

  return canvas;

}

HotbarConfigModal.prototype.__getItemName = function (item) {

  let dataObject = item.getDataObject ? item.getDataObject() : null;
  let props = dataObject && dataObject.properties ? dataObject.properties : {};
  let serverProps = {};

  if (gameClient.itemDefinitions && gameClient.itemDefinitions[item.id]) {
    serverProps = gameClient.itemDefinitions[item.id].properties || {};
  }

  return serverProps.name || props.name || ("item " + item.id);

}
