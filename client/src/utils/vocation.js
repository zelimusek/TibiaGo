"use strict";

function normalizeSkillVocation(vocation) {
  switch (vocation) {
    case CONST.VOCATION.ELITE_KNIGHT:
      return CONST.VOCATION.KNIGHT;
    case CONST.VOCATION.ROYAL_PALADIN:
      return CONST.VOCATION.PALADIN;
    case CONST.VOCATION.MASTER_SORCERER:
      return CONST.VOCATION.SORCERER;
    case CONST.VOCATION.ELDER_DRUID:
      return CONST.VOCATION.DRUID;
    default:
      return vocation;
  }
}
