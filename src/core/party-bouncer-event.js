"use strict";

const fs = require("fs");
const path = require("path");
const Position = requireModule("utils/position");

const BOUNCER_CONFIG = {
  gate: {
    from: { x: 32514, y: 32357, z: 7 },
    to: { x: 32516, y: 32357, z: 7 }
  },
  queue: {
    from: { x: 32515, y: 32358, z: 7 },
    to: { x: 32515, y: 32362, z: 7 }
  },
  temporaryQueuePositions: [
    { x: 32515, y: 32363, z: 7 },
    { x: 32514, y: 32363, z: 7 },
    { x: 32516, y: 32363, z: 7 }
  ],
  npcNames: {
    first: "Różal",
    second: "Pudzian"
  },
  answerTimeoutMs: 20000,
  spinTimeoutMs: 8000,
  accessTimeoutMs: 15000,
  dialogueDelayMs: 700,
  retryDelayMs: 1800,
  requeueCooldownMs: 2000,
  requiredSpinTurns: 4
};

const TEXT = {
  en: {
    next: "Next! Step forward, please.",
    closed: "The club is closed right now.",
    closedSecond: "No entry. Please come back later.",
    payment: amount => "Entry costs " + amount + " gold. Let me check your coins.",
    paymentAccepted: "Everything checks out.",
    paymentDenied: "You do not have enough gold.",
    password: "Password?",
    questionWrong: "Wrong answer. Try once more!",
    passwordWrong: "That is not the password. One more try!",
    failed: "That is your second wrong answer.",
    failedSecond: "Back of the queue, please.",
    timeout: "Too slow. The control is over.",
    open: "Welcome to CYRK'S PARTY ZONE!",
    spin: "Show us a spin! Simply: DANCE!",
    spinAccepted: "Nice spin!",
    access: [
      ["That's the right answer!", "You may enter. Enjoy the party!"],
      ["Correct!", "Go on in and enjoy the party!"],
      ["That's right!", "You may enter. Have fun!"],
      ["You passed!", "The door is open. Welcome to the party!"]
    ],
    openAccess: "Come in and enjoy the party!",
    paymentAccess: "Payment accepted. You may enter!",
    spinAccess: "You passed. Go on in!",
    accessExpired: "Your entry pass expired. Please queue again.",
    gateDenied: "The bouncers have not cleared you to enter yet."
  },
  pl: {
    next: "Następny! Proszę podejść.",
    closed: "Klub jest teraz zamknięty.",
    closedSecond: "Nie ma wejścia. Zapraszamy później.",
    payment: amount => "Wejście kosztuje " + amount + " golda. Sprawdzam monety.",
    paymentAccepted: "Wszystko się zgadza.",
    paymentDenied: "Nie masz wystarczająco dużo pieniędzy.",
    password: "Hasło?",
    questionWrong: "Zła odpowiedź. Spróbuj jeszcze raz!",
    passwordWrong: "To nie jest właściwe hasło. Jeszcze jedna próba!",
    failed: "To druga błędna odpowiedź.",
    failedSecond: "Zapraszamy na koniec kolejki.",
    timeout: "Za wolno. Kontrola zakończona.",
    open: "Witamy w CYRK'S PARTY ZONE!",
    spin: "Pokaż nam Twoje ruchy! Po prostu tańcz!",
    spinAccepted: "Niezły obrót!",
    access: [
      ["Dobra odpowiedź!", "Możesz wchodzić. Miłej zabawy!"],
      ["Zgadza się!", "Wchodź i baw się dobrze!"],
      ["Kontrola zaliczona!", "Droga wolna, zapraszamy!"],
      ["Poprawna odpowiedź!", "Możesz wchodzić. Udanej imprezy!"]
    ],
    openAccess: "Wchodź i baw się dobrze!",
    paymentAccess: "Opłata przyjęta, zapraszamy!",
    spinAccess: "Zaliczone, możesz wchodzić!",
    accessExpired: "Przepustka wygasła. Ustaw się ponownie w kolejce.",
    gateDenied: "Bramkarze nie pozwolili Ci jeszcze wejść."
  }
};

