/**
 * export-categorized-graphics.js
 *
 * Ten skrypt odczytuje binarne archiwa Tibia.spr oraz Tibia.dat przy użyciu natywnych klas klienta gry.
 * Zgodnie z wyborem użytkownika, tworzy DWIE OSOBNE STRUKTURY FOLDERÓW:
 * 1. option1_tibia_74_classic/  - Wyłącznie klasyczne, autentyczne przedmioty i potwory z Tibii 7.4 (bez anachronizmów i błędnych ID).
 * 2. option2_post_74_adapted/   - Potwory z nowszych wersji Tibii (np. Massive Water Elemental, Ice Overlord, Ghazbaran),
 *                                  które zostały inteligentnie dopasowane do klasycznych sprajtów z Tibii 7.4
 *                                  (np. wodne i ziemne żywiołaki oparte na sprajtach elementalów z odpowiednią tonacją barw).
 */

const fs = require('fs-extra');
const path = require('path');
const vm = require('vm');
const { PNG } = require('pngjs');

// Ścieżki bazowe
const ROOT_DIR = path.resolve(__dirname, '..');
const SPR_PATH = path.join(ROOT_DIR, 'client', 'data', '740', 'Tibia.spr');
const DAT_PATH = path.join(ROOT_DIR, 'client', 'data', '740', 'Tibia.dat');
const ITEMS_JSON_PATH = path.join(ROOT_DIR, 'data', '740', 'items', 'definitions.json');
const MONSTERS_DIR_PATH = path.join(ROOT_DIR, 'data', '740', 'monsters', 'definitions');
const OUTPUT_DIR = path.join(ROOT_DIR, 'assets', 'categorized_graphics');

const OPTION1_DIR = path.join(OUTPUT_DIR, 'option1_tibia_74_classic');
const OPTION2_DIR = path.join(OUTPUT_DIR, 'option2_post_74_adapted');

// Kolory domyślne dla stroju z detalami (w formacie RGB int z Tibii)
const OUTFIT_COLORS = [
  0xFFFFFF, 0xBFD4FF, 0xBFE9FF, 0xBFFFFF, 0xBFFFE9, 0xBFFFD4, 0xBFFFBF, 0xD4FFBF, 0xE9FFBF, 0xFFFFBF, 0xFFE9BF, 0xFFD4BF, 0xFFBFBF, 0xFFBFD4,
  0xFFBFE9, 0xFFBFFF, 0xE9BFFF, 0xD4BFFF, 0xBFBFFF, 0xDADADA, 0x8F9FBF, 0x8FAFBF, 0x8FBFBF, 0x8FBFAF, 0x8FBF9F, 0x8FBF8F, 0x9FBF8F, 0xAFBF8F,
  0xBFBF8F, 0xBFAF8F, 0xBF9F8F, 0xBF8F8F, 0xBF8F9F, 0xBF8FAF, 0xBF8FBF, 0xAF8FBF, 0x9F8FBF, 0x8F8FBF, 0xB6B6B6, 0x5F7FBF, 0x8FAFBF, 0x5FBFBF,
  0x5FBF9F, 0x5FBF7F, 0x5FBF5F, 0x7FBF5F, 0x9FBF5F, 0xBFBF5F, 0xBF9F5F, 0xBF7F5F, 0xBF5F5F, 0xBF5F7F, 0xBF5F9F, 0xBF5FBF, 0x9F5FBF, 0x7F5FBF,
  0x5F5FBF, 0x919191, 0x3F6ABF, 0x3F94BF, 0x3FBFBF, 0x3FBF94, 0x3FBF6A, 0x3FBF3F, 0x6ABF3F, 0x94BF3F, 0xBFBF3F, 0xBF943F, 0xBF6A3F, 0xBF3F3F,
  0xBF3F6A, 0xBF3F94, 0xBF3FBF, 0x943FBF, 0x6A3FBF, 0x3F3FBF, 0x6D6D6D, 0x0055FF, 0x00AAFF, 0x00FFFF, 0x00FFAA, 0x00FF54, 0x00FF00, 0x54FF00,
  0xAAFF00, 0xFFFF00, 0xFFA900, 0xFF5500, 0xFF0000, 0xFF0055, 0xFF00A9, 0xFF00FE, 0xAA00FF, 0x5500FF, 0x0000FF, 0x484848, 0x003FBF, 0x007FBF,
  0x00BFBF, 0x00BF7F, 0x00BF3F, 0x00BF00, 0x3FBF00, 0x7FBF00, 0xBFBF00, 0xBF7F00, 0xBF3F00, 0xBF0000, 0xBF003F, 0xBF007F, 0xBF00BF, 0x7F00BF,
  0x3F00BF, 0x0000BF, 0x242424, 0x002A7F, 0x00557F, 0x007F7F, 0x007F55, 0x007F2A, 0x007F00, 0x2A7F00, 0x557F00, 0x7F7F00, 0x7F5400, 0x7F2A00,
  0x7F0000, 0x7F002A, 0x7F0054, 0x7F007F, 0x55007F, 0x2A007F, 0x00007F
];

