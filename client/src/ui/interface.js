const Interface = function () {
  /*
   * Class Interface
   * Wrapper for the entire game interface
   *
   * API:
   *
   * @setCancelMessage(message) - Sets a cancel message on the client that is automatically cleared
   * @getColor(int) - Returns the color that is mapped to a specific identifier
   * @getAccountDetails() - Returns the filled in account details (aCCount number, password)
   * @updateStatusBar() - Call to update the status bar with the available conditions
   *
   */

  // Interface settings
  this.settings = new Settings();

  // Manager for chat channels
  this.channelManager = new ChannelManager();

  // Manager for hotbar
  this.hotbarManager = new HotbarManager();

  // Manager for fight mode selector (Full Attack, Balanced, Full Defense)
  this.fightModeSelector = new FightModeSelector();

  // Manager for notifications
  this.notificationManager = new NotificationManager();

  // The manager for modals (popup windows in the center of the screen)
  this.modalManager = new ModalManager();

  this.statusBar = new StatusBar();

  // The manager for windows (windows in the sidebars, particularly containers)
  this.windowManager = new WindowManager();

  // Manager for sound
  this.soundManager = new SoundManager(this.settings.isSoundEnabled());

  // Manager for popup menus
  this.menuManager = new MenuManager();

  // Manager for the text window
  this.screenElementManager = new ScreenElementManager();

  // Tooltip manager
  this.tooltip = new Tooltip();

  // Quest Tracker Overlay
  this.questTracker = new QuestTracker();

  // Enable all the listeners in the DOM
  this.__enableListeners();

  // Create the state variable for the interface and callbacks when the properties are changed
  this.state = new State();
  this.state.add("spritesLoaded", this.enableEnterGame.bind(this));
  this.state.add("dataLoaded", this.enableEnterGame.bind(this));

  document.getElementById("chat-input").disabled = true;

  this.addAvailableResolutions();

  document
    .getElementById("keyring")
    .addEventListener("click", this.__openKeyRing.bind(this));

  // Cache for mobile scale to avoid layout thrashing
  this.__cachedMobileScale = null;
};

Interface.prototype.SCREEN_WIDTH_MIN = 480;
Interface.prototype.SCREEN_HEIGHT_MIN = 352;

// These are the available indices of web colors by name (see below)
Interface.prototype.COLORS = new Object({
  BLACK: 0,
  BLUE: 5,
  LIGHTGREEN: 30,
  LIGHTBLUE: 35,
  MAYABLUE: 95,
  DARKRED: 108,
  LIGHTGREY: 129,
  SKYBLUE: 143,
  PURPLE: 155,
  RED: 180,
  ORANGE: 198,
  YELLOW: 210,
  WHITE: 215,
});

