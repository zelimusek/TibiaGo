const Condition = requireModule("combat/condition");
const { RadioStreamPacket } = requireModule("network/protocol");

const DRINKS = {
  neon: { price: 25, effect: CONST.EFFECT.MAGIC.SOUND_PURPLE, text: "Neon Shot: a colourful club aura for one minute." },
  turbo: { price: 40, effect: CONST.EFFECT.MAGIC.SOUND_BLUE, text: "Turbo Cola: a harmless 30-second speed boost." },
  lava: { price: 30, effect: CONST.EFFECT.MAGIC.FIREAREA, text: "Lava Mix: a fiery club aura for one minute." }
};

const WARDROBE = {
  neonlook: { price: 20, text: "Neon Look" },
  mask: { price: 20, text: "Masked Look" },
  glow: { price: 20, text: "Glow Look" }
};

const NEON_AURA = [
  CONST.EFFECT.MAGIC.SOUND_BLUE,
  CONST.EFFECT.MAGIC.SOUND_PURPLE,
  CONST.EFFECT.MAGIC.SOUND_GREEN,
  CONST.EFFECT.MAGIC.SOUND_WHITE
];

function getWardrobeLook(player, style) {
  let male = player.getProperty(CONST.PROPERTIES.SEX) === 1;
  let outfits = male
    ? { neonlook: 130, mask: 129, glow: 134 }
    : { neonlook: 138, mask: 137, glow: 142 };

  let colors = {
    neonlook: { head: 78, body: 94, legs: 80, feet: 96 },
    mask: { head: 96, body: 78, legs: 94, feet: 80 },
    glow: { head: 80, body: 78, legs: 96, feet: 94 }
  };

  return { id: outfits[style], details: colors[style] };
}

function openMenu(player, menu) {
  player.write(new RadioStreamPacket(true, "club-menu:" + encodeURIComponent(JSON.stringify(menu)), 0));
}

module.exports = function clubBartender() {
  this.setBaseState(baseTalkState);
  this.on("focus", player => {
    this.say("Welcome, %s! Choose a drink or a temporary club style.".format(player.name));
    openMenu(player, { name: "Neon Nick", text: "Welcome to the club! What can I get you?", items: [{ key: "drinks", name: "Drinks" }, { key: "wardrobe", name: "Wardrobe" }, { key: "dance", name: "Dance" }] });
  });
  this.on("defocus", player => this.say("Keep the party alive, %s!".format(player.name)));
};

function pay(player, price) {
  return player.payWithResource(2148, price);
}

function baseTalkState(state, player, message) {
  if(message === "drinks" || message === "drink") {
    openMenu(player, { name: "Neon Nick's Drink Bar", items: Object.keys(DRINKS).map(key => ({ key: key, name: key === "turbo" ? "Turbo Cola" : key[0].toUpperCase() + key.slice(1) + " Shot", price: DRINKS[key].price })) });
    return this.respond("I serve {neon} (25 gp), {turbo} (40 gp) and {lava} (30 gp). All effects are temporary and cosmetic, apart from Turbo's brief speed boost.");
  }
  if(message === "wardrobe" || message === "outfit") {
    openMenu(player, { name: "Neon Nick's Wardrobe", items: Object.keys(WARDROBE).map(key => ({ key: key, name: WARDROBE[key].text, price: WARDROBE[key].price })) });
    return this.respond("Temporary looks cost 20 gp: {neonlook}, {mask} or {glow}. They last one minute.");
  }
  if(message === "dance") {
    if(!process.gameServer.world.creatureHandler.startClubDance()) {
      return this.respond("A dance contest is already running — get on the floor and move!");
    }
    return this.respond("The dance contest is on! Get to the dance floor and keep moving for 30 seconds.");
  }
  if(DRINKS[message]) {
    let drink = DRINKS[message];
    if(!pay(player, drink.price)) return this.respond("You need %s gold coins for that drink.".format(drink.price));
    if(message === "turbo") player.addCondition(Condition.prototype.HASTE, 60, 500, null);
    else player.addCondition(Condition.prototype.MORPH, 120, 500, { id: 128, details: { head: message === "neon" ? 94 : 18, body: message === "neon" ? 114 : 18, legs: 94, feet: 114 } });
    process.gameServer.world.creatureHandler.applyClubDrinkAura(player, drink.effect);
    return this.respond("Cheers! %s".format(drink.text));
  }
  if(WARDROBE[message]) {
    let look = WARDROBE[message];
    if(!pay(player, look.price)) return this.respond("You need %s gold coins for that look.".format(look.price));
    player.addCondition(Condition.prototype.MORPH, 120, 500, getWardrobeLook(player, message));
    if(message === "neonlook") process.gameServer.world.creatureHandler.applyClubDrinkAura(player, NEON_AURA);
    else process.gameServer.world.sendMagicEffect(player.position, CONST.EFFECT.MAGIC.TELEPORT);
    return this.respond("Looking good! Your %s lasts one minute.".format(look.text));
  }
}
