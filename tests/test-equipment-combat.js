"use strict";

const assert = require("assert");

require("../require");

const Equipment = requireModule("containers/equipment");
const Player = requireModule("player/player");
const Creature = requireModule("entities/creature");
const definitions = require("../data/760/items/definitions.json");

function makeItem(properties) {
  return {
    id: properties.id || 1,
    count: properties.count || 1,
    getAttribute: function (attribute) {
      return Object.prototype.hasOwnProperty.call(properties, attribute)
        ? properties[attribute]
        : null;
    },
    getPrototype: function () {
      return { properties: properties };
    },
    isDistanceWeapon: function () {
      return properties.weaponType === "distance";
    },
    isRightAmmunition: function (ammunition) {
      return properties.ammoType === ammunition.getAttribute("ammoType");
    },
    isStackable: function () {
      return !!properties.stackable;
    },
  };
}

function makeEquipment(slots) {
  let equipment = Object.create(Equipment.prototype);
  equipment.container = {
    __slots: new Array(10).fill(null),
    peekIndex: function (index) {
      return this.__slots[index] || null;
    },
  };

  Object.keys(slots || {}).forEach(function (index) {
    equipment.container.__slots[Number(index)] = slots[index];
  });

  return equipment;
}

function testConvertedItemStatistics() {
  assert.strictEqual(definitions["2390"].properties.attack, 55);
  assert.strictEqual(definitions["2390"].properties.defense, 40);
  assert.strictEqual(definitions["2390"].properties.slotType, "two-handed");
  assert.strictEqual(definitions["2408"].properties.attack, 53);
  assert.strictEqual(definitions["2408"].properties.defense, 38);
  assert.strictEqual(definitions["2472"].properties.armor, 17);
}

function testMeleeAttackDefenseAndArmor() {
  let sword = makeItem({
    weaponType: "sword",
    attack: 53,
    defense: 38,
  });
  let shield = makeItem({
    weaponType: "shield",
    defense: 37,
  });
  let helmet = makeItem({ armor: 6 });
  let body = makeItem({ armor: 17 });
  let legs = makeItem({ armor: 8 });
  let boots = makeItem({ armor: 3 });
  let equipment = makeEquipment({
    [CONST.EQUIPMENT.HELMET]: helmet,
    [CONST.EQUIPMENT.ARMOR]: body,
    [CONST.EQUIPMENT.LEGS]: legs,
    [CONST.EQUIPMENT.BOOTS]: boots,
    [CONST.EQUIPMENT.RIGHT]: sword,
    [CONST.EQUIPMENT.LEFT]: shield,
  });

  assert.strictEqual(equipment.getAttackValue(), 53);
  assert.strictEqual(equipment.getDefenseValue(), 37);
  assert.strictEqual(equipment.getArmorValue(), 34);
  assert.strictEqual(equipment.getWeaponType(), CONST.PROPERTIES.SWORD);
  assert.strictEqual(equipment.isShieldEquipped(), true);
}

function testDistanceWeaponAndAmmunition() {
  let bow = makeItem({
    weaponType: "distance",
    ammoType: "arrow",
    slotType: "two-handed",
  });
  let arrow = makeItem({
    weaponType: "ammunition",
    ammoType: "arrow",
    attack: 25,
    shootType: "arrow",
  });
  let equipment = makeEquipment({
    [CONST.EQUIPMENT.RIGHT]: bow,
    [CONST.EQUIPMENT.QUIVER]: arrow,
  });

  assert.strictEqual(equipment.isDistanceWeaponEquipped(), true);
  assert.strictEqual(equipment.isAmmunitionEquipped(), true);
  assert.strictEqual(equipment.getAttackValue(), 25);

  equipment.container.__slots[CONST.EQUIPMENT.QUIVER] = makeItem({
    weaponType: "ammunition",
    ammoType: "bolt",
    attack: 30,
  });

  assert.strictEqual(equipment.isAmmunitionEquipped(), false);
  assert.strictEqual(equipment.getAttackValue(), 0);

  equipment.container.__slots[CONST.EQUIPMENT.RIGHT] = makeItem({
    weaponType: "distance",
    attack: 30,
    shootType: "spear",
  });
  equipment.container.__slots[CONST.EQUIPMENT.QUIVER] = null;

  assert.strictEqual(equipment.isAmmunitionEquipped(), true);
  assert.strictEqual(equipment.getAttackValue(), 30);

  // A throwing weapon must neither require nor borrow attack from the quiver.
  equipment.container.__slots[CONST.EQUIPMENT.QUIVER] = arrow;
  assert.strictEqual(equipment.getAttackValue(), 30);
}