function sanitizeFilename(name) {
  if (!name) return 'unknown';
  return name.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'item';
}

function classifyItem(id, item) {
  const props = item.properties || {};
  const name = (props.name || item.name || '').toLowerCase();
  const wType = (props.weaponType || '').toLowerCase();
  const bPos = (props.bodyPosition || '').toLowerCase();
  const iType = (props.type || '').toLowerCase();

  if (wType === 'sword' || name.includes('sword') || name.includes('saber') || name.includes('blade') || name.includes('scimitar') || name.includes('katana') || name.includes('rapier') || name.includes('machete') || name.includes('dagger')) return 'swords';
  if (wType === 'axe' || name.includes('axe') || name.includes('hatchet') || name.includes('halberd') || name.includes('sickle') || name.includes('scythe')) return 'axes';
  if (wType === 'club' || name.includes('club') || name.includes('mace') || name.includes('hammer') || name.includes('staff') || name.includes('crowbar')) return 'clubs';
  if (wType === 'distance' || name.includes('bow') || name.includes('spear') || name.includes('throwing')) return 'distance_weapons';
  if (wType === 'ammunition' || bPos === 'ammo' || name.includes('arrow') || name.includes('bolt') || name.includes('star')) return 'ammunition';
  if (wType === 'wand' || name.includes('wand') || name.includes('rod')) return 'wands_and_rods';
  if (wType === 'shield' || bPos === 'shield' || name.includes('shield')) return 'shields';
  if (bPos === 'head' || name.includes('helmet') || name.includes('hat') || name.includes('cap') || name.includes('crown') || name.includes('hood') || name.includes('bandana')) return 'helmets';
  if (bPos === 'body' || name.includes('armor') || name.includes('jacket') || name.includes('coat') || name.includes('robe') || name.includes('mail') || name.includes('plate')) return 'armors';
  if (bPos === 'legs' || name.includes('legs') || name.includes('trousers') || name.includes('breeches') || name.includes('kilt')) return 'legs';
  if (bPos === 'feet' || name.includes('boots') || name.includes('shoes') || name.includes('sandals')) return 'boots';
  if (bPos === 'ring' || bPos === 'necklace' || name.includes('ring') || name.includes('amulet') || name.includes('necklace') || name.includes('talisman') || name.includes('locket')) return 'rings_and_amulets';
  if (iType === 'rune' || name.includes('rune')) return 'runes';
  if (name.includes('potion') || name.includes('vial') || name.includes('flask') || name.includes('fluid') || name.includes('mana') || name.includes('health')) return 'potions_and_fluids';
  if (bPos === 'backpack' || iType === 'container' || name.includes('backpack') || name.includes('bag') || name.includes('chest') || name.includes('box') || name.includes('crate') || name.includes('barrel')) return 'containers';
  if (name.includes('key') || name.includes('rope') || name.includes('shovel') || name.includes('pick') || name.includes('fishing rod')) return 'tools_and_keys';
  if (iType === 'food' || name.includes('bread') || name.includes('meat') || name.includes('ham') || name.includes('cheese') || name.includes('apple') || name.includes('fish') || name.includes('mushroom') || name.includes('berry')) return 'food';
  return 'misc';
}