const QUESTIONS = [
  {
    en: "Are you ready to party?",
    pl: "Czy jesteś gotowy na imprezę?",
    answers: [
      "yes", "of course", "i do", "tak", "jasne", "oczywiście",
      "jak najbardziej", "wiadomo", "pewka", "jacha", "najak"
    ]
  },
  {
    en: "Who is our guild leader?",
    pl: "Kto jest liderem naszej gildii?",
    answers: ["Grappler"]
  },
  {
    en: "What color is mana?",
    pl: "Jakiego koloru jest mana?",
    answers: ["blue", "niebieski", "niebieskiego", "niebieska"]
  },
  {
    en: "What is the name of the server we play on?",
    pl: "Jak nazywa się serwer, na którym gramy?",
    answers: ["Minibia"]
  }
];

const ATTENDANCE_MESSAGES = {
  en: {
    empty: [
      "You may enter. You will be the first one on the dance floor!",
      "You may enter. Be the first to get this party started!",
      "You may enter. The dance floor is waiting for its first guest!"
    ],
    one: [
      "You may enter. One player is already getting the party started!",
      "You may enter. Someone is already waiting for you on the dance floor!",
      "You may enter. One player is already partying inside!"
    ],
    small: [
      count => "You may enter. " + count + " players are already partying inside!",
      count => "You may enter. Join the " + count + " players already on the dance floor!",
      count => "You may enter. There are already " + count + " players in the club!"
    ],
    growing: [
      count => "You may enter. The party is heating up — " + count + " players are already inside!",
      count => "You may enter. It is getting lively — " + count + " players are already here!",
      count => "You may enter. Join the crowd of " + count + " players on the dance floor!"
    ],
    busy: [
      count => "You may enter. What a crowd! " + count + " players are already partying inside!",
      count => "You may enter. The club is buzzing with " + count + " players already inside!",
      count => "You may enter. The dance floor already has " + count + " players on it!"
    ],
    packed: [
      count => "You may enter. The roof is about to come off — " + count + " players are already inside!",
      count => "You may enter. It is packed — " + count + " players are already partying!",
      count => "You may enter. Join the huge party of " + count + " players inside!"
    ],
    milestone: count => "You may enter. We already have " + count + " players inside — this party is in full swing!"
  },
  pl: {
    empty: [
      "Możesz wchodzić. Będziesz pierwszy na parkiecie!",
      "Droga wolna. Jako pierwszy rozkręć tę imprezę!",
      "Wchodź! Sala czeka na pierwszego imprezowicza!"
    ],
    one: [
      "Możesz wchodzić. Jedna osoba już rozkręca imprezę!",
      "Droga wolna. Ktoś już czeka na Ciebie na parkiecie!",
      "Wchodź! Jedna osoba już bawi się w środku!"
    ],
    small: [
      count => "Możesz wchodzić. Frekwencja w środku: " + count + "!",
      count => "Droga wolna. Na parkiecie mamy już " + count + "!",
      count => "Wchodź! Klubowa ekipa liczy już " + count + "!"
    ],
    growing: [
      count => "Możesz wchodzić. Impreza się rozkręca — frekwencja: " + count + "!",
      count => "Droga wolna. Robi się gorąco — na sali mamy już " + count + "!",
      count => "Wchodź! Klubowa ekipa liczy już " + count + "!"
    ],
    busy: [
      count => "Możesz wchodzić. Ale dziś tłok! Frekwencja: " + count + "!",
      count => "Droga wolna. Klub pęka w szwach — mamy już " + count + "!",
      count => "Wchodź! Parkietowa ekipa liczy już " + count + "!"
    ],
    packed: [
      count => "Możesz wchodzić. Dach zaraz odleci — frekwencja: " + count + "!",
      count => "Droga wolna. Ale tłum! Mamy już " + count + "!",
      count => "Wchodź! Wielka impreza trwa — na sali mamy już " + count + "!"
    ],
    milestone: count => "Możesz wchodzić. Mamy już " + count + " na sali — impreza idzie pełną parą!"
  }
};

