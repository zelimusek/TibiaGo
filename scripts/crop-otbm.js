"use strict";

/*
 * Creates a coordinate-preserving OTBM crop without starting TibiaGo.
 *
 * The map header and absolute tile coordinates remain unchanged. Only tile
 * nodes outside the inclusive X/Y rectangle are removed, so scripts can keep
 * using the original Tibia world positions.
 *
 * Example:
 *   node scripts/crop-otbm.js \
 *     --input data/760/world/Tibia74.otbm \
 *     --output data/760/world/TibiaParty.otbm \
 *     --min-x 32450 --min-y 32294 --max-x 32600 --max-y 32450 \
 *     --spawns-input data/760/world/Tibia74-spawns.xml \
 *     --spawns-output data/760/world/TibiaParty-spawns.xml
 */

const fs = require("fs");
const path = require("path");

const NODE_ESCAPE = 0xFD;
const NODE_START = 0xFE;
const NODE_END = 0xFF;
const NODE_MAP_HEADER = 0x00;
const NODE_MAP_DATA = 0x02;
const NODE_TILE_AREA = 0x04;
const NODE_TILE = 0x05;
const NODE_HOUSE_TILE = 0x0E;

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function requiredOption(name) {
  const value = option(name);
  if (value === null) {
    throw new Error(`Missing required option: ${name}`);
  }
  return value;
}

