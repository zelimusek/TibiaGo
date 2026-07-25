const Condition = requireModule("combat/condition");
const { RadioStreamPacket } = requireModule("network/protocol");

const DRINKS = {
  neon: { price: 25, effect: CONST.EFFECT.MAGIC.SOUND_PURPLE, text: "Neon Shot: a colourful club aura for one minute." },
  turbo: { price: 40, effect: CONST.EFFECT.MAGIC.SOUND_BLUE, text: "Turbo Cola: a harmless 30-second speed boost." },
  lava: { price: 30, effect: CONST.EFFECT.MAGIC.FIREAREA, text: "Lava Mix: a fiery club aura for one minute." }
};

const WARDROBE = {
  neonlook: { price: 20, id: 128, details: { head: 94, body: 114, legs: 94, feet: 114 }, text: "Neon Look" },
  mask: { price: 20, id: 129, details: { head: 0, body: 94, legs: 19, feet: 114 }, text: "Masked Look" },
  glow: { price: 20, id: 130, details: { head: 114, body: 94, legs: 114, feet: 94 }, text: "Glow Look" }
};

module.exports = function clubBartender() {
  this.setBaseState(baseTalkState);
  this.on("focus", player => {
    this.say("Welcome, %s! Choose a drink or a temporary club style.".format(player.name));
    player.write(new RadioStreamPacket(true, "club-menu:" + encodeURIComponent(JSON.stringify({ name: "Neon Nick's Drink Bar", drinks: Object.keys(DRINKS).map(key => ({ key: key, name: key === "turbo" ? "Turbo Cola" : key[0].toUpperCase() + key.slice(1) + " Shot", price: DRINKS[key].price })) })), 0));
  });
  this.on("defocus", player => this.say("Keep the party alive, %s!".format(player.name)));
};

function pay(player, price) {
  return player.payWithResource(2148, price);
}

function baseTalkState(state, player, message) {
  if(message === "drinks" || message === "drink") {
    return this.respond("I serve {neon} (25 gp), {turbo} (40 gp) and {lava} (30 gp). All effects are temporary and cosmetic, apart from Turbo's brief speed boost.");
  }
  if(message === "wardrobe" || message === "outfit") {
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
    player.addCondition(Condition.prototype.MORPH, 120, 500, look);
    process.gameServer.world.sendMagicEffect(player.position, CONST.EFFECT.MAGIC.TELEPORT);
    return this.respond("Looking good! Your %s lasts one minute.".format(look.text));
  }
}