function classifyMonster(monster) {
  const name = (monster.name || '').toLowerCase();
  if (name.includes('dragon') || name.includes('drake') || name.includes('hydra') || name.includes('serpent spawn') || name.includes('demodras')) return 'dragons';
  if (name.includes('skeleton') || name.includes('ghoul') || name.includes('mummy') || name.includes('vampire') || name.includes('lich') || name.includes('banshee') || name.includes('bonebeast') || name.includes('zombie') || name.includes('ghost') || name.includes('spectre') || name.includes('reaper') || name.includes('crypt') || name.includes('undead')) return 'undead';
  if (name.includes('amazon') || name.includes('valkyrie') || name.includes('hunter') || name.includes('poacher') || name.includes('hero') || name.includes('black knight') || name.includes('monk') || name.includes('assassin') || name.includes('witch') || name.includes('necromancer') || name.includes('pirate') || name.includes('bandit') || name.includes('smuggler') || name.includes('gladiator') || name.includes('fanatic') || name.includes('cultist') || name.includes('warrior') || name.includes('knight') || name.includes('paladin') || name.includes('sorcerer') || name.includes('druid') || name.includes('barbarian') || name.includes('nomad')) return 'humanoids';
  if (name.includes('demon') || name.includes('orshabaal') || name.includes('morgaroth') || name.includes('ghazbaran') || name.includes('ferumbras') || name.includes('fire devil') || name.includes('diabolic imp') || name.includes('juggernaut') || name.includes('behemoth') || name.includes('hellhound') || name.includes('fury')) return 'demons';
  if (name.includes('orc') || name.includes('rorc')) return 'orcs';
  if (name.includes('dwarf') || name.includes('geomancer')) return 'dwarves';
  if (name.includes('elf') || name.includes('dharalion')) return 'elves';
  if (name.includes('cyclops') || name.includes('troll') || name.includes('giant') || name.includes('ogre')) return 'giants_and_trolls';
  if (name.includes('spider') || name.includes('tarantula') || name.includes('scarab') || name.includes('bug') || name.includes('beetle') || name.includes('centipede') || name.includes('crawler') || name.includes('wasp') || name.includes('larva')) return 'insects_and_arachnids';
  if (name.includes('quara') || name.includes('crab') || name.includes('tortoise') || name.includes('croc') || name.includes('fish') || name.includes('shark') || name.includes('jellyfish') || name.includes('calamary')) return 'aquatic';
  if (name.includes('elemental') || name.includes('golem') || name.includes('gargoyle') || name.includes('bonelord') || name.includes('djinn') || name.includes('efreet') || name.includes('marid') || name.includes('mimic') || name.includes('overlord') || name.includes('spirit of')) return 'elementals_and_magical';
  if (name.includes('rat') || name.includes('bear') || name.includes('wolf') || name.includes('lion') || name.includes('tiger') || name.includes('boar') || name.includes('deer') || name.includes('dog') || name.includes('cat') || name.includes('horse') || name.includes('hyaena') || name.includes('elephant') || name.includes('mammoth') || name.includes('panda') || name.includes('badger') || name.includes('bat') || name.includes('snake') || name.includes('cobra') || name.includes('rotworm') || name.includes('carrion')) return 'beasts_and_animals';
  if (name.includes('carniphila') || name.includes('spit nettle') || name.includes('fungus') || name.includes('mushroom') || name.includes('treeling') || name.includes('dryad')) return 'plants_and_nature';
  return 'misc';
}

// --- ŁADOWANIE TIBIA.SPR ---
console.log('[1/6] Wczytywanie Tibia.spr...');
const sprBuffer = fs.readFileSync(SPR_PATH);
const sprPointers = {};
let sprIndex = 0;
const sprSignature = sprBuffer.readUInt32LE(sprIndex).toString(16).toUpperCase();
sprIndex += 4;
const spriteCount = (sprSignature === '439852BE' || sprSignature === '57BBD603') ? sprBuffer.readUInt32LE(sprIndex) : sprBuffer.readUInt16LE(sprIndex);
sprIndex += (sprSignature === '439852BE' || sprSignature === '57BBD603') ? 4 : 2;

for (let i = 1; i < spriteCount; i++) {
  const addr = sprBuffer.readUInt32LE(sprIndex);
  sprIndex += 4;
  if (addr !== 0) sprPointers[i] = addr;
}
console.log(` -> Znaleziono ${spriteCount} sprajtów w Tibia.spr.`);

function decodeSprite(id) {
  if (!id || id <= 0) return null;
  const addr = sprPointers[id];
  if (!addr || addr >= sprBuffer.length) return null;

  let idx = addr;
  const length = sprBuffer[idx + 3] | (sprBuffer[idx + 4] << 8);
  idx += 5;

  const endIdx = idx + length;
  const pixels = new Uint8Array(32 * 32 * 4);
  let pixelOffset = 0;

  while (idx < endIdx && pixelOffset < 32 * 32) {
    const transparent = sprBuffer.readUInt16LE(idx); idx += 2;
    const colored = sprBuffer.readUInt16LE(idx); idx += 2;
    pixelOffset += transparent;

    for (let i = 0; i < colored; i++) {
      if (pixelOffset < 32 * 32) {
        const r = sprBuffer[idx++];
        const g = sprBuffer[idx++];
        const b = sprBuffer[idx++];
        const base = pixelOffset * 4;
        pixels[base + 0] = r;
        pixels[base + 1] = g;
        pixels[base + 2] = b;
        pixels[base + 3] = 255;
      } else {
        idx += 3;
      }
      pixelOffset++;
    }
  }
  return pixels;
}

// --- ŁADOWANIE TIBIA.DAT ---
console.log('[2/6] Wczytywanie Tibia.dat przez natywne klasy klienta...');
const ctx = vm.createContext({
  console, performance, Buffer, ArrayBuffer, Uint8Array, Uint16Array, Uint32Array, Math, JSON,
  gameClient: { interface: { loadAssetCallback: () => {} } },
  LoopedAnimation: function() {}
});