// Definitions of web safe colors used for text
Interface.prototype.WEBCOLORS = new Array(
  "#000000",
  "#000033",
  "#000066",
  "#000099",
  "#0000CC",
  "#0000FF",
  "#003300",
  "#003333",
  "#003366",
  "#003399",
  "#0033CC",
  "#0033FF",
  "#006600",
  "#006633",
  "#006666",
  "#006699",
  "#0066CC",
  "#0066FF",
  "#009900",
  "#009933",
  "#009966",
  "#009999",
  "#0099CC",
  "#0099FF",
  "#00CC00",
  "#00CC33",
  "#00CC66",
  "#00CC99",
  "#00CCCC",
  "#00CCFF",
  "#00FF00",
  "#00FF33",
  "#00FF66",
  "#00FF99",
  "#00FFCC",
  "#00FFFF",
  "#330000",
  "#330033",
  "#330066",
  "#330099",
  "#3300CC",
  "#3300FF",
  "#333300",
  "#333333",
  "#333366",
  "#333399",
  "#3333CC",
  "#3333FF",
  "#336600",
  "#336633",
  "#336666",
  "#336699",
  "#3366CC",
  "#3366FF",
  "#339900",
  "#339933",
  "#339966",
  "#339999",
  "#3399CC",
  "#3399FF",
  "#33CC00",
  "#33CC33",
  "#33CC66",
  "#33CC99",
  "#33CCCC",
  "#33CCFF",
  "#33FF00",
  "#33FF33",
  "#33FF66",
  "#33FF99",
  "#33FFCC",
  "#33FFFF",
  "#660000",
  "#660033",
  "#660066",
  "#660099",
  "#6600CC",
  "#6600FF",
  "#663300",
  "#663333",
  "#663366",
  "#663399",
  "#6633CC",
  "#6633FF",
  "#666600",
  "#666633",
  "#666666",
  "#666699",
  "#6666CC",
  "#6666FF",
  "#669900",
  "#669933",
  "#669966",
  "#669999",
  "#6699CC",
  "#6699FF",
  "#66CC00",
  "#66CC33",
  "#66CC66",
  "#66CC99",
  "#66CCCC",
  "#66CCFF",
  "#66FF00",
  "#66FF33",
  "#66FF66",
  "#66FF99",
  "#66FFCC",
  "#66FFFF",
  "#990000",
  "#990033",
  "#990066",
  "#990099",
  "#9900CC",
  "#9900FF",
  "#993300",
  "#993333",
  "#993366",
  "#993399",
  "#9933CC",
  "#9933FF",
  "#996600",
  "#996633",
  "#996666",
  "#996699",
  "#9966CC",
  "#9966FF",
  "#999900",
  "#999933",
  "#999966",
  "#999999",
  "#9999CC",
  "#9999FF",
  "#99CC00",
  "#99CC33",
  "#99CC66",
  "#99CC99",
  "#99CCCC",
  "#99CCFF",
  "#99FF00",
  "#99FF33",
  "#99FF66",
  "#99FF99",
  "#99FFCC",
  "#99FFFF",
  "#CC0000",
  "#CC0033",
  "#CC0066",
  "#CC0099",
  "#CC00CC",
  "#CC00FF",
  "#CC3300",
  "#CC3333",
  "#CC3366",
  "#CC3399",
  "#CC33CC",
  "#CC33FF",
  "#CC6600",
  "#CC6633",
  "#CC6666",
  "#CC6699",
  "#CC66CC",
  "#CC66FF",
  "#CC9900",
  "#CC9933",
  "#CC9966",
  "#CC9999",
  "#CC99CC",
  "#CC99FF",
  "#CCCC00",
  "#CCCC33",
  "#CCCC66",
  "#CCCC99",
  "#CCCCCC",
  "#CCCCFF",
  "#CCFF00",
  "#CCFF33",
  "#CCFF66",
  "#CCFF99",
  "#CCFFCC",
  "#CCFFFF",
  "#FF0000",
  "#FF0033",
  "#FF0066",
  "#FF0099",
  "#FF00CC",
  "#FF00FF",
  "#FF3300",
  "#FF3333",
  "#FF3366",
  "#FF3399",
  "#FF33CC",
  "#FF33FF",
  "#FF6600",
  "#FF6633",
  "#FF6666",
  "#FF6699",
  "#FF66CC",
  "#FF66FF",
  "#FF9900",
  "#FF9933",
  "#FF9966",
  "#FF9999",
  "#FF99CC",
  "#FF99FF",
  "#FFCC00",
  "#FFCC33",
  "#FFCC66",
  "#FFCC99",
  "#FFCCCC",
  "#FFCCFF",
  "#FFFF00",
  "#FFFF33",
  "#FFFF66",
  "#FFFF99",
  "#FFFFCC",
  "#FFFFFF"
);