const PartyBouncerEvent = function (creatureHandler, options) {
  options = options || {};
  this.__creatureHandler = creatureHandler;
  this.__now = options.now || Date.now;
  this.__random = options.random || Math.random;
  this.__settingsPath = options.settingsPath === false
    ? null
    : (options.settingsPath || path.resolve(
      process.cwd(), "data", CONFIG.SERVER.CLIENT_VERSION.toString(), "bouncers.json"
    ));
  this.__settings = this.__loadSettings();
  this.__queue = [];
  this.__active = null;
  this.__invitedPlayer = null;
  this.__cooldowns = new WeakMap();
  this.__mustLeaveQueue = new WeakSet();
  this.__gateMessageCooldowns = new WeakMap();
  this.__lastQuestionIndex = null;
};

PartyBouncerEvent.prototype.getConfig = function () {
  return BOUNCER_CONFIG;
};

PartyBouncerEvent.prototype.__loadSettings = function () {
  let settings = { mode: "open", password: "", payment: 0 };

  if (this.__settingsPath === null || !fs.existsSync(this.__settingsPath)) {
    return settings;
  }

  try {
    let stored = JSON.parse(fs.readFileSync(this.__settingsPath, "utf8"));
    if (["open", "password", "challenge", "payment", "closed"].includes(stored.mode)) {
      settings.mode = stored.mode;
    }
    settings.password = typeof stored.password === "string" ? stored.password : "";
    settings.payment = Number.isInteger(stored.payment) && stored.payment >= 0 ? stored.payment : 0;
  } catch (error) {
    console.error("Could not load party bouncer settings:", error.message);
  }

  return settings;
};

PartyBouncerEvent.prototype.__saveSettings = function () {
  if (this.__settingsPath === null) {
    return true;
  }

  try {
    fs.writeFileSync(this.__settingsPath, JSON.stringify(this.__settings, null, 2) + "\n", "utf8");
    return true;
  } catch (error) {
    console.error("Could not save party bouncer settings:", error.message);
    return false;
  }
};

PartyBouncerEvent.prototype.setMode = function (mode, value) {
  mode = String(mode || "").toLowerCase();

  if (!["open", "password", "challenge", "payment", "closed"].includes(mode)) {
    return { ok: false, message: "Usage: /bouncers open, password <text>, challenge, payment <amount>, closed or status." };
  }

  if (mode === "password") {
    value = String(value || "").trim();
    if (value.length === 0) {
      return { ok: false, message: "Usage: /bouncers password <text>." };
    }
    this.__settings.password = value;
  }

  if (mode === "payment") {
    value = Number(value);
    if (!Number.isInteger(value) || value < 0 || value > 100000000) {
      return { ok: false, message: "Payment must be a whole number from 0 to 100000000 gold." };
    }
    this.__settings.payment = value;
  }

  this.__settings.mode = mode;
  if (!this.__saveSettings()) {
    return { ok: false, message: "The mode changed in memory, but could not be saved." };
  }

  return { ok: true, message: "Bouncers mode: " + mode + (mode === "payment" ? " (" + value + " gold)" : "") + "." };
};

PartyBouncerEvent.prototype.setPlayerLanguage = function (player, language) {
  language = String(language || "").toLowerCase();
  if (!["pl", "en", "auto"].includes(language)) {
    return { ok: false, message: "Usage: /bouncers language pl, en or auto." };
  }

  if (language === "auto") {
    delete player.__bouncerLanguageOverride;
  } else {
    player.__bouncerLanguageOverride = language;
  }

  return { ok: true, message: "Your bouncer language is " + this.getLanguage(player) + " (" + language + ")." };
};

PartyBouncerEvent.prototype.getLanguage = function (player) {
  if (player && (player.__bouncerLanguageOverride === "pl" || player.__bouncerLanguageOverride === "en")) {
    return player.__bouncerLanguageOverride;
  }
  return player && player.__countryCode === "PL" ? "pl" : "en";
};

PartyBouncerEvent.prototype.getStatus = function (player) {
  let details = "Bouncers: " + this.__settings.mode;
  if (this.__settings.mode === "payment") {
    details += " (" + this.__settings.payment + " gold)";
  }
  details += ", queue: " + this.__queue.length;
  if (player) {
    details += ", your country: " + (player.__countryCode || "unknown")
      + ", language: " + this.getLanguage(player)
      + ", client: " + (player.__isMobileClient ? "mobile" : "desktop");
  }
  return details + ".";
};

PartyBouncerEvent.prototype.__normalize = function (value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
};