const clientFiles = [
  'client/src/utils/__proto__.js',
  'client/src/utils/position.js',
  'client/src/network/packet.js',
  'client/src/network/packetreader.js',
  'client/src/utils/bitflag.js',
  'client/src/utils/dataobject.js',
  'client/src/utils/frame-group.js',
  'client/src/utils/object-buffer.js'
];

clientFiles.forEach(f => {
  let code = fs.readFileSync(path.join(ROOT_DIR, f), 'utf8');
  if (f.includes('position.js')) code += '\nthis.Position = Position;';
  if (f.includes('packet.js')) code += '\nthis.Packet = Packet;';
  if (f.includes('packetreader.js')) code += '\nthis.PacketReader = PacketReader;';
  if (f.includes('dataobject.js')) code += '\nthis.DataObject = DataObject;';
  if (f.includes('frame-group.js')) code += '\nthis.FrameGroup = FrameGroup;';
  if (f.includes('object-buffer.js')) code += '\nthis.ObjectBuffer = ObjectBuffer;';
  if (f.includes('bitflag.js')) code += '\nthis.BitFlagGenerator = BitFlagGenerator; this.PropBitFlag = PropBitFlag;';
  vm.runInContext(code, ctx);
});

const ob = new ctx.ObjectBuffer();
ob.__load('Tibia.dat', fs.readFileSync(DAT_PATH));
console.log(` -> Zdekodowano ${ob.totalObjectCount} obiektów z Tibia.dat.`);

function renderDataObjectToPNG(datObj, lookDetails = null, tintMode = null) {
  if (!datObj || !datObj.frameGroups || !datObj.frameGroups[0]) return null;
  const fg = datObj.frameGroups[0];
  const width = fg.width || 1;
  const height = fg.height || 1;
  const layers = fg.layers || 1;
  const xPattern = (fg.pattern && fg.pattern.x > 2) ? 2 : 0;

  const png = new PNG({ width: width * 32, height: height * 32 });

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const baseSpriteId = fg.getSpriteId(0, xPattern, 0, 0, 0, x, y);
      const basePixels = decodeSprite(baseSpriteId);
      if (!basePixels) continue;

      let maskPixels = null;
      if (layers > 1 && lookDetails) {
        const maskSpriteId = fg.getSpriteId(0, xPattern, 0, 0, 1, x, y);
        maskPixels = decodeSprite(maskSpriteId);
      }

      const HEAD = lookDetails ? (OUTFIT_COLORS[lookDetails.head || 0] || 0xFFFFFF) : 0xFFFFFF;
      const BODY = lookDetails ? (OUTFIT_COLORS[lookDetails.body || 0] || 0xFFFFFF) : 0xFFFFFF;
      const LEGS = lookDetails ? (OUTFIT_COLORS[lookDetails.legs || 0] || 0xFFFFFF) : 0xFFFFFF;
      const FEET = lookDetails ? (OUTFIT_COLORS[lookDetails.feet || 0] || 0xFFFFFF) : 0xFFFFFF;

      const destX = (width - 1 - x) * 32;
      const destY = (height - 1 - y) * 32;

      for (let py = 0; py < 32; py++) {
        for (let px = 0; px < 32; px++) {
          const srcOff = (py * 32 + px) * 4;
          let r = basePixels[srcOff + 0];
          let g = basePixels[srcOff + 1];
          let b = basePixels[srcOff + 2];
          const a = basePixels[srcOff + 3];

          if (a === 0) continue;

          if (maskPixels && maskPixels[srcOff + 3] > 0) {
            const mr = maskPixels[srcOff + 0];
            const mg = maskPixels[srcOff + 1];
            const mb = maskPixels[srcOff + 2];

            let col = null;
            if (mr === 255 && mg === 255 && mb === 0) col = HEAD;
            else if (mr === 255 && mg === 0 && mb === 0) col = BODY;
            else if (mr === 0 && mg === 255 && mb === 0) col = LEGS;
            else if (mr === 0 && mg === 0 && mb === 255) col = FEET;

            if (col !== null) {
              const cr = (col >> 0) & 0xFF;
              const cg = (col >> 8) & 0xFF;
              const cb = (col >> 16) & 0xFF;
              r = Math.round((r * cr) / 255);
              g = Math.round((g * cg) / 255);
              b = Math.round((b * cb) / 255);
            }
          }

          // Efekt tonacji (tintMode) dla potworów adaptowanych z nowszych wersji (np. wodne i ziemne żywiołaki)
          if (tintMode === 'water') {
            const tr = r, tb = b;
            r = Math.round(tb * 0.4);
            b = Math.max(tr, tb);
            g = Math.round((g + tb) / 2);
          } else if (tintMode === 'earth' || tintMode === 'poison') {
            const tr = r, tg = g;
            r = Math.round(tr * 0.3);
            g = Math.max(tr, tg);
            b = Math.round(b * 0.4);
          } else if (tintMode === 'ice') {
            const tr = r;
            r = Math.round(tr * 0.5);
            g = Math.max(g, Math.round(tr * 0.9));
            b = 255;
          }

          const dstOff = ((destY + py) * png.width + (destX + px)) * 4;
          png.data[dstOff + 0] = r;
          png.data[dstOff + 1] = g;
          png.data[dstOff + 2] = b;
          png.data[dstOff + 3] = a;
        }
      }
    }
  }

  return PNG.sync.write(png);
}