function integerOption(name) {
  const value = Number(requiredOption(name));
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be an integer.`);
  }
  return value;
}

function decodeHeader(rawHeader) {
  const decoded = [];
  for (let index = 0; index < rawHeader.length; index++) {
    const value = rawHeader[index];
    if (value !== NODE_ESCAPE) {
      decoded.push(value);
      continue;
    }
    index++;
    if (index >= rawHeader.length) {
      throw new Error("Invalid OTBM escape at the end of a node header.");
    }
    decoded.push(rawHeader[index]);
  }
  return Buffer.from(decoded);
}

function readNodeHeader(data, start) {
  if (data[start] !== NODE_START) {
    throw new Error(`Expected OTBM node at byte ${start}.`);
  }

  let index = start + 1;
  while (index < data.length) {
    const value = data[index];
    if (value === NODE_ESCAPE) {
      index += 2;
      continue;
    }
    if (value === NODE_START || value === NODE_END) {
      const raw = data.subarray(start + 1, index);
      const decoded = decodeHeader(raw);
      if (decoded.length === 0) {
        throw new Error(`Empty OTBM node at byte ${start}.`);
      }
      return { raw, decoded, childrenStart: index };
    }
    index++;
  }

  throw new Error(`Unterminated OTBM node at byte ${start}.`);
}

function skipNode(data, start) {
  if (data[start] !== NODE_START) {
    throw new Error(`Expected OTBM node at byte ${start}.`);
  }

  let depth = 1;
  let index = start + 1;
  while (index < data.length) {
    const value = data[index];
    if (value === NODE_ESCAPE) {
      index += 2;
      continue;
    }
    if (value === NODE_START) {
      depth++;
    } else if (value === NODE_END) {
      depth--;
      if (depth === 0) {
        return index + 1;
      }
    }
    index++;
  }

  throw new Error(`Unterminated OTBM subtree at byte ${start}.`);
}

function readEscapedUInt8(buffer, state) {
  let value = buffer[state.index++];
  if (value === NODE_ESCAPE) {
    value = buffer[state.index++];
  }
  return value;
}

function readEscapedUInt16(buffer, state) {
  return readEscapedUInt8(buffer, state)
    + (readEscapedUInt8(buffer, state) << 8);
}

function tileAreaPosition(rawHeader) {
  const state = { index: 1 };
  return {
    x: readEscapedUInt16(rawHeader, state),
    y: readEscapedUInt16(rawHeader, state),
    z: readEscapedUInt8(rawHeader, state)
  };
}

function filterTileArea(data, start, bounds, statistics) {
  const header = readNodeHeader(data, start);
  const area = tileAreaPosition(header.raw);
  const output = [Buffer.from([NODE_START]), header.raw];
  let index = header.childrenStart;
  let keptTiles = 0;

  while (data[index] !== NODE_END) {
    if (data[index] !== NODE_START) {
      throw new Error(`Unexpected byte in tile area at ${index}.`);
    }

    const childHeader = readNodeHeader(data, index);
    const childType = childHeader.decoded[0];
    const childEnd = skipNode(data, index);

    if (childType === NODE_TILE || childType === NODE_HOUSE_TILE) {
      statistics.tilesRead++;
      const x = area.x + childHeader.decoded[1];
      const y = area.y + childHeader.decoded[2];
      const inside = x >= bounds.minX && x <= bounds.maxX
        && y >= bounds.minY && y <= bounds.maxY;

      if (inside) {
        output.push(data.subarray(index, childEnd));
        statistics.tilesKept++;
        keptTiles++;
        statistics.minZ = Math.min(statistics.minZ, area.z);
        statistics.maxZ = Math.max(statistics.maxZ, area.z);
      }
    } else {
      // Preserve non-tile children for forward compatibility.
      output.push(data.subarray(index, childEnd));
    }

    index = childEnd;
  }

  statistics.tileAreasRead++;
  if (keptTiles === 0) {
    return { output: null, end: index + 1 };
  }

  statistics.tileAreasKept++;
  output.push(Buffer.from([NODE_END]));
  return { output: Buffer.concat(output), end: index + 1 };
}

function filterMapData(data, start, bounds, statistics) {
  const header = readNodeHeader(data, start);
  const output = [Buffer.from([NODE_START]), header.raw];
  let index = header.childrenStart;

  while (data[index] !== NODE_END) {
    if (data[index] !== NODE_START) {
      throw new Error(`Unexpected byte in map data at ${index}.`);
    }

    const childHeader = readNodeHeader(data, index);
    if (childHeader.decoded[0] === NODE_TILE_AREA) {
      const filtered = filterTileArea(data, index, bounds, statistics);
      if (filtered.output !== null) {
        output.push(filtered.output);
      }
      index = filtered.end;
      continue;
    }

    const childEnd = skipNode(data, index);
    output.push(data.subarray(index, childEnd));
    index = childEnd;
  }

  output.push(Buffer.from([NODE_END]));
  return { output: Buffer.concat(output), end: index + 1 };
}

function filterRoot(data, start, bounds, statistics) {
  const header = readNodeHeader(data, start);
  if (header.decoded[0] !== NODE_MAP_HEADER) {
    throw new Error("The root OTBM node is not a map header.");
  }

  const output = [Buffer.from([NODE_START]), header.raw];
  let index = header.childrenStart;

  while (data[index] !== NODE_END) {
    if (data[index] !== NODE_START) {
      throw new Error(`Unexpected byte in map root at ${index}.`);
    }

    const childHeader = readNodeHeader(data, index);
    if (childHeader.decoded[0] === NODE_MAP_DATA) {
      const filtered = filterMapData(data, index, bounds, statistics);
      output.push(filtered.output);
      index = filtered.end;
      continue;
    }

    const childEnd = skipNode(data, index);
    output.push(data.subarray(index, childEnd));
    index = childEnd;
  }

  output.push(Buffer.from([NODE_END]));
  return { output: Buffer.concat(output), end: index + 1 };
}

function cropMap(input, output, bounds) {
  const inputData = fs.readFileSync(input);
  if (inputData.length < 5) {
    throw new Error("The input map is too short to be a valid OTBM file.");
  }

  const identifier = inputData.readUInt32LE(0);
  const otbmIdentifier = Buffer.from("OTBM").readUInt32LE(0);
  if (identifier !== 0 && identifier !== otbmIdentifier) {
    throw new Error("The input file does not have a valid OTBM identifier.");
  }

  const statistics = {
    tilesRead: 0,
    tilesKept: 0,
    tileAreasRead: 0,
    tileAreasKept: 0,
    minZ: Infinity,
    maxZ: -Infinity
  };
  const root = filterRoot(inputData, 4, bounds, statistics);
  if (root.end !== inputData.length) {
    throw new Error(`Unexpected trailing OTBM data after byte ${root.end}.`);
  }
  if (statistics.tilesKept === 0) {
    throw new Error("The requested rectangle does not contain any map tiles.");
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.concat([inputData.subarray(0, 4), root.output]));
  return statistics;
}

function cropSpawns(input, output, bounds) {
  const source = fs.readFileSync(input, "utf8");
  const spawnPattern = /<spawn\s+centerx="(\d+)"\s+centery="(\d+)"\s+centerz="(\d+)"\s+radius="(\d+)">([\s\S]*?)<\/spawn>/g;
  const childPattern = /\s*<(?:monster|npc)\s+[^>]*?x="(-?\d+)"\s+y="(-?\d+)"\s+z="(\d+)"[^>]*?\/>/g;
  const retainedBlocks = [];
  let spawnMatch;
  let spawnsRead = 0;
  let creaturesRead = 0;
  let creaturesKept = 0;

  while ((spawnMatch = spawnPattern.exec(source)) !== null) {
    spawnsRead++;
    const centerX = Number(spawnMatch[1]);
    const centerY = Number(spawnMatch[2]);
    const children = [];
    let childMatch;

    childPattern.lastIndex = 0;
    while ((childMatch = childPattern.exec(spawnMatch[5])) !== null) {
      creaturesRead++;
      const x = centerX + Number(childMatch[1]);
      const y = centerY + Number(childMatch[2]);
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
        continue;
      }
      children.push(childMatch[0].trim());
      creaturesKept++;
    }

    if (children.length === 0) {
      continue;
    }

    retainedBlocks.push(
      `\t<spawn centerx="${spawnMatch[1]}" centery="${spawnMatch[2]}" centerz="${spawnMatch[3]}" radius="${spawnMatch[4]}">\n`
      + children.map(child => `\t\t${child}`).join("\n")
      + "\n\t</spawn>"
    );
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `<?xml version="1.0"?>\n<spawns>\n${retainedBlocks.join("\n")}\n</spawns>\n`);
  return { spawnsRead, spawnsKept: retainedBlocks.length, creaturesRead, creaturesKept };
}

function main() {
  const input = path.resolve(requiredOption("--input"));
  const output = path.resolve(requiredOption("--output"));
  const bounds = {
    minX: integerOption("--min-x"),
    minY: integerOption("--min-y"),
    maxX: integerOption("--max-x"),
    maxY: integerOption("--max-y")
  };

  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new Error("Minimum crop coordinates must not exceed maximum coordinates.");
  }
  if (input === output) {
    throw new Error("Input and output map paths must be different.");
  }

  const mapStatistics = cropMap(input, output, bounds);
  const result = {
    input,
    output,
    bounds,
    inputBytes: fs.statSync(input).size,
    outputBytes: fs.statSync(output).size,
    map: mapStatistics
  };

  const spawnsInputOption = option("--spawns-input");
  const spawnsOutputOption = option("--spawns-output");
  if ((spawnsInputOption === null) !== (spawnsOutputOption === null)) {
    throw new Error("Use --spawns-input and --spawns-output together.");
  }
  if (spawnsInputOption !== null) {
    const spawnsInput = path.resolve(spawnsInputOption);
    const spawnsOutput = path.resolve(spawnsOutputOption);
    if (spawnsInput === spawnsOutput) {
      throw new Error("Input and output spawn paths must be different.");
    }
    result.spawns = cropSpawns(spawnsInput, spawnsOutput, bounds);
    result.spawnsInput = spawnsInput;
    result.spawnsOutput = spawnsOutput;
  }

  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