PartyBouncerEvent.prototype.__isQueuePosition = function (position) {
  return position && position.z === BOUNCER_CONFIG.queue.from.z
    && position.x === BOUNCER_CONFIG.queue.from.x
    && position.y >= BOUNCER_CONFIG.queue.from.y
    && position.y <= BOUNCER_CONFIG.queue.to.y;
};

PartyBouncerEvent.prototype.__isControlPosition = function (position) {
  return position && position.z === BOUNCER_CONFIG.queue.from.z
    && position.x === BOUNCER_CONFIG.queue.from.x
    && position.y >= BOUNCER_CONFIG.queue.from.y
    && position.y <= BOUNCER_CONFIG.queue.from.y + 1;
};

PartyBouncerEvent.prototype.__isGatePosition = function (position) {
  return position && position.z === BOUNCER_CONFIG.gate.from.z
    && position.y === BOUNCER_CONFIG.gate.from.y
    && position.x >= BOUNCER_CONFIG.gate.from.x
    && position.x <= BOUNCER_CONFIG.gate.to.x;
};

PartyBouncerEvent.prototype.__isEntranceApproachPosition = function (position) {
  return position && position.z === BOUNCER_CONFIG.gate.from.z
    && position.y === BOUNCER_CONFIG.queue.from.y
    && position.x >= BOUNCER_CONFIG.gate.from.x
    && position.x <= BOUNCER_CONFIG.gate.to.x;
};

PartyBouncerEvent.prototype.__isPlayerConnected = function (player) {
  return player && this.__creatureHandler.getConnectedPlayers
    && Array.from(this.__creatureHandler.getConnectedPlayers().values()).includes(player);
};

PartyBouncerEvent.prototype.__findNPC = function (name) {
  let result = null;
  if (!this.__creatureHandler.__creatureMap) {
    return null;
  }
  this.__creatureHandler.__creatureMap.forEach(function (creature) {
    if (result || !creature || (creature.isPlayer && creature.isPlayer())) {
      return;
    }
    let creatureName = creature.getProperty
      ? creature.getProperty(CONST.PROPERTIES.NAME)
      : creature.name;
    if (String(creatureName || "").toLowerCase() === name.toLowerCase()) {
      result = creature;
    }
  });
  return result;
};

PartyBouncerEvent.prototype.__faceBouncersSouth = function () {
  Object.keys(BOUNCER_CONFIG.npcNames).forEach(function (which) {
    let npc = this.__findNPC(BOUNCER_CONFIG.npcNames[which]);
    if (!npc || typeof npc.setDirection !== "function") return;
    if (typeof npc.getProperty !== "function"
      || npc.getProperty(CONST.PROPERTIES.DIRECTION) !== CONST.DIRECTION.SOUTH) {
      npc.setDirection(CONST.DIRECTION.SOUTH);
    }
  }, this);
};

PartyBouncerEvent.prototype.__faceBouncersTo = function (player) {
  if (!player || !player.position) return;
  Object.keys(BOUNCER_CONFIG.npcNames).forEach(function (which) {
    let npc = this.__findNPC(BOUNCER_CONFIG.npcNames[which]);
    if (npc && typeof npc.faceCreature === "function") {
      npc.faceCreature(player);
    }
  }, this);
};

PartyBouncerEvent.prototype.__clearActive = function () {
  this.__active = null;
  this.__invitedPlayer = null;
  this.__faceBouncersSouth();
};

PartyBouncerEvent.prototype.__say = function (which, player, message) {
  this.__faceBouncersTo(player);
  let npc = this.__findNPC(BOUNCER_CONFIG.npcNames[which]);
  if (npc && npc.speechHandler && typeof npc.speechHandler.privateSay === "function") {
    npc.speechHandler.privateSay(player, message, CONST.COLOR.LIGHTBLUE);
    return;
  }
  if (player && typeof player.sendCancelMessage === "function") {
    player.sendCancelMessage(BOUNCER_CONFIG.npcNames[which] + ": " + message);
  }
};

PartyBouncerEvent.prototype.__getText = function (player) {
  return TEXT[this.getLanguage(player)];
};