// --- CZYSZCZENIE I TWORZENIE KATALOGÓW ---
console.log('[3/6] Przygotowywanie folderów dla Opcji 1 i Opcji 2 w assets/categorized_graphics/ ...');
fs.ensureDirSync(OPTION1_DIR);
fs.emptyDirSync(OPTION1_DIR);
fs.ensureDirSync(OPTION2_DIR);
fs.emptyDirSync(OPTION2_DIR);

const opt1ItemSummary = {}, opt1MonsterSummary = {};
const opt2ItemSummary = {}, opt2MonsterSummary = {};

// --- EKSPORT ITEMÓW (DLA OBU OPCJI) ---
console.log('[4/6] Eksportowanie przedmotów do option1_tibia_74_classic/ oraz option2_post_74_adapted/...');
const itemsJson = fs.readJsonSync(ITEMS_JSON_PATH);
let itemsCount1 = 0, itemsCount2 = 0;

for (const [idStr, itemDef] of Object.entries(itemsJson)) {
  const itemId = Number(idStr);
  if (isNaN(itemId) || itemId < 100) continue;

  const datObj = ob.dataObjects[itemId];
  if (!datObj) continue;

  const category = classifyItem(itemId, itemDef);
  const rawName = itemDef.properties?.name || itemDef.name || `item_${itemId}`;
  const cleanName = sanitizeFilename(rawName);
  const filename = `${itemId}_${cleanName}.png`;
  const pngBuffer = renderDataObjectToPNG(datObj, null);

  if (pngBuffer) {
    // W Opcji 1 umieszczamy przedmioty oryginalne z Tibii 7.4 (<= 3429)
    if (itemId <= 3429) {
      const catDir1 = path.join(OPTION1_DIR, 'items', category);
      fs.ensureDirSync(catDir1);
      fs.writeFileSync(path.join(catDir1, filename), pngBuffer);
      if (!opt1ItemSummary[category]) opt1ItemSummary[category] = [];
      opt1ItemSummary[category].push({ id: itemId, name: rawName, file: filename });
      itemsCount1++;
    }

    // W Opcji 2 umieszczamy pełny komplet przedmiotów z nowszych wersji/modyfikacji oraz klasyczne
    const catDir2 = path.join(OPTION2_DIR, 'items', category);
    fs.ensureDirSync(catDir2);
    fs.writeFileSync(path.join(catDir2, filename), pngBuffer);
    if (!opt2ItemSummary[category]) opt2ItemSummary[category] = [];
    opt2ItemSummary[category].push({ id: itemId, name: rawName, file: filename });
    itemsCount2++;
  }
}
console.log(` -> Wyeksportowano ${itemsCount1} przedmiotów do option1 oraz ${itemsCount2} do option2.`);

// --- EKSPORT POTWORÓW ---
console.log('[5/6] Kategoryzacja potworów z podziałem na Klasyczne (Tibia 7.4) oraz Adaptowane (Post-7.4)...');
const monsterFiles = fs.readdirSync(MONSTERS_DIR_PATH).filter(f => f.endsWith('.json'));
let monstersCount1 = 0, monstersCount2 = 0;