function testTwoHandedConflicts() {
  let twoHandedSword = makeItem({
    weaponType: "sword",
    slotType: "two-handed",
  });
  let shield = makeItem({
    weaponType: "shield",
    defense: 30,
  });
  let equipment = makeEquipment({
    [CONST.EQUIPMENT.LEFT]: shield,
  });

  assert.strictEqual(
    equipment.getMaximumAddCount(
      null,
      twoHandedSword,
      CONST.EQUIPMENT.RIGHT
    ),
    0
  );

  equipment.container.__slots[CONST.EQUIPMENT.LEFT] = null;
  assert.ok(
    equipment.getMaximumAddCount(
      null,
      twoHandedSword,
      CONST.EQUIPMENT.RIGHT
    ) > 0
  );

  equipment.container.__slots[CONST.EQUIPMENT.LEFT] = twoHandedSword;
  assert.strictEqual(
    equipment.getMaximumAddCount(null, shield, CONST.EQUIPMENT.RIGHT),
    0
  );
}

function testPlayerCombatValuesUseEquipment() {
  let equippedPlayer = {
    fightMode: CONST.FIGHT_MODE.BALANCED,
    getBaseDamage: function () {
      return 20;
    },
    getProperty: function (property) {
      if (property === CONST.PROPERTIES.ATTACK) {
        return 4;
      }
      if (property === CONST.PROPERTIES.DEFENSE) {
        return 2;
      }
      return 0;
    },
    skills: {
      getSkillLevel: function (skill) {
        if (skill === CONST.PROPERTIES.SHIELDING) {
          return 60;
        }
        return 70;
      },
    },
    containerManager: {
      equipment: {
        getAttackValue: function () {
          return 53;
        },
        getDefenseValue: function () {
          return 37;
        },
        getWeaponType: function () {
          return CONST.PROPERTIES.SWORD;
        },
        isShieldEquipped: function () {
          return true;
        },
        getArmorValue: function () {
          return 34;
        },
      },
    },
  };

  let barePlayer = {
    fightMode: CONST.FIGHT_MODE.BALANCED,
    getBaseDamage: equippedPlayer.getBaseDamage,
    getProperty: equippedPlayer.getProperty,
    skills: equippedPlayer.skills,
    containerManager: {
      equipment: {
        getAttackValue: function () {
          return 0;
        },
        getDefenseValue: function () {
          return 0;
        },
        getWeaponType: function () {
          return CONST.PROPERTIES.FIST;
        },
        isShieldEquipped: function () {
          return false;
        },
        getArmorValue: function () {
          return 0;
        },
      },
    },
  };

  let equippedAttack = Player.prototype.getAttack.call(equippedPlayer);
  let bareAttack = Player.prototype.getAttack.call(barePlayer);
  let equippedDefense = Player.prototype.getDefense.call(equippedPlayer);
  let bareDefense = Player.prototype.getDefense.call(barePlayer);

  assert.ok(equippedAttack > bareAttack);
  assert.ok(equippedDefense > bareDefense);
  assert.strictEqual(Player.prototype.getArmor.call(equippedPlayer), 34);
}

function testArmorMitigationBounds() {
  let creature = Object.create(Creature.prototype);
  creature.armor = 34;

  for (let i = 0; i < 500; i++) {
    let mitigation = creature.calculateArmor();
    assert.ok(mitigation >= 17);
    assert.ok(mitigation <= 32);
  }
}

let tests = [
  testConvertedItemStatistics,
  testMeleeAttackDefenseAndArmor,
  testDistanceWeaponAndAmmunition,
  testTwoHandedConflicts,
  testPlayerCombatValuesUseEquipment,
  testArmorMitigationBounds,
];

tests.forEach(function (test) {
  test();
  console.log("PASS", test.name);
});

console.log("All equipment combat tests passed.");
