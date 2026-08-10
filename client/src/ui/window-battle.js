const BattleWindow = function (element) {

  /*
   * Class InteractiveWindow
   * Makes an element with the window class interactive
   *
   * API:
   *  - generateContent(content): Generates the body content for the window based on the friend list array
   */

  InteractiveWindow.call(this, element);

  this.__layoutScheduled = false;
  this.__emptyElement = document.createElement("div");
  this.__emptyElement.className = "battle-window-empty";
  this.__emptyElement.textContent = "No creatures nearby";
  this.__emptyElement.style.display = "flex";
  this.getBody().appendChild(this.__emptyElement);

}

// Set the prototype and constructor
BattleWindow.prototype = Object.create(InteractiveWindow.prototype);
BattleWindow.prototype.constructor = BattleWindow;

BattleWindow.prototype.__isMobile = function () {
  return Boolean(gameClient.touch && gameClient.touch.isMobileMode);
}

BattleWindow.prototype.__getCreatureRows = function () {
  return Array.from(this.getBody().querySelectorAll(".battle-window-target-wrapper"));
}

BattleWindow.prototype.__isBattleCreature = function (creature) {
  return Boolean(
    creature &&
    (creature.type === CONST.TYPES.PLAYER || creature.type === CONST.TYPES.MONSTER)
  );
}

BattleWindow.prototype.__scheduleLayout = function () {
  if (this.__layoutScheduled) {
    return;
  }

  this.__layoutScheduled = true;
  let callback = function () {
    this.__layoutScheduled = false;
    this.__refreshLayout();
  }.bind(this);

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 0);
  }
}

BattleWindow.prototype.__refreshLayout = function () {
  let rows = this.__getCreatureRows();
  let visibleRows = rows.filter(function (row) {
    return row.style.display !== "none";
  });

  if (this.__isMobile()) {
    visibleRows.sort(function (left, right) {
      let distance = Number(left.dataset.distance) - Number(right.dataset.distance);
      if (distance !== 0) {
        return distance;
      }

      let type = Number(left.dataset.creatureType) - Number(right.dataset.creatureType);
      if (type !== 0) {
        return type;
      }

      return left.dataset.creatureName.localeCompare(right.dataset.creatureName);
    });

    visibleRows.forEach(function (row) {
      this.getBody().insertBefore(row, this.__emptyElement);
    }, this);
  }

  this.__emptyElement.style.display = visibleRows.length === 0 ? "flex" : "none";
  this.getElement(".header").querySelector(".title").textContent = this.__isMobile()
    ? "Battle · " + visibleRows.length
    : "Battle";
}

BattleWindow.prototype.removeCreature = function (id) {

  let element = this.getBody().querySelector('[id="%s"]'.format(id));

  if (element === null) {
    return;
  }

  element.remove();
  this.__scheduleLayout();

}

BattleWindow.prototype.setTarget = function (creature) {

  this.__getCreatureRows().forEach(function (row) {
    row.classList.toggle(
      "battle-window-targeted",
      creature !== null && Number(row.getAttribute("id")) === creature.id
    );
  });

}

BattleWindow.prototype.__getCreaturePreviewLayout = function (frames, mounted) {
  let tileSpan = Math.max(
    1,
    frames.characterGroup.width || 1,
    frames.characterGroup.height || 1
  );

  if (mounted && frames.mountGroup) {
    tileSpan = Math.max(
      tileSpan,
      frames.mountGroup.width || 1,
      frames.mountGroup.height || 1
    );
  }

  return {
    canvasSize: tileSpan * 32,
    anchor: tileSpan - 1
  };
}