function getSmartFallbackLookType(category, name) {
  const lower = name.toLowerCase();

  if (category === 'dragons') {
    if (lower.includes('undead') || lower.includes('bone') || lower.includes('ghastly')) return 231; // Undead Dragon
    if (lower.includes('lord') || lower.includes('king') || lower.includes('high')) return 39; // Dragon Lord
    if (lower.includes('frost') || lower.includes('ice')) return 248; // Frost Dragon
    if (lower.includes('hydra') || lower.includes('many')) return 121; // The Many / Hydra
    if (lower.includes('serpent')) return 220; // Noxious Spawn / Serpent Spawn
    return 34; // Dragon
  }

  if (category === 'demons') {
    if (lower.includes('orshabaal') || lower.includes('annihilon') || lower.includes('zugurosh') || lower.includes('juggernaut')) return 201; // Orshabaal
    if (lower.includes('morgaroth') || lower.includes('hellgorak') || lower.includes('apocalypse')) return 35; // Demon
    if (lower.includes('behemoth') || lower.includes('giant')) return 55; // Behemoth
    if (lower.includes('imp') || lower.includes('devil') || lower.includes('fire')) return 40; // Fire Devil / Malicious Minion
    if (lower.includes('plague') || lower.includes('blight') || lower.includes('defiler')) return 247; // Plaguesmith
    return 35; // Demon
  }

  if (category === 'undead') {
    if (lower.includes('lich') || lower.includes('undead mage') || lower.includes('necromancer')) return 99; // Lich
    if (lower.includes('vampire') || lower.includes('bride') || lower.includes('lord')) return 68; // Vampire
    if (lower.includes('banshee') || lower.includes('witch') || lower.includes('wailing')) return 78; // Banshee
    if (lower.includes('ghost') || lower.includes('spectre') || lower.includes('phantom') || lower.includes('soul') || lower.includes('wraith')) return 48; // Tormented Ghost
    if (lower.includes('mummy') || lower.includes('pharaoh') || lower.includes('tomb')) return 65; // Mummy
    if (lower.includes('zombie') || lower.includes('ghoul') || lower.includes('rot')) return 18; // Ghoul
    return 33; // Skeleton
  }

  if (category === 'humanoids') {
    if (lower.includes('hero') || lower.includes('champion') || lower.includes('warlord') || lower.includes('paladin')) return 73; // Hero
    if (lower.includes('knight') || lower.includes('warrior') || lower.includes('barbarian') || lower.includes('gladiator')) return 131; // Wild Warrior
    if (lower.includes('monk') || lower.includes('priest') || lower.includes('zealot') || lower.includes('acolyte')) return 57; // Monk
    if (lower.includes('warlock') || lower.includes('mage') || lower.includes('sorcerer') || lower.includes('arcanist') || lower.includes('cult')) return 130; // Zarabustor / Warlock
    if (lower.includes('hunter') || lower.includes('scout') || lower.includes('poacher') || lower.includes('sniper')) return 129; // Hunter
    if (lower.includes('amazon') || lower.includes('valkyrie') || lower.includes('lissy')) return 139; // Valkyrie
    if (lower.includes('pirate') || lower.includes('corsair') || lower.includes('buccaneer')) return 98; // Pirate Corsair
    return 73; // Hero
  }

  if (category === 'orcs') {
    if (lower.includes('warlord') || lower.includes('leader') || lower.includes('king')) return 2; // Orc Warlord
    if (lower.includes('berserker') || lower.includes('brute') || lower.includes('ravager')) return 8; // Orc Berserker
    if (lower.includes('shaman') || lower.includes('priest') || lower.includes('mage')) return 6; // Orc Shaman
    if (lower.includes('rider') || lower.includes('wolf')) return 4; // Orc Rider
    return 5; // Orc
  }

  if (category === 'dwarves') {
    if (lower.includes('guard') || lower.includes('geomancer') || lower.includes('general')) return 70; // Dwarf Guard
    if (lower.includes('soldier') || lower.includes('miner')) return 71; // Dwarf Soldier
    return 69; // Dwarf
  }

  if (category === 'elves') {
    if (lower.includes('arcanist') || lower.includes('mage') || lower.includes('shaman')) return 63; // Elf Arcanist
    return 62; // Elf
  }

  if (category === 'giants_and_trolls') {
    if (lower.includes('cyclops') || lower.includes('smith') || lower.includes('drone') || lower.includes('titan')) return 22; // Cyclops
    if (lower.includes('troll') || lower.includes('legionnaire') || lower.includes('champ')) return 15; // Troll
    if (lower.includes('behemoth') || lower.includes('giant')) return 55; // Behemoth
    return 22; // Cyclops
  }

  if (category === 'insects_and_arachnids') {
    if (lower.includes('giant spider') || lower.includes('tarantula') || lower.includes('widow')) return 38; // Giant Spider
    if (lower.includes('scarab') || lower.includes('beetle') || lower.includes('crawler') || lower.includes('bug')) return 83; // Scarab
    if (lower.includes('centipede') || lower.includes('worm')) return 124; // Centipede
    if (lower.includes('wasp') || lower.includes('bee')) return 44; // Wasp
    return 30; // Spider
  }

  if (category === 'aquatic') {
    if (lower.includes('quara') || lower.includes('predator') || lower.includes('scout') || lower.includes('hydromancer')) return 20; // Quara Predator
    if (lower.includes('crab') || lower.includes('shell') || lower.includes('crustacean')) return 112; // Crab
    if (lower.includes('tortoise') || lower.includes('turtle') || lower.includes('snapper')) return 197; // Tortoise
    if (lower.includes('croc') || lower.includes('alligator') || lower.includes('lizard')) return 114; // Lizard Sentinel
    return 20; // Quara Predator
  }

  if (category === 'beasts_and_animals') {
    if (lower.includes('bear') || lower.includes('panda') || lower.includes('yeti')) return 16; // Bear
    if (lower.includes('wolf') || lower.includes('dog') || lower.includes('hound')) return 27; // Wolf
    if (lower.includes('lion') || lower.includes('tiger') || lower.includes('panther') || lower.includes('cat')) return 125; // Tiger
    if (lower.includes('elephant') || lower.includes('mammoth') || lower.includes('rhino')) return 211; // Elephant
    if (lower.includes('rotworm') || lower.includes('carrion') || lower.includes('worm')) return 26; // Rotworm
    if (lower.includes('snake') || lower.includes('serpent') || lower.includes('cobra')) return 28; // Snake
    if (lower.includes('rat') || lower.includes('mouse') || lower.includes('rodent')) return 21; // Rat
    if (lower.includes('bat') || lower.includes('bird') || lower.includes('chicken') || lower.includes('parrot')) return 122; // Bat
    return 27; // Wolf
  }

  if (category === 'plants_and_nature') {
    if (lower.includes('nettle') || lower.includes('carniphila') || lower.includes('plant') || lower.includes('flower')) return 221; // Spit Nettle
    return 206; // Fernfang
  }

  if (category === 'elementals_and_magical') {
    if (lower.includes('golem') || lower.includes('stone') || lower.includes('rock') || lower.includes('mechanical') || lower.includes('worker')) return 67; // Stone Golem
    if (lower.includes('bonelord') || lower.includes('beholder') || lower.includes('gazer') || lower.includes('eye')) return 17; // Bonelord
    if (lower.includes('djinn') || lower.includes('efreet') || lower.includes('marid')) return 80; // Blue Djinn
    if (lower.includes('mimic') || lower.includes('chest') || lower.includes('box')) return 92; // Mimic
    if (lower.includes('slime') || lower.includes('blob') || lower.includes('ooze') || lower.includes('jelly')) return 19; // Slime
    return 49; // Fire Elemental
  }

  return 19; // Slime jako bezpieczny klasyczny fallback w misc
}

