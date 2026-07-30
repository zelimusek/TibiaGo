"use strict";

const assert = require("assert");

require("../require");

const AccountDatabase = requireModule("auth/account-database");

const existingCharacter = {
  properties: {
    name: "God",
    role: CONST.ROLES.GOD,
    outfit: {
      id: CONST.LOOKTYPES.MALE.CITIZEN,
      details: { head: 78, body: 69, legs: 58, feet: 76 },
    },
  },
};

let savedCharacter = null;

const fakeDatabase = {
  select() {
    return {
      from() {
        return {
          where() {
            return {
              limit: async () => [{ character: JSON.stringify(existingCharacter) }],
            };
          },
        };
      },
    };
  },
  update() {
    return {
      set(values) {
        savedCharacter = JSON.parse(values.character);
        return {
          where: async () => {},
        };
      },
    };
  },
};

async function run() {
  const accountDatabase = Object.create(AccountDatabase.prototype);
  accountDatabase.db = fakeDatabase;

  await accountDatabase.__createDefaultCharacter({
    ACCOUNT: "111111",
    PASSWORD: "tibia",
    NAME: "God",
    SEX: "male",
    ROLE: CONST.ROLES.GOD,
    OUTFIT: CONST.LOOKTYPES.OTHER.GAMEMASTER,
  });

  assert(savedCharacter);
  assert.strictEqual(
    savedCharacter.properties.outfit.id,
    CONST.LOOKTYPES.OTHER.GAMEMASTER
  );
  assert.strictEqual(savedCharacter.properties.outfit.details, null);
  assert.strictEqual(savedCharacter.properties.role, CONST.ROLES.GOD);

  console.log("PASS: existing GOD character receives the gamemaster outfit.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