BattleWindow.prototype.__drawCreaturePreview = function (element, creature) {
  let frames = creature.getCharacterFrames();
  if (frames === null) {
    return;
  }

  let mounted = creature.isMounted();
  let layout = this.__getCreaturePreviewLayout(frames, mounted);
  let canvasElement = element.querySelector(".battle-window-target-canvas canvas");
  let canvas = new Canvas(canvasElement, layout.canvasSize, layout.canvasSize);
  let zPattern = (frames.characterGroup.pattern.z > 1 && mounted) ? 1 : 0;

  canvas.__drawCharacter(
    creature.spriteBuffer,
    creature.spriteBufferMount,
    creature.outfit,
    new Position(layout.anchor, layout.anchor),
    frames.characterGroup,
    frames.mountGroup,
    frames.characterFrame,
    frames.mountFrame,
    CONST.DIRECTION.SOUTH,
    zPattern,
    32,
    0
  );

  element.dataset.outfitSignature = JSON.stringify(creature.outfit.serialize());
}

BattleWindow.prototype.__activateCreature = function (element) {
  let creature = gameClient.world.getCreature(Number(element.id));
  if (creature === null) {
    return;
  }

  if (gameClient.mouse.__multiUseObject !== null) {
    gameClient.send(new ItemUseOnCreaturePacket(gameClient.mouse.__multiUseObject, creature.id));
    gameClient.mouse.__multiUseObject = null;
    gameClient.mouse.setCursor("auto");
    return;
  }

  gameClient.world.toggleCreatureTarget(creature);
}

BattleWindow.prototype.updateCreature = function (creature) {

  /*
   * Function BattleWindow.updateCreature
   * Updates the DOM element of the creature with new stats
   */

  if (gameClient.isSelf(creature)) {
    return this.removeCreature(creature.id);
  }

  if (!this.__isBattleCreature(creature)) {
    return this.removeCreature(creature.id);
  }

  // Find the element for this creature
  let element = this.getBody().querySelector('[id="%s"]'.format(creature.id));

  if (!element) {
    return;
  }

  // FOV Check: Only show creatures on the same floor and within 9 tiles
  let player = gameClient.player;
  if (player && !gameClient.isSelf(creature)) {
    let playerPos = player.getPosition();
    let creaturePos = creature.getPosition();
    let dx = Math.abs(playerPos.x - creaturePos.x);
    let dy = Math.abs(playerPos.y - creaturePos.y);

    let isVisible = playerPos.z === creaturePos.z && (
      typeof player.canSee === "function"
        ? player.canSee(creature)
        : dx < 10 && dy < 8
    );

    if (!isVisible) {
      element.style.display = "none";
      this.__scheduleLayout();
      return;
    }

    element.dataset.distance = String(Math.max(dx, dy));
  }

  element.style.display = "flex";
  element.dataset.creatureType = String(creature.type);
  element.dataset.creatureName = creature.name.toLocaleLowerCase();
  element.classList.toggle(
    "battle-window-targeted",
    Boolean(
      player &&
      typeof player.isCreatureTarget === "function" &&
      player.isCreatureTarget(creature)
    )
  );

  let nameSpan = element.firstElementChild.firstElementChild;
  nameSpan.textContent = creature.name;
  element.setAttribute("aria-label", creature.name);

  let nodeList = element.querySelectorAll(".battle-window-bar-wrapper");

  // Health Bar
  let hpParams = [creature.state.health, creature.maxHealth];
  let hpPercent = Math.min(100, Math.max(0, (creature.state.health / (creature.maxHealth || 1)) * 100));
  nodeList[0].querySelector('.bar-text').textContent = this.__isMobile()
    ? Math.round(hpPercent) + "%"
    : "%s / %s".format(...hpParams);
  nodeList[0].querySelector('.health').style.width = hpPercent + "%";

  // Mana Bar
  if (!creature.maxMana || creature.maxMana <= 0) {
    nodeList[1].style.display = "none";
  } else {
    let manaParams = [creature.state.mana || 0, creature.maxMana || 0];
    nodeList[1].querySelector('.bar-text').innerHTML = "%s / %s".format(...manaParams);
    let manaPercent = Math.min(100, Math.max(0, ((creature.state.mana || 0) / (creature.maxMana || 1)) * 100));
    nodeList[1].querySelector('.mana').style.width = manaPercent + "%";
  }

  let outfitSignature = JSON.stringify(creature.outfit.serialize());
  if (element.dataset.outfitSignature !== outfitSignature) {
    this.__drawCreaturePreview(element, creature);
  }

  this.__scheduleLayout();

}