PartyBouncerEvent.prototype.__refreshQueue = function () {
  let now = this.__now();
  this.__queue = this.__queue.filter(function (player) {
    if (!this.__isPlayerConnected(player)) {
      return false;
    }
    if (this.__active && this.__active.player === player) {
      return true;
    }
    return this.__isQueuePosition(player.position);
  }, this);

  let additions = [];
  if (this.__creatureHandler.getConnectedPlayers) {
    this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
      if (!this.__isQueuePosition(player.position)) {
        this.__mustLeaveQueue.delete(player);
      }
      if (!this.__isQueuePosition(player.position) || this.__queue.includes(player)) {
        return;
      }
      if (this.__mustLeaveQueue.has(player)) {
        return;
      }
      if ((this.__cooldowns.get(player) || 0) > now) {
        return;
      }
      additions.push(player);
    }, this);
  }
  additions.sort(function (left, right) {
    return left.position.y - right.position.y;
  });
  this.__queue.push.apply(this.__queue, additions);
};

PartyBouncerEvent.prototype.__isFreePosition = function (position, player) {
  let tile = gameServer.world.getTileFromWorldPosition(position);
  if (tile === null || tile.id === 0) {
    return false;
  }
  if (player.position && player.position.equals(position)) {
    return true;
  }
  return !tile.isOccupiedCharacters || !tile.isOccupiedCharacters();
};

PartyBouncerEvent.prototype.__teleportQueuePlayer = function (player, position) {
  if (!this.__isFreePosition(position, player)) {
    return false;
  }
  return this.__creatureHandler.teleportCreature(player, position, {
    ignoreFloorLava: true,
    ignoreBomberman: true
  });
};

PartyBouncerEvent.prototype.__startNext = function () {
  if (this.__active !== null || this.__queue.length === 0) {
    if (this.__queue.length === 0) this.__invitedPlayer = null;
    return;
  }
  let player = this.__queue[0];
  if (!this.__isControlPosition(player.position)) {
    if (this.__invitedPlayer !== player) {
      this.__invitedPlayer = player;
      this.__say("first", player, this.__getText(player).next);
    }
    return;
  }

  this.__invitedPlayer = null;

  let now = this.__now();
  let text = this.__getText(player);
  this.__active = {
    player: player,
    stage: "starting",
    attempts: 0,
    nextAt: now + BOUNCER_CONFIG.dialogueDelayMs,
    expiresAt: 0,
    question: null,
    spinDirections: new Set()
  };

  switch (this.__settings.mode) {
    case "closed":
      this.__say("first", player, text.closed);
      this.__active.stage = "closed_pending";
      break;
    case "open":
      this.__say("first", player, text.open);
      this.__active.stage = "open_pending";
      break;
    case "payment":
      this.__say("first", player, text.payment(this.__settings.payment));
      this.__active.stage = "payment_pending";
      break;
    case "password":
      this.__say("first", player, text.password);
      this.__active.stage = "await_password";
      this.__active.expiresAt = now + BOUNCER_CONFIG.answerTimeoutMs;
      break;
    case "challenge":
      this.__startChallenge();
      break;
  }
};

PartyBouncerEvent.prototype.__startChallenge = function () {
  let active = this.__active;
  let player = active.player;
  let text = this.__getText(player);
  let canDance = player.__isMobileClient !== true;
  let useDance = canDance && this.__random() < 0.25;

  if (useDance) {
    active.stage = "await_spin";
    active.expiresAt = this.__now() + BOUNCER_CONFIG.spinTimeoutMs;
    active.spinDirections = new Set();
    this.__say("first", player, text.spin);
    return;
  }

  active.question = this.__selectQuestion();
  active.stage = "await_answer";
  active.expiresAt = this.__now() + BOUNCER_CONFIG.answerTimeoutMs;
  this.__say("first", player, active.question[this.getLanguage(player)]);
};

PartyBouncerEvent.prototype.__selectQuestion = function () {
  let available = QUESTIONS
    .map((question, index) => ({ question, index }))
    .filter(entry => entry.index !== this.__lastQuestionIndex);
  let selected = available[Math.floor(this.__random() * available.length)];

  this.__lastQuestionIndex = selected.index;
  return selected.question;
};

PartyBouncerEvent.prototype.__getPartyPlayerCount = function () {
  if (typeof this.__creatureHandler.getPartyRadioPlayerCount !== "function") {
    return 0;
  }

  let count = Number(this.__creatureHandler.getPartyRadioPlayerCount());
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
};