// Map to look up spells
Interface.prototype.SPELLS = new Map();
Interface.prototype.SPELLS.set(0, {
  name: "Cure Burning",
  description: "Cures Burning Condition",
  icon: { x: 0, y: 0 },
  words: "exana flam",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(1, {
  name: "Explosion",
  description: "Causes an Explosion",
  icon: { x: 0, y: 4 },
  words: "exevo mas flam",
  vocations: ["sorcerer"],
});
Interface.prototype.SPELLS.set(2, {
  name: "Healing",
  description: "Heal Damage",
  icon: { x: 2, y: 0 },
  words: "exura",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(3, {
  name: "Invisibilis",
  description: "Turn Invisible for 60s.",
  icon: { x: 10, y: 7 },
  words: "utana vid",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(4, {
  name: "Morph",
  description: "Morphs into a Creature",
  icon: { x: 9, y: 9 },
  words: "utevo res ina",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(5, {
  name: "Parva Lux",
  description: "Surround yourself by light",
  icon: { x: 8, y: 9 },
  words: "utevo lux",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(6, {
  name: "Death Strike",
  description: "Strike with death",
  icon: { x: 1, y: 3 },
  words: "exori mort",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(7, {
  name: "Hearthstone",
  description: "Teleport yourself to the temple.",
  icon: { x: 3, y: 3 },
  words: "exani tera",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(8, {
  name: "Velocitas",
  description: "Increases your movement speed",
  icon: { x: 4, y: 8 },
  words: "utani hur",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(9, {
  name: "Levitate",
  description: "Move up or down a mountain",
  icon: { x: 4, y: 10 },
  words: "exani hur",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(10, {
  name: "Intense Healing",
  description: "Heals more damage",
  icon: { x: 2, y: 1 },
  words: "exura gran",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(11, {
  name: "Ultimate Healing",
  description: "Heals all damage",
  icon: { x: 2, y: 2 },
  words: "exura vita",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(12, {
  name: "Antidote",
  description: "Cures poison",
  icon: { x: 1, y: 0 },
  words: "exana pox",
  vocations: ["sorcerer", "druid", "paladin", "knight"],
});
Interface.prototype.SPELLS.set(13, {
  name: "Energy Strike",
  description: "Strike with energy",
  icon: { x: 5, y: 3 },
  words: "exori vis",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(14, {
  name: "Flame Strike",
  description: "Strike with fire",
  icon: { x: 1, y: 2 },
  words: "exori flam",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(15, {
  name: "Fire Wave",
  description: "Wave of fire",
  icon: { x: 2, y: 2 },
  words: "exevo flam hur",
  vocations: ["sorcerer"],
});
Interface.prototype.SPELLS.set(16, {
  name: "Energy Beam",
  description: "Beam of energy",
  icon: { x: 2, y: 4 },
  words: "exevo vis lux",
  vocations: ["sorcerer"],
});
Interface.prototype.SPELLS.set(17, {
  name: "Strong Haste",
  description: "Run even faster",
  icon: { x: 5, y: 8 },
  words: "utani gran hur",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(18, {
  name: "Magic Shield",
  description: "Protect yourself with mana",
  icon: { x: 3, y: 10 },
  words: "utamo vita",
  vocations: ["sorcerer", "druid"],
});
Interface.prototype.SPELLS.set(19, {
  name: "Great Light",
  description: "Greatly illuminates the area",
  icon: { x: 7, y: 9 },
  words: "utevo gran lux",
  vocations: ["sorcerer", "druid"],
});

Interface.prototype.getSpell = function (id) {
  /*
   * Interface.getSpell
   * Returns client-side spell definitions for a spell with identifier id
   */

  if (!this.SPELLS.has(id)) {
    return new Object({
      name: "Unknown",
      description: "Unknown",
      icon: { x: 6, y: 10 },
    });
  }

  return this.SPELLS.get(id);
};

Interface.prototype.updateSpells = function (sid) {
  /*
   * Interface.updateSpells
   * Updates information on spells that was returned from server
   */

  gameClient.player.spellbook.addSpell(sid);
};

Interface.prototype.__openKeyRing = function (version) {
  gameClient.send(new KeyringOpenPacket());
};

Interface.prototype.enableVersionFeatures = function (version) {
  /*
   * Interface.enableVersionFeatures
   * Enables or disables version-specific features
   */

  // Disable addons when version is below 1000
  if (version <= 1000) {
    this.modalManager.get("outfit-modal").disableAddons();
  }
};

Interface.prototype.getHexColor = function (index) {
  /*
   * Function Interface.getHexColor
   * Returns the color from an identifier
   */

  // If invalid return white
  if (index < 0 || index >= this.WEBCOLORS.length) {
    return "#FFFFFF";
  }

  // Otherwise return the index
  return this.WEBCOLORS[index];
};

Interface.prototype.getAccountDetails = function () {
  /*
   * Function Interface.getACCountDetails
   * Returns the aCCount details from the DOM
   */

  return new Object({
    account: document.getElementById("user-username").value.trim(),
    password: document.getElementById("user-password").value.trim(),
  });
};

Interface.prototype.enterGame = function (requestFullscreen) {
  /*
   * Function Interface.enterGame
   * Callback fired when the enter game button is clicked
   */

  // Block if the assets are not yet loaded
  if (!this.areAssetsLoaded()) {
    return this.modalManager.open("floater-connecting", "Loading Tibia assets from server. Please wait...");
  }

  if (requestFullscreen) {
    this.requestFullScreen();
  }

  // Show the connecting message
  this.modalManager.open("floater-connecting", "Connecting to Gameworld...");

  // Connect with the connection details
  gameClient.connect();
};

Interface.prototype.reset = function () {
  /*
   * Function Interface.reset
   * Resets the entire game interface to a clean state
   */

  // Clean up the interface
  this.screenElementManager.clear();

  this.windowManager.closeAll();

  // Show the game interface instead of the login box
  this.hideGameInterface();
};

Interface.prototype.enableEnterGame = function () {
  /*
   * Function Interface.enableEnterGame
   * Enables the enter game button if the sprites and data files are loaded
   */

  // Both are loaded: allow the character to enter the game
  if (this.areAssetsLoaded()) {
    document.getElementById("enter-game").removeAttribute("disabled");
  }
};

Interface.prototype.loadAssetsDelegator = function () {
  /*
   * Function Interface.loadAssetsDelegator
   * Delegates the clik event to a hidden file selector HTML element: this way a button can select files
   */

  document.getElementById("asset-selector").click();
};

Interface.prototype.areAssetsLoaded = function () {
  /*
   * Function Interface.areAssetsLoaded
   * Returns true if both the assets (sprites & objects) are loaded
   */

  return this.state.spritesLoaded && this.state.dataLoaded;
};

Interface.prototype.showModal = function (id) {
  /*
   * Function Interface.showModal
   * Delegates call to the modal manager to show a modal window with a particular identifier
   */

  this.modalManager.open(id);
};

Interface.prototype.toggleWindow = function (which) {
  /*
   * Function InterfaceManager.toggleWindow
   * Opens or closes an interface window
   */

  this.windowManager.getWindow(which).toggle();
};

Interface.prototype.setCancelMessage = function (message) {
  /*
   * Function Interface.setCancelMessage
   * Delegates to the notification manager to set a cancel message
   */

  this.notificationManager.setCancelMessage(message);
};

Interface.prototype.hideGameInterface = function () {
  /*
   * Function Interface.hideGameInterface
   * Hides the game interface and shows the login interface
   */

  // Sets the login screen to hidden and opens the game interface
  document.body.classList.remove("game-active");
  document.getElementById("login-wrapper").style.display = "flex";
  document.getElementById("game-wrapper").style.display = "none";

  window.onresize();
};

Interface.prototype.showGameInterface = function () {
  /*
   * Function Interface.showGameInterface
   * Shows the game interface and hides the login interface
   */

  // Sets the login screen to hidden and opens the game interface
  document.body.classList.add("game-active");
  document.getElementById("login-wrapper").style.display = "none";
  document.getElementById("game-wrapper").style.display = "flex";

  window.onresize();
};

Interface.prototype.loadGameFiles = function (event) {
  /*
   * Function Interface.loadGameFiles
   * Wrapper to load the Tibia .dat and .spr assets files from disk
   */

  // Go over the list of files
  Array.from(event.target.files).forEach(function (file) {
    console.debug("Loading asset %s from disk.".format(file.name));

    // Open a new filereader
    let reader = new FileReader();

    if (file.name === "Tibia.dat") {
      reader.addEventListener(
        "load",
        gameClient.dataObjects.load.bind(gameClient.dataObjects, file.name)
      );
    } else if (file.name === "Tibia.spr") {
      reader.addEventListener(
        "load",
        gameClient.spriteBuffer.load.bind(gameClient.spriteBuffer, file.name)
      );
    } else {
      return console.error(
        "Unknown asset file %s was selected.".format(file.name)
      );
    }

    // Read as a buffer for easy parsing
    return reader.readAsArrayBuffer(file);
  });
};

Interface.prototype.loadAssetCallback = function (which, filename) {
  /*
   * Function Interface.loadAssetCallback
   * Callback fired when .dat or .spr files are loaded
   */

  if (which === "sprite") {
    this.state.spritesLoaded = true;
    document.getElementById("sprites-loaded").style.color = "green";
    document.getElementById("sprites-loaded").innerHTML =
      filename + " (" + gameClient.spriteBuffer.__version + ")";
  } else if (which === "data") {
    this.state.dataLoaded = true;
    document.getElementById("data-loaded").style.color = "green";
    document.getElementById("data-loaded").innerHTML =
      filename + " (" + gameClient.dataObjects.__version + ")";
  }
};

Interface.prototype.requestFullScreen = function () {
  /*
   * Function Interface.requestFullScreen
   * Requests the game to go fullscreen in the browser
   */

  // The document root fills the entire application window.
  let element = document.documentElement;

  // Supports current browsers and older browser prefixes.
  let requestMethod =
    element.requestFullscreen ||
    element.requestFullScreen ||
    element.webkitRequestFullscreen ||
    element.webkitRequestFullScreen ||
    element.mozRequestFullScreen ||
    element.msRequestFullScreen;

  if (requestMethod && !document.fullscreenElement) {
    let request = requestMethod.call(element);

    // Fullscreen can be rejected by a browser policy; the login itself should
    // still continue normally in that case.
    if (request && request.catch) {
      return request.catch(function () { });
    }

    return request;
  }
};

Interface.prototype.isRaining = function () {
  /*
   * Function Interface.isRaining
   * Returns true if the game is raining
   */

  return gameClient.renderer.weatherCanvas.isRaining();
};
Interface.prototype.getSpriteScaling = function () {
  /*
   * Function Canvas.getSpriteScaling
   * Returns the sprite scaling of the displayed game canvas.
   */

  // Use the effective CSS size. The chat resizer can change the desktop canvas
  // scale independently of the browser viewport.
  let canvas = gameClient.renderer.screen.canvas;
  let rect = canvas.getBoundingClientRect();
  return 32 * (rect.width / canvas.width);
};

Interface.prototype.getSpriteScalingVector = function () {
  /*
   * Function Interface.getSpriteScalingVector
   * Returns the sprite scaling in X and Y directions
   * Uses the effective CSS dimensions, which may be changed by the chat resizer.
   */

  let canvas = gameClient.renderer.screen.canvas;
  let rect = canvas.getBoundingClientRect();

  return {
    x: 32 * (rect.width / canvas.width),
    y: 32 * (rect.height / canvas.height)
  };
};

Interface.prototype.addAvailableResolutions = function () {
  /*
   * Function Interface.addAvailableResolutions
   * Adds all available resolutions to the option list without restrictive viewport breaks
   */

  let selectElement = document.getElementById("resolution");

  // Complete list of available game resolutions (from 1x up to 4x Full HD)
  let resolutions = new Array(
    { width: 480, height: 352, label: "1x Oryginalna" },
    { width: 640, height: 480, label: "1.33x Klasyczna" },
    { width: 720, height: 528, label: "1.5x" },
    { width: 800, height: 600, label: "1.66x SVGA" },
    { width: 960, height: 704, label: "2x Domyślna" },
    { width: 1024, height: 768, label: "2.13x XGA" },
    { width: 1152, height: 864, label: "2.4x XGA+" },
    { width: 1280, height: 960, label: "2.66x SXGA" },
    { width: 1440, height: 1056, label: "3x" },
    { width: 1600, height: 1200, label: "3.33x UXGA" },
    { width: 1920, height: 1080, label: "4x Full HD" }
  );

  let nodes = new Array();
  let bestIndex = 0;

  let viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  let viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  for (let i = 0; i < resolutions.length; i++) {
    let resolution = resolutions[i];
    nodes.push(this.__createResolutionNode(resolution));

    // Determine default best fitting resolution without cropping UI elements
    if (viewportWidth - 340 >= resolution.width && viewportHeight - 160 >= resolution.height) {
      bestIndex = i;
    }
  }

  selectElement.replaceChildren(...nodes);

  // Restore saved resolution from settings if it exists
  try {
    let savedSettings = localStorage.getItem("settings");
    if (savedSettings) {
      let parsed = JSON.parse(savedSettings);
      if (parsed && parsed["resolution"]) {
        for (let i = 0; i < selectElement.options.length; i++) {
          if (selectElement.options[i].value == parsed["resolution"]) {
            selectElement.selectedIndex = i;
            return;
          }
        }
      }
    }
  } catch (e) {}

  selectElement.selectedIndex = bestIndex;
};

Interface.prototype.getResolutionScale = function () {
  /*
   * Function Interface.getResolutionScale
   * Returns the required scale of the game screen canvas
   */

  // Fixed resolution is requested: divide the requested with by the minimum width to get the scale
  if (document.getElementById("enable-resolution").checked) {
    return (
      Number(document.getElementById("resolution").value) /
      this.SCREEN_WIDTH_MIN
    );
  }

  // Dynamic resolution is requested (subtract interface elements)
  let scaleX = (window.visualViewport.width - 360) / this.SCREEN_WIDTH_MIN;
  let scaleY = (window.visualViewport.height - 188) / this.SCREEN_HEIGHT_MIN;

  // Limit the scale to the minimum or maximum of the available width / height
  return Math.max(1, Math.min(scaleX, scaleY));
};

Interface.prototype.__handleStackResize = function () {
  for (let stack of Array.from(document.getElementsByClassName("column"))) {
    if (stack.children.length === 0) return;
    let last = stack.children[stack.children.length - 1];

    // Close windows when resizing
    if (last.className === "prototype window") {
      var bounding = last.getBoundingClientRect();
      if (bounding.bottom >= window.visualViewport.height) {
        gameClient.player
          .getContainer(Number(last.getAttribute("containerIndex")))
          .close();
      }
    }
  }
};

Interface.prototype.handleResize = function (event) {
  /*
   * Function Interface.handleResize
   * Closes windows in the column if the window is resized
   */

  // Invalidate mobile scale cache
  this.__cachedMobileScale = null;

  // Get and set the resolution scale
  gameClient.renderer.screen.setScale(this.getResolutionScale());

  // We should update the wrapper size explicitly too
  let { width, height } =
    gameClient.renderer.screen.canvas.getBoundingClientRect();

  this.setElementDimensions(
    document.getElementById("canvas-id"),
    width,
    height
  );
  this.__handleStackResize();
};

Interface.prototype.setElementDimensions = function (elem, width, height) {
  /*
   * function Interface.setElementDimensions
   * Callback fired when the browser window is resized: make sure to keep the aspect ratio
   */

  // Update the dimensions in pixels
  elem.style.width = "%spx".format(Math.round(width));
  elem.style.height = "%spx".format(Math.round(height));
};

Interface.prototype.closeClient = function (event) {
  /*
   * Function GameClient.closeClient
   * Callback fired when the client is closed.
   */

  // Make sure to save the minimap
  gameClient.renderer.minimap.save();

  // Save the state of the settings to localstorage
  this.settings.saveState();
};

Interface.prototype.sendLogout = function () {
  /*
   * Function Interface.sendLogout
   * Writes a logout request to the server
   */

  // Confirm and write logout packet when confirming
  this.modalManager.open("confirm-modal", function () {
    // Block no logout zones
    if (gameClient.player.getTile().isNoLogoutZone()) {
      return gameClient.interface.setCancelMessage("You may not logout here.");
    }

    gameClient.interface.soundManager.stopAll();
    gameClient.send(new LogoutPacket());
  });
};

Interface.prototype.__createResolutionNode = function ({ width, height, label }) {
  /*
   * Function Interface.__createResolutionNode
   * Creates a select option for a particular game screen resolution (width, height)
   */

  // Only save the width as a value: we can calculate the scale from it anyway
  let optionElement = document.createElement("option");
  if (label) {
    optionElement.text = "%s × %s (%s)".format(width, height, label);
  } else {
    optionElement.text = "%s × %s".format(width, height);
  }
  optionElement.value = width;

  return optionElement;
};

Interface.prototype.__handleVisibiliyChange = function (event) {
  /*
   * Function Interface.handleVisibiliyChange
   * Callback fired when the window is hidden
   */

  // Must be connected to the gameserver
  if (!gameClient.networkManager.isConnected()) {
    return;
  }

  // Disable the keyboard when tabbing out: reset all active keys to prevent "hanging"
  gameClient.keyboard.setInactive();

  return gameClient.renderer.__handleVisibiliyChange(event);
};

Interface.prototype.__handleResizeWindow = function () {
  /*
   * Function Interface.__handleResizeWindow
   * Called when the browser window is resized
   */

  // When resizing we have to re-calculate the available gamescreen resolutions that fit within the window
  this.addAvailableResolutions();

  // Handle resizing of the gamescreen
  this.handleResize();
};

Interface.prototype.__closeClientConfirm = function (event) {
  /*
   * Function Interface.__closeClientConfirm
   * Asks the client to confirm the browser close when connected
   */

  // Request confirmation from the client
  if (gameClient.isConnected()) {
    return true;
  }

  return;
};

Interface.prototype.__enableListeners = function () {
  /*
   * Function Interface.__enableListeners
   * All configured event listeners for the DOM
   */

  // These are buttons that open windows
  document
    .getElementById("openSkills")
    .addEventListener("click", this.toggleWindow.bind(this, "skill-window"));
  document
    .getElementById("openBattle")
    .addEventListener("click", this.toggleWindow.bind(this, "battle-window"));
  document
    .getElementById("openQuests")
    .addEventListener("click", this.modalManager.open.bind(this.modalManager, "quest-log-modal"));
  document
    .getElementById("openFriends")
    .addEventListener("click", this.toggleWindow.bind(this, "friend-window"));

  // The logout button
  document
    .getElementById("logout-button")
    .addEventListener("click", this.sendLogout.bind(this));

  // The load asset button & delegator
  document
    .getElementById("load-assets")
    .addEventListener("click", this.loadAssetsDelegator);
  document
    .getElementById("asset-selector")
    .addEventListener("change", this.loadGameFiles.bind(this));
  document
    .getElementById("enter-game")
    .addEventListener("click", this.enterGame.bind(this));

  // Visibility change
  addEventListener("visibilitychange", this.__handleVisibiliyChange.bind(this));

  // Callback before the window is unloaded to close the client and terminate the client gracefully
  window.onbeforeunload = this.__closeClientConfirm.bind(this);
  window.onunload = this.closeClient.bind(this);
  window.onresize = this.__handleResizeWindow.bind(this);
};