BattleWindow.prototype.addCreature = function (creature) {

  /*
   * Function BattleWindow.addCreature
   * Updates the DOM with the targeted creature
   */

  if (gameClient.isSelf(creature)) {
    return this.removeCreature(creature.id);
  }

  if (!this.__isBattleCreature(creature)) {
    return this.removeCreature(creature.id);
  }

  // Check if creature already exists in the list to avoid duplicates
  let existing = this.getBody().querySelector('[id="%s"]'.format(creature.id));
  if (existing) {
    return this.updateCreature(creature);
  }

  //if(creature.type !== 1) return;
  // Create the target node and add
  let node = document.getElementById("battle-window-target").cloneNode(true);
  node.style.display = "flex";
  node.setAttribute("id", creature.id);
  node.setAttribute("role", "button");
  node.classList.add(creature.type === CONST.TYPES.PLAYER
    ? "battle-window-player"
    : "battle-window-monster");

  this.__drawCreaturePreview(node, creature);

  let nameSpan = node.firstElementChild.firstElementChild;
  nameSpan.textContent = creature.name;

  this.getBody().insertBefore(node, this.__emptyElement);

  // Update the stats immediately
  this.updateCreature(creature);

  // BLOCK ALL MOUSE EVENTS IN MOBILE MODE
  // This is critical because Mouse.js listens to mousedown/mouseup on document.body.
  // Since we allow touchstart default (for scroll), the browser acts as a mouse.
  // We must stop these events here so they don't reach the game map.

  function blockMobileMouse(event) {
    if (gameClient.touch && gameClient.touch.isMobileMode) {
      // console.log("Blocking mobile mouse event:", event.type, this.id);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  node.addEventListener("mousedown", blockMobileMouse);
  node.addEventListener("mouseup", blockMobileMouse);

  node.addEventListener("click", function (event) {
    if (gameClient.touch && gameClient.touch.isMobileMode) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    this.__battleWindow.__activateCreature(this);
  });

  node.__battleWindow = this;

  // Mobile support: Custom Tap Handling
  // We cannot just use touchstart with preventDefault because that breaks scrolling.
  // We need to track the touch and fire only if it wasn't a scroll.
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;

  node.addEventListener("touchstart", function (event) {
    if (gameClient.touch && gameClient.touch.isMobileMode) {
      // Don't prevent default here, or we can't scroll!
      // But we must stop propagation if this turns out to be a click later... 
      // Actually, we can't fully stop propagation here if we want scrolling to bubble?
      // No, scrolling happens on this element's container.

      let touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoved = false;
    }
  }, { passive: true }); // Passive to allow scrolling

  node.addEventListener("touchmove", function (event) {
    if (gameClient.touch && gameClient.touch.isMobileMode) {
      let touch = event.changedTouches[0];
      if (Math.abs(touch.clientX - touchStartX) >= 10 || Math.abs(touch.clientY - touchStartY) >= 10) {
        touchMoved = true;
      }
    }
  }, { passive: true });

  node.addEventListener("touchend", function (event) {
    if (gameClient.touch && gameClient.touch.isMobileMode) {
      let touch = event.changedTouches[0];
      let dx = Math.abs(touch.clientX - touchStartX);
      let dy = Math.abs(touch.clientY - touchStartY);

      // If moved less than 10 pixels, consider it a tap
      if (!touchMoved && dx < 10 && dy < 10) {
        // It's a tap!
        event.preventDefault(); // Prevent mouse compatibility events
        event.stopPropagation();
        event.stopImmediatePropagation();

        this.__battleWindow.__activateCreature(this);
      }
    }
  });

  node.addEventListener("touchcancel", function () {
    touchMoved = true;
  });

}