for (const mFile of monsterFiles) {
  try {
    const mData = fs.readJsonSync(path.join(MONSTERS_DIR_PATH, mFile));
    const stats = mData.creatureStatistics || mData;
    if (!stats.name || !stats.outfit) continue;

    const lookType = stats.outfit.id || stats.outfit.lookType;
    if (typeof lookType !== 'number' || lookType <= 0) continue;

    const category = classifyMonster(stats);
    const cleanName = sanitizeFilename(stats.name);
    const filename = `${cleanName}.png`;

    const lookDetails = {
      head: stats.outfit.lookHead || stats.outfit.head || 0,
      body: stats.outfit.lookBody || stats.outfit.body || 0,
      legs: stats.outfit.lookLegs || stats.outfit.legs || 0,
      feet: stats.outfit.lookFeet || stats.outfit.feet || 0
    };

    const isClassic74 = (lookType <= 255 && lookType !== 11);

    // 1. W Opcji 1 umieszczamy WYŁĄCZNIE czyste klasyczne potwory Tibii 7.4 (<= 255 oraz != 11)
    if (isClassic74) {
      const datObj = ob.getOutfit(lookType);
      if (datObj) {
        const pngBuffer = renderDataObjectToPNG(datObj, lookDetails);
        if (pngBuffer) {
          const catDir1 = path.join(OPTION1_DIR, 'monsters', category);
          fs.ensureDirSync(catDir1);
          fs.writeFileSync(path.join(catDir1, filename), pngBuffer);
          if (!opt1MonsterSummary[category]) opt1MonsterSummary[category] = [];
          opt1MonsterSummary[category].push({ name: stats.name, lookType: lookType, file: filename });
          monstersCount1++;
        }
      }
    }

    // 2. W Opcji 2 umieszczamy WSZYSTKIE potwory (ZARÓWNO klasyczne <= 255 we własnej autentycznej postaci,
    //    JAK I te z nowszych wersji > 255 lub z ID=11, inteligentnie dopasowane po kategoriach!)
    let adaptedLookType = lookType;
    let tintMode = null;

    if (!isClassic74) {
      const lowerName = stats.name.toLowerCase();
      if (lookType === 11 || lowerName.includes('water') || lowerName.includes('sea elemental') || lowerName.includes('ice elemental') || lowerName.includes('frost elemental') || lowerName.includes('spirit of water')) {
        adaptedLookType = 49;
        tintMode = lowerName.includes('ice') || lowerName.includes('frost') ? 'ice' : 'water';
      } else if (lowerName.includes('earth elemental') || lowerName.includes('mud elemental') || lowerName.includes('spirit of fertility')) {
        adaptedLookType = 49;
        tintMode = 'earth';
      } else if (lowerName.includes('energy elemental') || lowerName.includes('lightning elemental')) {
        adaptedLookType = 49;
      } else {
        // Dobieramy najlepiej pasujący klasyczny sprajt z danej kategorii (np. Smoki do smoka, Demony do demona, itd.)
        adaptedLookType = getSmartFallbackLookType(category, stats.name);
      }
    }

    const datObj = ob.getOutfit(adaptedLookType);
    if (datObj) {
      const pngBuffer = renderDataObjectToPNG(datObj, lookDetails, tintMode);
      if (pngBuffer) {
        const catDir2 = path.join(OPTION2_DIR, 'monsters', category);
        fs.ensureDirSync(catDir2);
        fs.writeFileSync(path.join(catDir2, filename), pngBuffer);
        if (!opt2MonsterSummary[category]) opt2MonsterSummary[category] = [];
        opt2MonsterSummary[category].push({ name: stats.name, originalLookType: lookType, adaptedLookType: adaptedLookType, tint: tintMode || 'none', file: filename });
        monstersCount2++;
      }
    }
  } catch (err) {
    // Pomijamy błędne pliki
  }
}
console.log(` -> Wyeksportowano ${monstersCount1} klasycznych potworów (Tibia 7.4) do option1_tibia_74_classic/monsters/`);
console.log(` -> Wyeksportowano ${monstersCount2} adaptowanych potworów z nowszych wersji do option2_post_74_adapted/monsters/`);