PartyBouncerEvent.prototype.__formatPolishPlayerCount = function (count) {
  if (count === 1) {
    return "1 osoba";
  }

  let lastDigit = count % 10;
  let lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return count + " osoby";
  }

  return count + " osób";
};

PartyBouncerEvent.prototype.__getAttendanceMessage = function (player) {
  let count = this.__getPartyPlayerCount();
  let language = this.getLanguage(player);
  let messages = ATTENDANCE_MESSAGES[language];

  if ([10, 20, 30].includes(count)) {
    let milestoneCount = language === "pl" ? this.__formatPolishPlayerCount(count) : count;
    return messages.milestone(milestoneCount);
  }

  let bucket = count === 0 ? "empty"
    : count === 1 ? "one"
      : count <= 5 ? "small"
        : count <= 10 ? "growing"
          : count <= 20 ? "busy"
            : "packed";
  let variants = messages[bucket];
  let variant = variants[Math.floor(this.__random() * variants.length)];

  if (typeof variant === "function") {
    let formattedCount = language === "pl" ? this.__formatPolishPlayerCount(count) : count;
    return variant(formattedCount);
  }

  return variant;
};

PartyBouncerEvent.prototype.__beginGrant = function (firstMessage, secondMessage) {
  this.__say("first", this.__active.player, firstMessage);
  this.__active.stage = "grant_pending";
  this.__active.secondMessage = secondMessage;
  this.__active.nextAt = this.__now() + BOUNCER_CONFIG.dialogueDelayMs;
};

PartyBouncerEvent.prototype.__grant = function () {
  let active = this.__active;
  this.__say("second", active.player, this.__getAttendanceMessage(active.player));
  active.stage = "authorized";
  active.expiresAt = this.__now() + BOUNCER_CONFIG.accessTimeoutMs;
};

PartyBouncerEvent.prototype.__failToBack = function (firstMessage) {
  this.__say("first", this.__active.player, firstMessage);
  this.__active.stage = "fail_pending";
  this.__active.nextAt = this.__now() + BOUNCER_CONFIG.dialogueDelayMs;
};

PartyBouncerEvent.prototype.__finishFailure = function () {
  let player = this.__active.player;
  this.__say("second", player, this.__getText(player).failedSecond);
  this.__clearActive();
  this.__cooldowns.set(player, this.__now() + BOUNCER_CONFIG.requeueCooldownMs);

  let index = this.__queue.indexOf(player);
  if (index !== -1) {
    this.__queue.splice(index, 1);
    this.__queue.push(player);
  }

  let temporary = BOUNCER_CONFIG.temporaryQueuePositions
    .map(position => Position.prototype.fromLiteral(position))
    .find(position => this.__isFreePosition(position, player));
  if (temporary) {
    this.__teleportQueuePlayer(player, temporary);
  }
};

PartyBouncerEvent.prototype.handleSpeech = function (player, message) {
  let active = this.__active;
  if (!active || active.player !== player) {
    return false;
  }

  let normalized = this.__normalize(message);
  let correct = false;
  let wrongMessage;

  if (active.stage === "await_answer") {
    correct = active.question.answers.some(answer => this.__normalize(answer) === normalized);
    wrongMessage = this.__getText(player).questionWrong;
  } else if (active.stage === "await_password") {
    correct = this.__normalize(this.__settings.password) === normalized;
    wrongMessage = this.__getText(player).passwordWrong;
  } else {
    return false;
  }

  if (correct) {
    if (this.__creatureHandler.partyAchievements) {
      this.__creatureHandler.partyAchievements.increment(player, "bouncerPasses", 1);
    }
    let pair = this.__getText(player).access.random();
    this.__beginGrant(pair[0], pair[1]);
    return true;
  }

  active.attempts++;
  if (active.attempts < 2) {
    this.__say("first", player, wrongMessage);
    active.expiresAt = this.__now() + BOUNCER_CONFIG.answerTimeoutMs;
    return true;
  }

  this.__failToBack(this.__getText(player).failed);
  return true;
};

