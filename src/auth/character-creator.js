"use strict";

const Position = requireModule("utils/position");
const Outfit = requireModule("entities/outfit");
const Skill = requireModule("utils/skill");

const CharacterCreator = function () {

  /*
   * Class CharacterCreator
   * Handler for the creation of new characters
   */

  this.blueprint = new Object({
    "position": new Position(32097, 32215, 7),
    "templePosition": new Position(32097, 32215, 7),
    "properties": {
      "vocation": CONST.VOCATION.NONE,
      "role": CONST.ROLES.NONE,
      "sex": CONST.SEX.MALE,
      "maxCapacity": 2000,
      "availableMounts": [],
      "availableOutfits": [],
      "name": "Unknown",
      "attack": 4,
      "attackSpeed": 20,
      "defense": 2,
      "direction": CONST.DIRECTION.NORTH,
      "health": 150,
      "maxHealth": 150,
      "mana": 35,
      "maxMana": 35,
      "outfit": new Outfit({
        "id": 0,
        "details": {
          "head": 78,
          "body": 69,
          "legs": 58,
          "feet": 76
        },
        "mount": 0,
        "mounted": false,
        "addonOne": false,
        "addonTwo": false
      }),
      "speed": 110
    },
    "skills": {
      "experience": 0,
      "level": 1,
      "magic": 0,
      "fist": 10,
      "club": 10,
      "sword": 10,
      "axe": 10,
      "distance": 10,
      "shielding": 10,
      "fishing": 10
    },
    "spellbook": {
      "availableSpells": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      "cooldowns": []
    },
    "containers": {
      "keyring": [],
      "depot": [],
      "inbox": [],
      "equipment": [
        { "slot": 5, "item": { "id": 2398 } },
        { "slot": 6, "item": { "id": 1988 } }
      ],
    },
    "friends": [],
    "storage": {}
  });

}

CharacterCreator.prototype.create = function (name, sex, options) {

  /*
   * CharacterCreator.create
   * Creates a new character with the given properties
   */

  // Memory copy of the template
  let copiedTemplate = JSON.parse(JSON.stringify(this.blueprint));

  // Replace the character name
  copiedTemplate.properties.name = name;

  let discoMode = CONFIG.SERVER.DISCO_MODE && CONFIG.SERVER.DISCO_MODE.ENABLED === true
    && (!options || options.discoMode !== false);
  if (discoMode) {
    let discoConfig = CONFIG.SERVER.DISCO_MODE;
    let spawn = discoConfig.SPAWN || { x: 32516, y: 32394, z: 7 };
    let level = Number.isInteger(discoConfig.START_LEVEL) && discoConfig.START_LEVEL > 0
      ? discoConfig.START_LEVEL
      : 20;
    let experienceSkill = new Skill(CONST.PROPERTIES.EXPERIENCE, 0);
    let experience = experienceSkill.getRequiredSkillPoints(level, CONST.VOCATION.NONE);
    copiedTemplate.position = new Position(spawn.x, spawn.y, spawn.z);
    copiedTemplate.templePosition = new Position(spawn.x, spawn.y, spawn.z);
    copiedTemplate.skills.experience = experience;
    copiedTemplate.skills.level = level;
    copiedTemplate.properties.health = 5 * (level + 29);
    copiedTemplate.properties.maxHealth = copiedTemplate.properties.health;
    copiedTemplate.properties.mana = 5 * (level + 10);
    copiedTemplate.properties.maxMana = copiedTemplate.properties.mana;
    copiedTemplate.properties.maxCapacity = 10 * (level + 39);
    copiedTemplate.properties.speed = 109 + level;
  }

  // And sex specific attributes
  if (sex === "male") {
    copiedTemplate.properties.sex = CONST.SEX.MALE;
    copiedTemplate.properties.outfit.id = CONST.LOOKTYPES.MALE.CITIZEN;
    copiedTemplate.properties.availableOutfits = new Array(
      CONST.LOOKTYPES.MALE.CITIZEN,
      CONST.LOOKTYPES.MALE.HUNTER,
      CONST.LOOKTYPES.MALE.MAGE,
      CONST.LOOKTYPES.MALE.KNIGHT
    );
  } else if (sex === "female") {
    copiedTemplate.properties.sex = CONST.SEX.FEMALE;
    copiedTemplate.properties.outfit.id = CONST.LOOKTYPES.FEMALE.CITIZEN;
    copiedTemplate.properties.availableOutfits = new Array(
      CONST.LOOKTYPES.FEMALE.CITIZEN,
      CONST.LOOKTYPES.FEMALE.HUNTER,
      CONST.LOOKTYPES.FEMALE.MAGE,
      CONST.LOOKTYPES.FEMALE.KNIGHT
    );
  }

  // Return the template as a string to write it to the filesystem
  return JSON.stringify(copiedTemplate);

}


module.exports = CharacterCreator;