// --- ZAPIS PODSUMOWANIA I README ---
console.log('[6/6] Tworzenie dokumentacji README i podsumowań JSON...');
fs.writeJsonSync(path.join(OPTION1_DIR, 'summary.json'), {
  description: 'Czyste, autentyczne grafiki przedmiotów i potworów z Tibii 7.4',
  items_total: itemsCount1, monsters_total: monstersCount1,
  items_by_category: opt1ItemSummary, monsters_by_category: opt1MonsterSummary
}, { spaces: 2 });

fs.writeJsonSync(path.join(OPTION2_DIR, 'summary.json'), {
  description: 'Grafiki potworów i przedmiotów z nowszych wersji Tibii dopasowane wizualnie do klasycznego stylu 7.4',
  items_total: itemsCount2, monsters_total: monstersCount2,
  items_by_category: opt2ItemSummary, monsters_by_category: opt2MonsterSummary
}, { spaces: 2 });

let readme = `# 🎨 Skatalogowane Grafiki TibiaGo (Dwutorowy Eksport: Klasyczny 7.4 vs Adaptowany Post-7.4)\n\n`;
readme += `Folder zawiera dwa kompletne, starannie rozdzielone katalogi graficzne w formacie **PNG**:\n\n`;
readme += `## 🏛️ [Option 1: Klasyczna Tibia 7.4](./option1_tibia_74_classic)\n`;
readme += `Zawiera **wyłącznie autentyczne potwory i przedmioty z Tibii 7.4** (${monstersCount1} potworów, ${itemsCount1} przedmiotów). Brak w nim potworów z nowszych wersji Tibii oraz błędnych zastępczych sprajtów (takich jak ludzik przypisany do żywiołaka wody).\n\n`;
readme += `## ⚡ [Option 2: Adaptowane Potwory z Nowszych Wersji](./option2_post_74_adapted)\n`;
readme += `Zawiera potwory z nowszych wersji Tibii (np. *Massive Water Elemental*, *Ice Overlord*, *Ghazbaran*, *Earth Elemental*), które miały w plikach JSON błędne lub nieistniejące w Tibii 7.4 ID strojów.\n`;
readme += `W tym folderze zostały one **inteligentnie zrenderowane z użyciem klasycznych sprajtów z Tibii 7.4 i unikalnej tonacji barw** (np. *Massive Water Elemental* wygląda tu jak prawdziwy **Niebieski Żywiołak Wody**, a *Earth Elemental* jako **Zielony Żywiołak Ziemi**!).\n\n`;
readme += `---\n*Aby odświeżyć eksport w przyszłości, uruchom:* \`node scripts/export-categorized-graphics.js\``;

fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), readme, 'utf-8');

console.log('\n✅ Sukces! Obie opcje (klasyczna 7.4 i adaptowana post-7.4) zostały w pełni wygenerowane i zapisane w osobnych folderach!');