PartyBouncerEvent.prototype.handleTurn = function (player, direction) {
  let active = this.__active;
  if (!active || active.player !== player || active.stage !== "await_spin") {
    return false;
  }
  if (player.__isMobileClient === true) {
    return false;
  }

  active.spinDirections.add(Number(direction));
  if (active.spinDirections.size >= BOUNCER_CONFIG.requiredSpinTurns) {
    let text = this.__getText(player);
    if (this.__creatureHandler.partyAchievements) {
      this.__creatureHandler.partyAchievements.increment(player, "bouncerPasses", 1);
    }
    this.__beginGrant(text.spinAccepted, text.spinAccess);
  }
  return true;
};

PartyBouncerEvent.prototype.handleDestination = function (player, position) {
  if (!player || !player.position || !position || position.z !== BOUNCER_CONFIG.gate.from.z) {
    return null;
  }

  let enteringGate = this.__isGatePosition(position) && player.position.y >= BOUNCER_CONFIG.queue.from.y;
  let crossingInside = player.position.y === BOUNCER_CONFIG.gate.from.y
    && position.y < BOUNCER_CONFIG.gate.from.y
    && position.x >= BOUNCER_CONFIG.gate.from.x
    && position.x <= BOUNCER_CONFIG.gate.to.x;

  if (!enteringGate && !crossingInside) {
    return null;
  }

  if (player.isGM && player.isGM()) {
    return true;
  }

  let authorized = this.__active
    && this.__active.player === player
    && this.__active.stage === "authorized"
    && this.__active.expiresAt > this.__now();

  if (authorized) {
    return true;
  }

  let now = this.__now();
  if ((this.__gateMessageCooldowns.get(player) || 0) <= now) {
    player.sendCancelMessage(this.__getText(player).gateDenied);
    this.__gateMessageCooldowns.set(player, now + 1500);
  }
  return false;
};

PartyBouncerEvent.prototype.handlePlayerMoved = function (player) {
  if (!this.__active || this.__active.player !== player) {
    return;
  }

  if (this.__active.stage === "authorized" && player.position.y < BOUNCER_CONFIG.gate.from.y) {
    this.__queue = this.__queue.filter(entry => entry !== player);
    this.__clearActive();
    this.__cooldowns.set(player, this.__now() + BOUNCER_CONFIG.requeueCooldownMs);
    return;
  }

  if (!this.__isQueuePosition(player.position)
    && !this.__isGatePosition(player.position)
    && !this.__isEntranceApproachPosition(player.position)) {
    this.__queue = this.__queue.filter(entry => entry !== player);
    this.__clearActive();
    this.__cooldowns.set(player, this.__now() + BOUNCER_CONFIG.requeueCooldownMs);
  }
};

PartyBouncerEvent.prototype.tick = function () {
  this.__refreshQueue();
  if (this.__active && !this.__isPlayerConnected(this.__active.player)) {
    this.__clearActive();
  }
  this.__startNext();

  let active = this.__active;
  if (!active) {
    if (!this.__invitedPlayer) this.__faceBouncersSouth();
    return;
  }

  let now = this.__now();
  let text = this.__getText(active.player);
  this.__faceBouncersTo(active.player);

  if (["await_answer", "await_password", "await_spin"].includes(active.stage) && now >= active.expiresAt) {
    return this.__failToBack(text.timeout);
  }

  if (active.stage === "authorized" && now >= active.expiresAt) {
    this.__say("second", active.player, text.accessExpired);
    return this.__finishFailure();
  }

  if (now < active.nextAt) {
    return;
  }

  switch (active.stage) {
    case "closed_pending":
      this.__say("second", active.player, text.closedSecond);
      this.__clearActive();
      this.__queue = this.__queue.filter(player => player !== active.player);
      this.__mustLeaveQueue.add(active.player);
      break;
    case "open_pending":
      active.secondMessage = text.openAccess;
      this.__grant();
      break;
    case "payment_pending":
      if (active.player.payWithResource(2148, this.__settings.payment)) {
        this.__beginGrant(text.paymentAccepted, text.paymentAccess);
      } else {
        this.__failToBack(text.paymentDenied);
      }
      break;
    case "grant_pending":
      this.__grant();
      break;
    case "fail_pending":
      this.__finishFailure();
      break;
  }
};

module.exports = PartyBouncerEvent;
