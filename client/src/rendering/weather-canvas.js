const VIP_CIRCUIT_FLOOR = {
  from: { x: 32509, y: 32340, z: 7 },
  to: { x: 32521, y: 32352, z: 7 }
};

const WeatherCanvas = function(screen) {

  /*
   * Class WeatherCanvas
   * Wraps the screen and adds weather effects to the gameworld
   */

  // Wrapper for the screen canvas: we do not need an extra canvas
  this.screen = screen;

  // Fading state
  this.__ambientAlpha = 0;
  this.__ambientAlphaTarget = 0;
  this.__ambientAlphaStart = 0;

  this.__steps = 0;
  this.__counter = 0;

  this.__flash = 0;
  this.__isRaining = false;
  this.__weatherType = "none";
  this.__discoLights = { spotlightsEnabled: false, legacyLasersEnabled: false, intensity: 60, spotlightSpeed: 100, beatBpm: 0, radius: 0, center: null, focus: null, laserShow: null, chairGame: null, partyFlow: null };
  this.__discoLightFrame = null;
  this.__spotlightFocusVisual = null;
  this.__spotlightFocusTransition = null;
  this.__laserShowPhaseTransition = null;
  this.__chairLaserTransition = null;
  this.__partyFlowTransition = null;
  this.__vipShowTrail = [];
  this.__vipShowTrailTarget = null;
  this.__vipCrowdTrails = new Map();
  this.__laserGlyphSegments = {
    a: [-0.42, -0.55, 0.42, -0.55], b: [-0.45, -0.50, -0.45, -0.05],
    c: [0.45, -0.50, 0.45, -0.05], d: [-0.40, 0, 0.40, 0],
    e: [-0.45, 0.05, -0.45, 0.50], f: [0.45, 0.05, 0.45, 0.50],
    g: [-0.42, 0.55, 0.42, 0.55], h: [0, -0.50, 0, -0.05],
    i: [0, 0.05, 0, 0.50], j: [-0.40, -0.50, 0, -0.02],
    k: [0.40, -0.50, 0, -0.02], l: [-0.40, 0.50, 0, 0.02],
    m: [0.40, 0.50, 0, 0.02], p: [0.36, 0.48, 0.42, 0.48],
    q: [0, -0.02, 0.40, -0.50], r: [0, 0.02, 0.40, 0.50],
    s: [-0.40, -0.50, 0.40, 0.50]
  };
  this.__laserGlyphMap = {
    "0": "abcefg", "1": "cf", "2": "acdeg", "3": "acdfg", "4": "bcdf",
    "5": "abdfg", "6": "abdefg", "7": "acf", "8": "abcdefg", "9": "abcdfg",
    A: "abcdef", B: "beacdfg", C: "abeg", D: "beacfg", E: "abdeg", F: "abde",
    G: "abefgd", H: "bcdef", I: "aghi", J: "cefg", K: "beqr",
    L: "beg", M: "bejqcf", N: "bescf", O: "abcefg", P: "abcde", Q: "abcefgm",
    R: "abcdem", S: "abdfg", T: "ahi", U: "bcefg", V: "bclm", W: "bceflm",
    X: "jklm", Y: "jki", Z: "aklg", " ": "", "'": "c", ".": "p", "-": "d", "!": "hip"
  };
  this.__pipeSmokeClouds = new Map();
  this.__intoxication = null;
  this.__intoxicationBuffer = document.createElement("canvas");
  this.__rainIntensity = 0.025;
  this.__thunderIntensity = 0.0025;

  let img = new Image();
  img.src = "./png/cloud.png";
  this.cloudPattern = img;

}

WeatherCanvas.prototype.setThunder = function() {

  /*
   * Function Canvas.setThunder
   * Schedules a thunder effect
   */

  this.__flash = 5;

}

WeatherCanvas.prototype.setWeather = function(alpha) {

  /*
   * Function Canvas.setWeather
   * Sets up the weather to be shown through a fade
   */

  this.__ambientAlphaStart = this.__ambientAlpha;
  this.__ambientAlphaTarget = alpha;

  this.__steps = (500 * Math.abs(this.__ambientAlpha - alpha)) | 0;
  this.__counter = this.__steps;

}

WeatherCanvas.prototype.isRaining = function() {

  return this.__isRaining;

}

WeatherCanvas.prototype.setRaining = function(bool) {

  this.__isRaining = bool;

  if(this.__isRaining && !gameClient.player.isUnderground()) {
    gameClient.interface.soundManager.setVolume("rain", 1);
  } else {
    gameClient.interface.soundManager.setVolume("rain", 0);
  }

}

WeatherCanvas.prototype.drawThunder = function() {

  /*
   * Function Canvas.drawThunder
   * Draws a thunder flash to the screen
   */

  if(this.__flash > 0) {
    this.screen.context.globalAlpha = this.__flash / 10;
    this.screen.context.fillStyle = "white";
    this.screen.context.fillRect(0, 0, this.screen.canvas.width, this.screen.canvas.height);
    this.__flash--;

    // Extend flashes
    if(Math.random() < 0.40) {
      this.setThunder();
    }

  }

}

WeatherCanvas.prototype.handleThunder = function() {

  if(Math.random() < this.__thunderIntensity && this.isRaining() && this.__flash === 0) {
    gameClient.interface.soundManager.play("thunder");
    this.setThunder();
  }

  this.drawThunder();

}

WeatherCanvas.prototype.addPipeSmoke = function(smoke) {

  let x = Number(smoke.x);
  let y = Number(smoke.y);
  let z = Number(smoke.z);
  let intensity = Math.max(1, Math.min(10, Number(smoke.intensity) || 1));
  let radius = Math.max(1, Math.min(4, Number(smoke.radius) || 1));
  let duration = Math.max(4000, Math.min(30000, Number(smoke.duration) || 12000));

  if(!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return;
  }

  let now = performance.now();
  let key = x + "," + y + "," + z;
  this.__pipeSmokeClouds.set(key, {
    position: new Position(x, y, z),
    intensity: intensity,
    radius: radius,
    started: now,
    expires: now + duration,
    duration: duration,
    seed: Number(smoke.seed) || 1
  });

}

WeatherCanvas.prototype.setPipeIntoxication = function(dose, seed) {

  dose = Math.max(1, Math.min(10, Number(dose) || 1));
  let now = performance.now();
  this.__intoxication = {
    intensity: dose,
    started: now,
    expires: now + 9000 + dose * 1500,
    duration: 9000 + dose * 1500,
    seed: Number(seed) || 1
  };

}

WeatherCanvas.prototype.__pipeRandom = function(seed, index) {

  let value = Math.sin(seed * 0.017 + index * 91.731) * 43758.5453;
  return value - Math.floor(value);

}

WeatherCanvas.prototype.drawPipeSmoke = function() {

  if(!gameClient.player || this.__pipeSmokeClouds.size === 0) {
    return;
  }

  let context = this.screen.context;
  let now = performance.now();
  let mobile = Boolean(gameClient.touch && gameClient.touch.isMobileMode);
  let playerFloor = gameClient.player.getPosition().z;

  context.save();
  context.globalCompositeOperation = "screen";

  this.__pipeSmokeClouds.forEach(function(cloud, key) {
    if(now >= cloud.expires) {
      this.__pipeSmokeClouds.delete(key);
      return;
    }

    if(cloud.position.z !== playerFloor) {
      return;
    }

    let screenPosition = gameClient.renderer.getStaticScreenPosition(cloud.position);
    let centreX = (screenPosition.x + 0.5) * 32;
    let centreY = (screenPosition.y + 0.5) * 32;
    let elapsed = now - cloud.started;
    let remaining = (cloud.expires - now) / cloud.duration;
    let fadeIn = Math.min(1, elapsed / 700);
    let fadeOut = Math.min(1, remaining * 4);
    let opacity = fadeIn * fadeOut;
    let count = mobile
      ? Math.round(5 + cloud.intensity * 2.2)
      : Math.round(8 + cloud.intensity * 4);

    for(let index = 0; index < count; index++) {
      let angle = this.__pipeRandom(cloud.seed, index) * Math.PI * 2;
      let distance = Math.sqrt(this.__pipeRandom(cloud.seed + 19, index)) * cloud.radius * 28;
      let drift = elapsed * (0.004 + this.__pipeRandom(cloud.seed + 43, index) * 0.006);
      let x = centreX + Math.cos(angle) * distance + Math.sin(elapsed / 900 + index) * 5;
      let y = centreY + Math.sin(angle) * distance - drift % 34;
      let size = 18 + cloud.intensity * 2.2 + this.__pipeRandom(cloud.seed + 71, index) * 24;
      let alpha = opacity * (0.035 + cloud.intensity * 0.008) * (0.65 + this.__pipeRandom(cloud.seed + 97, index) * 0.5);
      let gradient = context.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, "rgba(218, 230, 226, " + alpha + ")");
      gradient.addColorStop(0.45, "rgba(173, 193, 190, " + (alpha * 0.72) + ")");
      gradient.addColorStop(1, "rgba(116, 137, 139, 0)");
      context.fillStyle = gradient;
      context.fillRect(x - size, y - size, size * 2, size * 2);
    }
  }, this);

  context.restore();

}

WeatherCanvas.prototype.drawIntoxication = function() {

  let effect = this.__intoxication;
  if(!effect) {
    return;
  }

  let now = performance.now();
  if(now >= effect.expires) {
    this.__intoxication = null;
    return;
  }

  let context = this.screen.context;
  let canvas = this.screen.canvas;
  let buffer = this.__intoxicationBuffer;
  let remaining = (effect.expires - now) / effect.duration;
  let fadeIn = Math.min(1, (now - effect.started) / 1100);
  let fadeOut = Math.min(1, remaining * 4);
  let strength = (effect.intensity / 10) * fadeIn * fadeOut;
  let mobile = Boolean(gameClient.touch && gameClient.touch.isMobileMode);

  if(buffer.width !== canvas.width || buffer.height !== canvas.height) {
    buffer.width = canvas.width;
    buffer.height = canvas.height;
  }

  let bufferContext = buffer.getContext("2d");
  bufferContext.imageSmoothingEnabled = false;
  bufferContext.clearRect(0, 0, buffer.width, buffer.height);
  bufferContext.drawImage(canvas, 0, 0);

  let swayX = Math.sin(now / 520) * 3.5 * strength;
  let swayY = Math.cos(now / 690) * 2.5 * strength;
  let zoom = 1 + 0.008 * strength;

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.filter = "hue-rotate(" + (Math.sin(now / 850) * 16 * strength) + "deg) saturate(" + (1 + 0.45 * strength) + ")";
  context.drawImage(
    buffer,
    swayX - canvas.width * (zoom - 1) / 2,
    swayY - canvas.height * (zoom - 1) / 2,
    canvas.width * zoom,
    canvas.height * zoom
  );
  context.filter = "none";

  if(effect.intensity >= 3) {
    let split = (mobile ? 1.5 : 2.5) + 4 * strength;
    context.globalCompositeOperation = "screen";
    context.globalAlpha = 0.055 + 0.09 * strength;
    context.drawImage(buffer, split, 0);
    context.globalAlpha = 0.045 + 0.07 * strength;
    context.drawImage(buffer, -split, 1);
  }

  let tint = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  let pulse = 0.5 + 0.5 * Math.sin(now / 430);
  tint.addColorStop(0, "rgba(90, 255, 175, " + ((0.025 + pulse * 0.025) * strength) + ")");
  tint.addColorStop(0.5, "rgba(160, 70, 230, " + (0.045 * strength) + ")");
  tint.addColorStop(1, "rgba(55, 130, 255, " + ((0.025 + (1 - pulse) * 0.025) * strength) + ")");
  context.globalAlpha = 1;
  context.fillStyle = tint;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if(effect.intensity >= 7) {
    let sparkles = mobile ? 7 : 13;
    context.globalCompositeOperation = "screen";
    context.fillStyle = "rgba(230, 255, 245, " + (0.25 * strength) + ")";
    for(let index = 0; index < sparkles; index++) {
      let x = this.__pipeRandom(effect.seed, index) * canvas.width;
      let y = (this.__pipeRandom(effect.seed + 37, index) * canvas.height - (now / (18 + index)) % canvas.height + canvas.height) % canvas.height;
      let size = index % 3 === 0 ? 2 : 1;
      context.fillRect(x, y, size, size);
    }
  }

  context.restore();

}

WeatherCanvas.prototype.setWeatherType = function(type) {

  this.__weatherType = type || "none";

}

WeatherCanvas.prototype.setDiscoLights = function(spotlightsEnabled, legacyLasersEnabled, intensity, spotlightSpeed, beatBpm, radius, center, focus, laserShow, chairGame, partyFlow) {

  let validFocus = focus
    && Number.isInteger(focus.targetId)
    && focus.targetPosition
    && (focus.persistent === true || (Number.isFinite(focus.durationMs) && focus.durationMs > 0));
  let previousFocus = this.__discoLights.focus;
  let transitionNow = performance.now();
  let previousFocusElapsed = previousFocus
    ? previousFocus.elapsedMs + Math.max(0, transitionNow - previousFocus.receivedAt)
    : 0;
  let previousFocusActive = previousFocus !== null
    && (previousFocus.persistent || previousFocusElapsed < previousFocus.durationMs);
  let previousTargetId = previousFocusActive ? previousFocus.targetId : null;
  let nextTargetId = validFocus ? focus.targetId : null;
  let previousLaserFocus = previousFocusActive && previousFocus.includeLasers === true;
  let nextLaserFocus = validFocus === true && focus.includeLasers === true;
  let validLaserShow = laserShow
    && (laserShow.mode === "default" || laserShow.mode === "overdrive" || laserShow.mode === "dimension" || laserShow.mode === "arcade" || laserShow.mode === "text")
    && typeof laserShow.text === "string"
    && Number.isFinite(laserShow.durationMs)
    && laserShow.durationMs > 0;
  let validChairGame = chairGame
    && ["countdown", "dancing", "claiming", "result"].includes(chairGame.phase)
    && chairGame.floor && chairGame.floor.from && chairGame.floor.to
    && Number.isFinite(chairGame.durationMs) && chairGame.durationMs > 0
    && Array.isArray(chairGame.squares);
  let previousChairGame = this.__discoLights.chairGame;
  let previousPartyFlow = this.__discoLights.partyFlow;
  let validPartyFlow = partyFlow
    && ["lobby", "roulette"].includes(partyFlow.phase)
    && partyFlow.floor && partyFlow.floor.from && partyFlow.floor.to
    && Number.isFinite(partyFlow.durationMs) && partyFlow.durationMs > 0
    && (partyFlow.phase !== "roulette" || Array.isArray(partyFlow.candidates));

  if(previousChairGame && validChairGame && previousChairGame.phase !== chairGame.phase
      && this.__discoLightFrame && this.__discoLightFrame.chairLasers) {
    this.__chairLaserTransition = {
      phase: chairGame.phase,
      startedAt: transitionNow,
      amount: this.__discoLightFrame.chairLasers.amount,
      anchorX: this.__discoLightFrame.centerX,
      anchorY: this.__discoLightFrame.centerY,
      targets: this.__discoLightFrame.chairLasers.targets.map(function(target) {
        return { x: target.x, y: target.y };
      })
    };
  } else if(!validChairGame) {
    this.__chairLaserTransition = null;
  }

  if(previousPartyFlow && validPartyFlow && previousPartyFlow.phase !== partyFlow.phase
      && this.__discoLightFrame && this.__discoLightFrame.partyFlow) {
    this.__partyFlowTransition = {
      phase: partyFlow.phase,
      startedAt: transitionNow,
      amount: this.__discoLightFrame.partyFlow.amount,
      targets: this.__discoLightFrame.partyFlow.targets.map(function(target) {
        return { x: target.x, y: target.y };
      }),
      spotlightTargets: this.__discoLightFrame.partyFlow.spotlightTargets.map(function(target) {
        return { x: target.x, y: target.y };
      })
    };
  } else if(!validPartyFlow) {
    this.__partyFlowTransition = null;
  }

  if((previousTargetId !== nextTargetId || previousLaserFocus !== nextLaserFocus) && this.__discoLightFrame && this.__discoLightFrame.lights) {
    this.__spotlightFocusTransition = {
      startedAt: transitionNow,
      laserStartAmount: previousLaserFocus ? 1 : 0,
      laserEndAmount: nextLaserFocus ? 1 : 0,
      focusCenter: this.__spotlightFocusVisual
        ? { x: this.__spotlightFocusVisual.x, y: this.__spotlightFocusVisual.y }
        : null,
      from: this.__discoLightFrame.lights.map(function(light) {
        return { x: light.targetX, y: light.targetY };
      })
    };
  }

  if(!validFocus || !this.__discoLights.focus || this.__discoLights.focus.targetId !== focus.targetId) {
    this.__spotlightFocusVisual = null;
  }

  this.__discoLights = {
    spotlightsEnabled: spotlightsEnabled === true,
    legacyLasersEnabled: legacyLasersEnabled === true,
    intensity: Math.max(10, Math.min(100, Number(intensity) || 60)),
    spotlightSpeed: Number.isInteger(spotlightSpeed) && spotlightSpeed >= 0 && spotlightSpeed <= 250 ? spotlightSpeed : 100,
    beatBpm: Number.isInteger(beatBpm) ? beatBpm : 0,
    radius: Math.max(0, Math.min(20, Number(radius) || 0)),
    center: center && Number.isInteger(center.x) && Number.isInteger(center.y) && Number.isInteger(center.z) ? center : null,
    focus: validFocus ? {
      targetId: focus.targetId,
      targetName: typeof focus.targetName === "string" ? focus.targetName.slice(0, 80) : "",
      source: typeof focus.source === "string" ? focus.source.slice(0, 80) : "unknown",
      targetPosition: focus.targetPosition,
      elapsedMs: Math.max(0, Number(focus.elapsedMs) || 0),
      persistent: focus.persistent === true,
      durationMs: focus.persistent === true ? null : focus.durationMs,
      flashDurationMs: Math.max(0, Number(focus.flashDurationMs) || 0),
      flashCount: Math.max(0, Number(focus.flashCount) || 0),
      includeLasers: focus.includeLasers === true,
      vipShow: focus.vipShow && typeof focus.vipShow === "object"
        && ["rainbow", "fire", "ice", "toxic", "romance"].includes(focus.vipShow.preset)
        && ["soft", "normal", "intense"].includes(focus.vipShow.intensity)
        ? {
          effect: [
            "laser", "hologram", "wings", "equalizer", "vortex", "portal", "comet",
            "rewind", "helix", "pixel", "soundwave", "cage", "duel", "discoball",
            "constellation", "combo", "name", "circuit", "all"
          ].includes(focus.vipShow.effect) ? focus.vipShow.effect : "laser",
          preset: focus.vipShow.preset,
          intensity: focus.vipShow.intensity,
          crowd: focus.vipShow.crowd === true,
          participants: Array.isArray(focus.vipShow.participants)
            ? focus.vipShow.participants.slice(0, 24).filter(function(participant) {
              return participant
                && Number.isInteger(participant.targetId)
                && participant.targetPosition
                && Number.isInteger(participant.targetPosition.x)
                && Number.isInteger(participant.targetPosition.y)
                && Number.isInteger(participant.targetPosition.z);
            }).map(function(participant) {
              return {
                targetId: participant.targetId,
                targetName: typeof participant.targetName === "string"
                  ? participant.targetName.slice(0, 80)
                  : "",
                targetPosition: participant.targetPosition
              };
            })
            : []
        }
        : null,
      receivedAt: performance.now()
    } : null,
    laserShow: validLaserShow ? {
      mode: laserShow.mode,
      text: laserShow.text.slice(0, 12),
      elapsedMs: Math.max(0, Number(laserShow.elapsedMs) || 0),
      durationMs: laserShow.durationMs,
      receivedAt: performance.now()
    } : null,
    chairGame: validChairGame ? {
      phase: chairGame.phase,
      elapsedMs: Math.max(0, Number(chairGame.elapsedMs) || 0),
      durationMs: chairGame.durationMs,
      round: Math.max(0, Number(chairGame.round) || 0),
      remaining: Math.max(0, Number(chairGame.remaining) || 0),
      floor: chairGame.floor,
      squares: chairGame.squares.slice(0, 168).filter(function(position) {
        return position && Number.isInteger(position.x) && Number.isInteger(position.y) && Number.isInteger(position.z);
      }),
      receivedAt: performance.now()
    } : null,
    partyFlow: validPartyFlow ? {
      phase: partyFlow.phase,
      elapsedMs: Math.max(0, Number(partyFlow.elapsedMs) || 0),
      durationMs: partyFlow.durationMs,
      maximumDurationMs: Math.max(1, Number(partyFlow.maximumDurationMs) || partyFlow.durationMs),
      waitingForPlayers: partyFlow.waitingForPlayers === true,
      floor: partyFlow.floor,
      winnerId: Number.isInteger(partyFlow.winnerId) ? partyFlow.winnerId : null,
      candidates: Array.isArray(partyFlow.candidates)
        ? partyFlow.candidates.slice(0, 64).filter(function(candidate) {
          return candidate && Number.isInteger(candidate.targetId) && candidate.targetPosition;
        })
        : [],
      lastBonus: partyFlow.lastBonus && partyFlow.lastBonus.position
        ? {
          playerId: partyFlow.lastBonus.playerId,
          playerName: partyFlow.lastBonus.playerName || "",
          position: partyFlow.lastBonus.position,
          addedSeconds: Math.max(0, Number(partyFlow.lastBonus.addedSeconds) || 0),
          elapsedMs: Math.max(0, Number(partyFlow.lastBonus.elapsedMs) || 0)
        }
        : null,
      receivedAt: performance.now()
    } : null
  };
  this.__discoLightFrame = null;

}

WeatherCanvas.prototype.__getLaserGlyphLines = function(character, centerX, centerY, scale) {

  let keys = this.__laserGlyphMap[character] || this.__laserGlyphMap["-"];
  return keys.split("").map(function(key) {
    let segment = this.__laserGlyphSegments[key];
    return {
      x1: centerX + segment[0] * scale,
      y1: centerY + segment[1] * scale,
      x2: centerX + segment[2] * scale,
      y2: centerY + segment[3] * scale
    };
  }, this);

}

WeatherCanvas.prototype.__getLaserTextChoreography = function(text, progress, centerX, centerY, radius, elapsedMs, entryTargets, maximumWidth, maximumScale) {

  text = text || "CYRK";
  let availableWidth = Number.isFinite(maximumWidth) ? maximumWidth : Math.max(180, radius * 64 * 1.70);
  let scale = Math.min(Number.isFinite(maximumScale) ? maximumScale : 76, availableWidth / Math.max(1, text.length * 1.12));
  let advance = scale * 1.12;
  let startX = centerX - advance * (text.length - 1) * 0.5;
  let drawableIndices = [];
  for(let textIndex = 0; textIndex < text.length; textIndex++) {
    if(text[textIndex] !== " ") drawableIndices.push(textIndex);
  }
  if(drawableIndices.length === 0) drawableIndices.push(0);
  let revealPosition = Math.max(0, Math.min(drawableIndices.length - 0.001, progress * drawableIndices.length));
  let currentSlot = Math.floor(revealPosition);
  let currentIndex = drawableIndices[currentSlot];
  let letterProgress = revealPosition - currentSlot;
  let trailLines = [];

  for(let slot = 0; slot < currentSlot; slot++) {
    let index = drawableIndices[slot];
    let lines = this.__getLaserGlyphLines(text[index], startX + index * advance, centerY, scale);
    lines.forEach(function(line) {
      line.alpha = 0.46;
      line.colorIndex = index % 3;
      trailLines.push(line);
    });
  }

  let currentLines = this.__getLaserGlyphLines(text[currentIndex] || "-", startX + currentIndex * advance, centerY, scale);
  if(currentLines.length === 0) currentLines = this.__getLaserGlyphLines("-", centerX, centerY, scale);
  let pathSteps = [];
  currentLines.forEach(function(line, index) {
    if(index > 0) {
      let previous = currentLines[index - 1];
      let travelLength = Math.hypot(line.x1 - previous.x2, line.y1 - previous.y2);
      if(travelLength > 0.5) {
        pathSteps.push({
          x1: previous.x2, y1: previous.y2,
          x2: line.x1, y2: line.y1,
          length: travelLength,
          draw: false
        });
      }
    }
    pathSteps.push({
      x1: line.x1, y1: line.y1,
      x2: line.x2, y2: line.y2,
      length: Math.hypot(line.x2 - line.x1, line.y2 - line.y1),
      draw: true
    });
  });
  let totalLength = pathSteps.reduce(function(total, step) { return total + step.length; }, 0);
  let writtenLength = totalLength * letterProgress;
  let remainingWritten = writtenLength;
  pathSteps.forEach(function(step) {
    let length = step.length;
    if(remainingWritten <= 0) return;
    let portion = Math.min(1, remainingWritten / length);
    if(step.draw) {
      trailLines.push({
        x1: step.x1,
        y1: step.y1,
        x2: step.x1 + (step.x2 - step.x1) * portion,
        y2: step.y1 + (step.y2 - step.y1) * portion,
        alpha: 1,
        colorIndex: currentIndex % 3
      });
    }
    remainingWritten -= length;
  });

  function pointAtDistance(distance) {
    let remaining = Math.max(0, Math.min(totalLength, distance));
    for(let index = 0; index < pathSteps.length; index++) {
      let step = pathSteps[index];
      let length = step.length;
      if(remaining <= length || index === pathSteps.length - 1) {
        let portion = length > 0 ? Math.min(1, remaining / length) : 0;
        return {
          x: step.x1 + (step.x2 - step.x1) * portion,
          y: step.y1 + (step.y2 - step.y1) * portion
        };
      }
      remaining -= length;
    }
    return { x: pathSteps[0].x1, y: pathSteps[0].y1 };
  }

  let targets = Array.from({ length: 9 }, function(_, index) {
    return pointAtDistance(writtenLength - index * totalLength * 0.028);
  });

  let approachProgress = Math.min(1, Math.max(0, elapsedMs / 700));
  let approachEase = 1 - Math.pow(1 - approachProgress, 3);
  if(entryTargets && approachProgress < 1) {
    targets = targets.map(function(target, index) {
      let entry = entryTargets[index] || entryTargets[0] || target;
      return {
        x: entry.x + (target.x - entry.x) * approachEase,
        y: entry.y + (target.y - entry.y) * approachEase
      };
    });
  }

  return { targets: targets, trailLines: trailLines };

}

WeatherCanvas.prototype.__getLaserTextHoldChoreography = function(text, centerX, centerY, radius, elapsedMs, maximumWidth, orbitPadding) {

  let completed = this.__getLaserTextChoreography(text, 0.999999, centerX, centerY, radius, 1000, null, maximumWidth);
  let trailLines = completed.trailLines;
  trailLines.forEach(function(line) { line.alpha = 0.78; });
  let minX = Math.min.apply(null, trailLines.map(function(line) { return Math.min(line.x1, line.x2); }));
  let maxX = Math.max.apply(null, trailLines.map(function(line) { return Math.max(line.x1, line.x2); }));
  let minY = Math.min.apply(null, trailLines.map(function(line) { return Math.min(line.y1, line.y2); }));
  let maxY = Math.max.apply(null, trailLines.map(function(line) { return Math.max(line.y1, line.y2); }));
  let orbitCenterX = (minX + maxX) * 0.5;
  let orbitCenterY = (minY + maxY) * 0.5;
  let padding = Number.isFinite(orbitPadding) ? orbitPadding : 58;
  let orbitRadiusX = (maxX - minX) * 0.5 + padding;
  let orbitRadiusY = (maxY - minY) * 0.5 + padding * 0.9;
  let orbitAngle = elapsedMs * Math.PI * 2 / 6500;
  let targets = Array.from({ length: 9 }, function(_, index) {
    let angle = orbitAngle + index * Math.PI * 2 / 9;
    return {
      x: orbitCenterX + Math.cos(angle) * orbitRadiusX,
      y: orbitCenterY + Math.sin(angle) * orbitRadiusY
    };
  });
  return { targets: targets, trailLines: trailLines };

}

WeatherCanvas.prototype.__getLaserStackedTextChoreography = function(progress, centerX, centerY, radius, elapsedMs, entryTargets) {

  let rows = [
    { text: "CYRK", y: centerY - 108, width: 310 },
    { text: "PARTY", y: centerY, width: 340 },
    { text: "ZONE", y: centerY + 108, width: 310 }
  ];
  let rowDuration = 10000 / rows.length;
  let rowPosition = Math.min(rows.length - 0.001, Math.max(0, progress) * rows.length);
  let currentRow = Math.floor(rowPosition);
  let trailLines = [];
  let previousTargets = entryTargets;

  for(let index = 0; index < currentRow; index++) {
    let completed = this.__getLaserTextChoreography(rows[index].text, 0.999999, centerX, rows[index].y, radius, 1000, null, rows[index].width);
    completed.trailLines.forEach(function(line) {
      line.alpha = 0.54;
      trailLines.push(line);
    });
    previousTargets = completed.targets;
  }

  let localProgress = rowPosition - currentRow;
  let rowElapsed = localProgress * rowDuration;
  let drawProgress = Math.max(0, rowElapsed - 700) / Math.max(1, rowDuration - 700);
  let row = rows[currentRow];
  let current = this.__getLaserTextChoreography(
    row.text,
    drawProgress,
    centerX,
    row.y,
    radius,
    rowElapsed,
    previousTargets,
    row.width
  );
  current.trailLines.forEach(function(line) { trailLines.push(line); });
  return { targets: current.targets, trailLines: trailLines };

}

WeatherCanvas.prototype.__getLaserStackedTextHoldChoreography = function(centerX, centerY, radius, elapsedMs) {

  let rows = [
    { text: "CYRK", y: centerY - 108, width: 310 },
    { text: "PARTY", y: centerY, width: 340 },
    { text: "ZONE", y: centerY + 108, width: 310 }
  ];
  let trailLines = [];
  rows.forEach(function(row) {
    let completed = this.__getLaserTextChoreography(row.text, 0.999999, centerX, row.y, radius, 1000, null, row.width);
    completed.trailLines.forEach(function(line) {
      line.alpha = 0.74;
      trailLines.push(line);
    });
  }, this);

  function framePoint(position) {
    let edgePosition = ((position % 1) + 1) % 1 * 4;
    let edge = Math.floor(edgePosition);
    let along = edgePosition - edge;
    let half = 176;
    if(edge === 0) return { x: centerX - half + along * half * 2, y: centerY - half };
    if(edge === 1) return { x: centerX + half, y: centerY - half + along * half * 2 };
    if(edge === 2) return { x: centerX + half - along * half * 2, y: centerY + half };
    return { x: centerX - half, y: centerY + half - along * half * 2 };
  }

  let offset = elapsedMs / 7200;
  let targets = Array.from({ length: 9 }, function(_, index) {
    return framePoint(offset + index / 9);
  });
  return { targets: targets, trailLines: trailLines };

}

WeatherCanvas.prototype.__getLaserShowFrame = function(show, centerX, centerY, radius, now) {

  let elapsedMs = show.elapsedMs + Math.max(0, now - show.receivedAt);
  let remainingMs = Math.max(0, show.durationMs - elapsedMs);
  let amount = Math.max(0, Math.min(1, elapsedMs / 1300, remainingMs / 1300));
  let targets = [];
  let trailLines = [];
  let phase = "opening";
  let angleTime = elapsedMs * Math.PI * 2 / 4200;
  let customSpotlightTargets = null;
  let spotlightsFollowLaserTargets = false;
  let floorHalf = Math.max(32, radius * 32);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function easeInOut(progress) {
    progress = clamp(progress, 0, 1);
    return progress * progress * (3 - 2 * progress);
  }

  function squarePerimeterPoint(position, halfSize) {
    let edgePosition = ((position % 1) + 1) % 1 * 4;
    let edge = Math.floor(edgePosition);
    let along = edgePosition - edge;
    if(edge === 0) return { x: centerX - halfSize + along * halfSize * 2, y: centerY - halfSize };
    if(edge === 1) return { x: centerX + halfSize, y: centerY - halfSize + along * halfSize * 2 };
    if(edge === 2) return { x: centerX + halfSize - along * halfSize * 2, y: centerY + halfSize };
    return { x: centerX - halfSize, y: centerY + halfSize - along * halfSize * 2 };
  }

  function squareTargets(halfSize, offset, reverse) {
    return Array.from({ length: 9 }, function(_, index) {
      let position = offset + (reverse ? -index : index) / 9;
      return squarePerimeterPoint(position, halfSize);
    });
  }

  function addSegment(x1, y1, x2, y2, alpha, colorIndex) {
    trailLines.push({ x1: x1, y1: y1, x2: x2, y2: y2, alpha: alpha, colorIndex: colorIndex });
  }

  function addSquare(halfSize, alpha, colorIndex, angle) {
    let corners = [
      { x: -halfSize, y: -halfSize }, { x: halfSize, y: -halfSize },
      { x: halfSize, y: halfSize }, { x: -halfSize, y: halfSize }
    ];
    if(angle) {
      corners = corners.map(function(point) {
        return {
          x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
          y: point.x * Math.sin(angle) + point.y * Math.cos(angle)
        };
      });
    }
    corners.forEach(function(point) { point.x += centerX; point.y += centerY; });
    for(let index = 0; index < 4; index++) {
      let next = corners[(index + 1) % 4];
      addSegment(corners[index].x, corners[index].y, next.x, next.y, alpha, (colorIndex + index) % 3);
    }
  }

  function addPartialSquare(halfSize, progress, alpha, colorIndex) {
    let remaining = clamp(progress, 0, 1) * 4;
    for(let edge = 0; edge < 4 && remaining > 0; edge++) {
      let portion = Math.min(1, remaining);
      let start = squarePerimeterPoint(edge / 4, halfSize);
      let end = squarePerimeterPoint((edge + portion) / 4, halfSize);
      addSegment(start.x, start.y, end.x, end.y, alpha, (colorIndex + edge) % 3);
      remaining -= portion;
    }
  }

  function buildSquareSpiral(halfSize, step) {
    let points = [];
    for(let inset = 0; halfSize - inset >= 0; inset += step) {
      let low = -halfSize + inset;
      let high = halfSize - inset;
      if(low > high) break;
      if(points.length === 0) points.push({ x: low, y: low });
      else points.push({ x: low, y: low });
      points.push({ x: high, y: low });
      points.push({ x: high, y: high });
      points.push({ x: low, y: high });
      if(high - low <= step) break;
    }
    return points.map(function(point) { return { x: centerX + point.x, y: centerY + point.y }; });
  }

  function buildPath(points) {
    let segments = [];
    let totalLength = 0;
    for(let index = 1; index < points.length; index++) {
      let length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      segments.push({ from: points[index - 1], to: points[index], start: totalLength, length: length });
      totalLength += length;
    }
    return { segments: segments, totalLength: totalLength };
  }

  function pointAlongPath(path, distance) {
    distance = clamp(distance, 0, path.totalLength);
    for(let index = 0; index < path.segments.length; index++) {
      let segment = path.segments[index];
      if(distance <= segment.start + segment.length || index === path.segments.length - 1) {
        let portion = segment.length > 0 ? clamp((distance - segment.start) / segment.length, 0, 1) : 0;
        return {
          x: segment.from.x + (segment.to.x - segment.from.x) * portion,
          y: segment.from.y + (segment.to.y - segment.from.y) * portion
        };
      }
    }
    return { x: centerX, y: centerY };
  }

  function addPathTrail(path, distance, alpha) {
    path.segments.forEach(function(segment, index) {
      if(segment.start >= distance) return;
      let portion = clamp((distance - segment.start) / Math.max(1, segment.length), 0, 1);
      addSegment(
        segment.from.x, segment.from.y,
        segment.from.x + (segment.to.x - segment.from.x) * portion,
        segment.from.y + (segment.to.y - segment.from.y) * portion,
        alpha, index % 3
      );
    });
  }

  function ringTargets(ringRadius, twist, alternate) {
    return Array.from({ length: 9 }, function(_, index) {
      let localRadius = alternate ? ringRadius * (index % 2 === 0 ? 1 : 0.52) : ringRadius;
      let angle = twist + index * Math.PI * 2 / 9;
      return { x: centerX + Math.cos(angle) * localRadius, y: centerY + Math.sin(angle) * localRadius * 0.72 };
    });
  }

  if(show.mode === "default") {
    if(elapsedMs < 4000) {
      phase = "border-ignition";
      let progress = easeInOut(elapsedMs / 4000);
      let halfSize = 28 + (floorHalf - 28) * progress;
      targets = squareTargets(halfSize, elapsedMs / 9000, false);
      addPartialSquare(floorHalf, progress, 0.92, 0);
      customSpotlightTargets = [
        squarePerimeterPoint(0, halfSize), squarePerimeterPoint(0.25, halfSize),
        squarePerimeterPoint(0.5, halfSize), squarePerimeterPoint(0.75, halfSize)
      ];
    } else if(elapsedMs < 9000) {
      phase = "neon-frame";
      let local = elapsedMs - 4000;
      targets = squareTargets(floorHalf, local / 7000, false);
      addSquare(floorHalf, 0.78 + Math.sin(local / 230) * 0.12, 0, 0);
    } else if(elapsedMs < 20000) {
      phase = "square-implosion";
      let local = elapsedMs - 9000;
      let squareSizes = [floorHalf, 160, 128, 96, 64, 32];
      let position = clamp(local / 11000, 0, 0.999999) * squareSizes.length;
      let level = Math.min(squareSizes.length - 1, Math.floor(position));
      let levelProgress = position - level;
      let halfSize = squareSizes[level];
      for(let complete = 0; complete < level; complete++) addSquare(squareSizes[complete], 0.22, complete % 3, 0);
      addPartialSquare(halfSize, levelProgress, 0.94, level % 3);
      targets = squareTargets(halfSize, levelProgress * 0.72, level % 2 === 1);
    } else if(elapsedMs < 29000) {
      phase = "square-spiral";
      let local = elapsedMs - 20000;
      let progress = easeInOut(local / 9000);
      let spiralPath = buildPath(buildSquareSpiral(floorHalf, 32));
      let headDistance = spiralPath.totalLength * progress;
      let trainSpacing = spiralPath.totalLength * 0.026 * Math.sin(progress * Math.PI);
      targets = Array.from({ length: 9 }, function(_, index) {
        return pointAlongPath(spiralPath, headDistance - index * trainSpacing);
      });
      addPathTrail(spiralPath, headDistance, 0.72);
    } else if(elapsedMs < 36000) {
      phase = "square-reactor";
      let local = elapsedMs - 29000;
      let progress = local / 7000;
      let reactorAngle = Math.sin(progress * Math.PI * 4) * Math.PI / 4;
      let reactorHalf = 76 + Math.sin(progress * Math.PI * 6) * 34;
      let baseTargets = squareTargets(reactorHalf, progress * 1.5, false);
      targets = baseTargets.map(function(target) {
        let x = target.x - centerX;
        let y = target.y - centerY;
        return {
          x: centerX + x * Math.cos(reactorAngle) - y * Math.sin(reactorAngle),
          y: centerY + x * Math.sin(reactorAngle) + y * Math.cos(reactorAngle)
        };
      });
      addSquare(reactorHalf, 0.88, 1, reactorAngle);
    } else if(elapsedMs < 43000) {
      phase = "grid-scanner";
      let local = elapsedMs - 36000;
      let scan = (Math.sin(local / 7000 * Math.PI * 3 - Math.PI / 2) + 1) * 0.5;
      let scanPosition = -floorHalf + scan * floorHalf * 2;
      targets = [
        { x: centerX + scanPosition, y: centerY - floorHalf }, { x: centerX + scanPosition, y: centerY }, { x: centerX + scanPosition, y: centerY + floorHalf },
        { x: centerX - floorHalf, y: centerY + scanPosition }, { x: centerX, y: centerY + scanPosition }, { x: centerX + floorHalf, y: centerY + scanPosition },
        { x: centerX + scanPosition, y: centerY + scanPosition }, { x: centerX - scanPosition, y: centerY + scanPosition }, { x: centerX + scanPosition, y: centerY - scanPosition }
      ];
      [-28, 0, 28].forEach(function(offset, index) {
        let vertical = clamp(scanPosition + offset, -floorHalf, floorHalf);
        let horizontal = clamp(scanPosition + offset, -floorHalf, floorHalf);
        addSegment(centerX + vertical, centerY - floorHalf, centerX + vertical, centerY + floorHalf, index === 1 ? 0.58 : 0.2, index);
        addSegment(centerX - floorHalf, centerY + horizontal, centerX + floorHalf, centerY + horizontal, index === 1 ? 0.58 : 0.2, index + 1);
      });
    } else if(elapsedMs < 49000) {
      phase = "power-grid";
      let local = elapsedMs - 43000;
      let progress = local / 6000;
      let spacing = 104 + Math.sin(progress * Math.PI * 6) * 18;
      let rotation = Math.sin(progress * Math.PI * 2) * Math.PI / 4;
      targets = Array.from({ length: 9 }, function(_, index) {
        let x = (index % 3 - 1) * spacing;
        let y = (Math.floor(index / 3) - 1) * spacing;
        return {
          x: centerX + x * Math.cos(rotation) - y * Math.sin(rotation),
          y: centerY + x * Math.sin(rotation) + y * Math.cos(rotation)
        };
      });
      for(let row = -1; row <= 1; row++) {
        addSegment(centerX - spacing, centerY + row * spacing, centerX + spacing, centerY + row * spacing, 0.38, row + 1);
        addSegment(centerX + row * spacing, centerY - spacing, centerX + row * spacing, centerY + spacing, 0.38, row + 2);
      }
    } else if(elapsedMs < 54000) {
      phase = "center-explosion";
      let local = elapsedMs - 49000;
      if(local < 2800) {
        let progress = easeInOut(local / 2800);
        let spacing = 104 * (1 - progress);
        targets = Array.from({ length: 9 }, function(_, index) {
          return { x: centerX + (index % 3 - 1) * spacing, y: centerY + (Math.floor(index / 3) - 1) * spacing };
        });
      } else {
        let progress = easeInOut((local - 2800) / 2200);
        targets = squareTargets(floorHalf * progress, 0.35 * progress, false);
        addPartialSquare(floorHalf, progress, 1, 2);
      }
    } else if(elapsedMs < 61000) {
      phase = "text";
      let textElapsed = elapsedMs - 54000;
      let textEntryTargets = squareTargets(floorHalf, 0.35, false);
      let textFrame = this.__getLaserTextChoreography("CYRK", Math.max(0, textElapsed - 700) / 6300, centerX, centerY, radius, textElapsed, textEntryTargets);
      targets = textFrame.targets;
      trailLines = textFrame.trailLines;
    } else if(elapsedMs < 66000) {
      phase = "text-hold";
      let holdFrame = this.__getLaserTextHoldChoreography("CYRK", centerX, centerY, radius, elapsedMs - 61000);
      targets = holdFrame.targets;
      trailLines = holdFrame.trailLines;
    } else {
      phase = "square-finale";
      let finaleProgress = clamp((elapsedMs - 66000) / 9000, 0, 1);
      let finaleSizes = [32, 64, 96, 128, 160, floorHalf];
      let position = Math.min(finaleSizes.length - 0.001, finaleProgress * finaleSizes.length);
      let level = Math.floor(position);
      let levelProgress = position - level;
      for(let complete = 0; complete < level; complete++) addSquare(finaleSizes[complete], 0.2 + complete * 0.07, complete % 3, 0);
      addPartialSquare(finaleSizes[level], levelProgress, 1, level % 3);
      targets = squareTargets(finaleSizes[level], levelProgress * 0.8, level % 2 === 1);
    }
  } else if(show.mode === "overdrive") {
    if(elapsedMs < 7000) {
      phase = "beam-awakening";
      let progress = elapsedMs / 7000;
      targets = Array.from({ length: 9 }, function(_, index) {
        let wake = easeInOut((progress - index * 0.065) / 0.42);
        let destination = squarePerimeterPoint(0.125 + index / 9, floorHalf);
        let target = {
          x: centerX + (destination.x - centerX) * wake,
          y: centerY + (destination.y - centerY) * wake
        };
        if(wake > 0) addSegment(centerX, centerY, target.x, target.y, 0.16 + wake * 0.56, index % 3);
        return target;
      });
    } else if(elapsedMs < 15000) {
      phase = "neon-curtains";
      let progress = (elapsedMs - 7000) / 8000;
      let sweepPosition = Math.min(3.999999, progress * 4);
      let sweep = Math.floor(sweepPosition);
      let along = easeInOut(sweepPosition - sweep);
      let moving = -floorHalf + along * floorHalf * 2;
      if(sweep === 1 || sweep === 3) moving = -moving;
      targets = Array.from({ length: 9 }, function(_, index) {
        let distributed = -floorHalf + index * floorHalf * 2 / 8;
        return sweep < 2
          ? { x: centerX + moving, y: centerY + distributed }
          : { x: centerX + distributed, y: centerY + moving };
      });
      if(sweep < 2) addSegment(centerX + moving, centerY - floorHalf, centerX + moving, centerY + floorHalf, 0.94, sweep);
      else addSegment(centerX - floorHalf, centerY + moving, centerX + floorHalf, centerY + moving, 0.94, sweep);
    } else if(elapsedMs < 23000) {
      phase = "laser-clock";
      let progress = (elapsedMs - 15000) / 8000;
      let clockRadius = floorHalf * 0.86;
      targets = Array.from({ length: 9 }, function(_, index) {
        let speed = 1 + (index % 3) * 0.32;
        let angle = -Math.PI / 2 + index * Math.PI * 2 / 9 + progress * Math.PI * 2 * speed;
        let target = { x: centerX + Math.cos(angle) * clockRadius, y: centerY + Math.sin(angle) * clockRadius };
        addSegment(centerX, centerY, target.x, target.y, 0.3 + (index % 3) * 0.13, index % 3);
        return target;
      });
    } else if(elapsedMs < 31000) {
      phase = "prism-split";
      let progress = (elapsedMs - 23000) / 8000;
      let prismProgress;
      if(progress < 0.4) {
        prismProgress = 1 - easeInOut(progress / 0.4);
        targets = ringTargets(floorHalf * 0.86 * prismProgress, angleTime * 0.35, false);
      } else {
        prismProgress = easeInOut((progress - 0.4) / 0.6);
        targets = squareTargets(floorHalf * prismProgress, 0.08, false);
      }
      targets.forEach(function(target, index) {
        addSegment(centerX, centerY, target.x, target.y, 0.2 + prismProgress * 0.72, index % 3);
      });
    } else if(elapsedMs < 42000) {
      phase = "laser-snake";
      let progress = easeInOut((elapsedMs - 31000) / 11000);
      let snakePoints = [
        { x: centerX - floorHalf, y: centerY - floorHalf }, { x: centerX + floorHalf, y: centerY - floorHalf },
        { x: centerX + floorHalf, y: centerY - 96 }, { x: centerX - floorHalf, y: centerY - 96 },
        { x: centerX - floorHalf, y: centerY - 32 }, { x: centerX + floorHalf, y: centerY - 32 },
        { x: centerX + floorHalf, y: centerY + 32 }, { x: centerX - floorHalf, y: centerY + 32 },
        { x: centerX - floorHalf, y: centerY + 96 }, { x: centerX + floorHalf, y: centerY + 96 },
        { x: centerX + floorHalf, y: centerY + floorHalf }, { x: centerX - floorHalf, y: centerY + floorHalf }
      ];
      let snakePath = buildPath(snakePoints);
      let headDistance = snakePath.totalLength * progress;
      let spacing = snakePath.totalLength * 0.028 * Math.sin(progress * Math.PI);
      targets = Array.from({ length: 9 }, function(_, index) {
        return pointAlongPath(snakePath, headDistance - index * spacing);
      });
      addPathTrail(snakePath, headDistance, 0.7);
    } else if(elapsedMs < 50000) {
      phase = "neon-ping-pong";
      let progress = (elapsedMs - 42000) / 8000;
      let paddleY = Math.sin(progress * Math.PI * 8) * 76;
      let bounce = 1 - Math.abs((progress * 8) % 2 - 1);
      let ballX = -floorHalf * 0.72 + bounce * floorHalf * 1.44;
      let ballY = Math.sin(progress * Math.PI * 8) * 88;
      targets = Array.from({ length: 9 }, function(_, index) {
        if(index === 8) return { x: centerX + ballX, y: centerY + ballY };
        let left = index < 4;
        let slot = index % 4;
        return {
          x: centerX + (left ? -floorHalf * 0.82 : floorHalf * 0.82),
          y: centerY + paddleY + (slot - 1.5) * 24
        };
      });
      addSegment(centerX - floorHalf * 0.82, centerY + paddleY - 48, centerX - floorHalf * 0.82, centerY + paddleY + 48, 0.88, 0);
      addSegment(centerX + floorHalf * 0.82, centerY + paddleY - 48, centerX + floorHalf * 0.82, centerY + paddleY + 48, 0.88, 2);
      let previousBall = null;
      for(let sample = 0; sample <= 10; sample++) {
        let sampleProgress = Math.max(0, progress - 0.1 + sample * 0.01);
        let sampleBounce = 1 - Math.abs((sampleProgress * 8) % 2 - 1);
        let ball = {
          x: centerX - floorHalf * 0.72 + sampleBounce * floorHalf * 1.44,
          y: centerY + Math.sin(sampleProgress * Math.PI * 8) * 88
        };
        if(previousBall) addSegment(previousBall.x, previousBall.y, ball.x, ball.y, 0.12 + sample * 0.055, sample % 3);
        previousBall = ball;
      }
    } else if(elapsedMs < 58000) {
      phase = "closing-gates";
      let progress = (elapsedMs - 50000) / 8000;
      let gateSpan = 42 + Math.abs(Math.sin(progress * Math.PI * 3)) * 125;
      let rotation = progress * Math.PI * 1.5;
      targets = Array.from({ length: 9 }, function(_, index) {
        let firstGate = index < 5;
        let count = firstGate ? 5 : 4;
        let localIndex = firstGate ? index : index - 5;
        let distance = count > 1 ? -gateSpan + localIndex * gateSpan * 2 / (count - 1) : 0;
        let angle = rotation + (firstGate ? Math.PI / 4 : -Math.PI / 4);
        let target = { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance };
        addSegment(centerX, centerY, target.x, target.y, 0.56, firstGate ? 0 : 2);
        return target;
      });
    } else if(elapsedMs < 67000) {
      phase = "triple-orbit";
      let progress = (elapsedMs - 58000) / 9000;
      let convergence = easeInOut((progress - 0.62) / 0.38);
      let separation = 112 * (1 - convergence);
      let orbitRadius = 36 + Math.sin(progress * Math.PI * 8) * 9;
      targets = Array.from({ length: 9 }, function(_, index) {
        let group = Math.floor(index / 3) - 1;
        let member = index % 3;
        let orbitX = centerX + group * separation;
        let angle = progress * Math.PI * 5 * (group === 0 ? -1 : 1) + member * Math.PI * 2 / 3;
        let target = { x: orbitX + Math.cos(angle) * orbitRadius, y: centerY + Math.sin(angle) * orbitRadius };
        addSegment(orbitX, centerY, target.x, target.y, 0.52, group + 1);
        return target;
      });
    } else if(elapsedMs < 75000) {
      phase = "laser-equalizer";
      let local = elapsedMs - 67000;
      targets = Array.from({ length: 9 }, function(_, index) {
        let x = centerX - 160 + index * 40;
        let beat = (Math.sin(local / 210 + index * 1.37) + 1) * 0.5;
        let height = 30 + beat * 150;
        let target = { x: x, y: centerY + floorHalf - height };
        addSegment(x, centerY + floorHalf, target.x, target.y, 0.38 + beat * 0.54, index % 3);
        return target;
      });
    } else if(elapsedMs < 83000) {
      phase = "dj-moment";
      spotlightsFollowLaserTargets = true;
      let progress = (elapsedMs - 75000) / 8000;
      let thomas = { x: centerX - 32, y: centerY - 288 };
      let hubertuse = { x: centerX + 32, y: centerY - 288 };
      let borderTargets = squareTargets(floorHalf, 0.2, false);
      function djTargets(dj, spin) {
        return Array.from({ length: 9 }, function(_, index) {
          let angle = spin + index * Math.PI * 2 / 9;
          return { x: dj.x + Math.cos(angle) * 30, y: dj.y + Math.sin(angle) * 22 };
        });
      }
      let thomasTargets = djTargets(thomas, progress * Math.PI * 3);
      let hubertuseTargets = djTargets(hubertuse, -progress * Math.PI * 3);
      if(progress < 0.42) {
        targets = thomasTargets;
      } else if(progress < 0.82) {
        let transfer = easeInOut((progress - 0.42) / 0.4);
        targets = thomasTargets.map(function(target, index) {
          return {
            x: target.x + (hubertuseTargets[index].x - target.x) * transfer,
            y: target.y + (hubertuseTargets[index].y - target.y) * transfer
          };
        });
      } else {
        let release = easeInOut((progress - 0.82) / 0.18);
        targets = hubertuseTargets.map(function(target, index) {
          return {
            x: target.x + (borderTargets[index].x - target.x) * release,
            y: target.y + (borderTargets[index].y - target.y) * release
          };
        });
      }
    } else if(elapsedMs < 93000) {
      phase = "text";
      let textElapsed = elapsedMs - 83000;
      let textEntryTargets = squareTargets(floorHalf, 0.2, false);
      let textFrame = this.__getLaserTextChoreography("PARTY ZONE", Math.max(0, textElapsed - 700) / 9300, centerX, centerY, radius, textElapsed, textEntryTargets, floorHalf * 1.8);
      targets = textFrame.targets;
      trailLines = textFrame.trailLines;
    } else if(elapsedMs < 95000) {
      phase = "text-hold";
      let holdFrame = this.__getLaserTextHoldChoreography("PARTY ZONE", centerX, centerY, radius, elapsedMs - 93000, floorHalf * 1.8, 14);
      targets = holdFrame.targets;
      trailLines = holdFrame.trailLines;
    } else {
      phase = "overdrive-finale";
      let progress = clamp((elapsedMs - 95000) / 5000, 0, 1);
      let completedText = this.__getLaserTextHoldChoreography("PARTY ZONE", centerX, centerY, radius, 2000, floorHalf * 1.8, 14);
      if(progress < 0.3) {
        targets = completedText.targets;
        trailLines = completedText.trailLines.map(function(line) {
          line.alpha *= 1 - progress * 1.5;
          return line;
        });
      } else if(progress < 0.62) {
        let collapse = easeInOut((progress - 0.3) / 0.32);
        targets = completedText.targets.map(function(target) {
          return { x: target.x + (centerX - target.x) * collapse, y: target.y + (centerY - target.y) * collapse };
        });
        trailLines = completedText.trailLines.map(function(line) {
          line.alpha *= Math.max(0, 1 - collapse);
          return line;
        });
      } else {
        let explosion = easeInOut((progress - 0.62) / 0.38);
        targets = squareTargets(floorHalf * explosion, 0.125 + explosion * 0.2, false);
        targets.forEach(function(target, index) {
          addSegment(centerX, centerY, target.x, target.y, 0.25 + explosion * 0.7, index % 3);
        });
      }
    }
  } else if(show.mode === "dimension") {
    let safeHalf = Math.min(176, floorHalf - 16);

    function addRecentTrail(pointFunction, progress, length, samples, colorIndex) {
      let previous = null;
      for(let sample = 0; sample <= samples; sample++) {
        let sampleProgress = Math.max(0, progress - length + length * sample / samples);
        let point = pointFunction(sampleProgress);
        if(previous) addSegment(previous.x, previous.y, point.x, point.y, 0.12 + sample / samples * 0.6, colorIndex);
        previous = point;
      }
    }

    function triangleWave(value) {
      let wrapped = ((value % 2) + 2) % 2;
      return 1 - Math.abs(wrapped - 1);
    }

    if(elapsedMs < 7000) {
      phase = "corner-awakening";
      let progress = elapsedMs / 7000;
      let destinations = [
        { x: -safeHalf, y: -safeHalf }, { x: safeHalf, y: -safeHalf },
        { x: safeHalf, y: safeHalf }, { x: -safeHalf, y: safeHalf },
        { x: 0, y: -safeHalf }, { x: safeHalf, y: 0 },
        { x: 0, y: safeHalf }, { x: -safeHalf, y: 0 }, { x: 0, y: 0 }
      ];
      targets = destinations.map(function(destination, index) {
        let wake = easeInOut((progress - index * 0.055) / 0.5);
        let target = { x: centerX + destination.x * wake, y: centerY + destination.y * wake };
        if(wake > 0) addSegment(centerX, centerY, target.x, target.y, 0.18 + wake * 0.56, index % 3);
        return target;
      });
    } else if(elapsedMs < 17000) {
      phase = "neon-labyrinth";
      let progress = easeInOut((elapsedMs - 7000) / 10000);
      let mazePoints = [
        { x: centerX - safeHalf, y: centerY - safeHalf }, { x: centerX + safeHalf, y: centerY - safeHalf },
        { x: centerX + safeHalf, y: centerY + safeHalf }, { x: centerX - safeHalf, y: centerY + safeHalf },
        { x: centerX - safeHalf, y: centerY - 112 }, { x: centerX + 112, y: centerY - 112 },
        { x: centerX + 112, y: centerY + 112 }, { x: centerX - 112, y: centerY + 112 },
        { x: centerX - 112, y: centerY - 48 }, { x: centerX + 48, y: centerY - 48 },
        { x: centerX + 48, y: centerY + 48 }, { x: centerX - 48, y: centerY + 48 },
        { x: centerX - 48, y: centerY }, { x: centerX, y: centerY }
      ];
      let mazePath = buildPath(mazePoints);
      let headDistance = mazePath.totalLength * progress;
      let trainSpacing = mazePath.totalLength * 0.024 * Math.sin(progress * Math.PI);
      targets = Array.from({ length: 9 }, function(_, index) {
        return pointAlongPath(mazePath, headDistance - index * trainSpacing);
      });
      addPathTrail(mazePath, headDistance, 0.68);
    } else if(elapsedMs < 25000) {
      phase = "mirror-wings";
      let progress = (elapsedMs - 17000) / 8000;
      function wingPoint(left, member, sampleProgress) {
        let angle = sampleProgress * Math.PI * 2 + member * Math.PI / 2;
        let reach = 44 + Math.abs(Math.sin(angle)) * 104;
        return {
          x: centerX + (left ? -1 : 1) * reach,
          y: centerY + Math.sin(angle * 2) * 94
        };
      }
      targets = Array.from({ length: 9 }, function(_, index) {
        if(index === 8) return { x: centerX, y: centerY - 148 + easeInOut(progress) * 296 };
        let left = index < 4;
        let member = index % 4;
        addRecentTrail(function(sampleProgress) { return wingPoint(left, member, sampleProgress); }, progress, 0.12, 8, left ? 0 : 2);
        return wingPoint(left, member, progress);
      });
      addSegment(centerX, centerY - 148, centerX, targets[8].y, 0.72, 1);
    } else if(elapsedMs < 33000) {
      phase = "diamond-gearbox";
      let progress = (elapsedMs - 25000) / 8000;
      let gearCenters = [-104, 0, 104];
      targets = Array.from({ length: 9 }, function(_, index) {
        let group = Math.floor(index / 3);
        let member = index % 3;
        let gearCenterX = centerX + gearCenters[group];
        let direction = group === 1 ? -1 : 1;
        let angle = direction * progress * Math.PI * 4 + member * Math.PI * 2 / 3;
        return { x: gearCenterX + Math.cos(angle) * 42, y: centerY + Math.sin(angle) * 42 };
      });
      gearCenters.forEach(function(offset, group) {
        let rotation = (group === 1 ? -1 : 1) * progress * Math.PI * 4 + Math.PI / 4;
        let corners = Array.from({ length: 4 }, function(_, index) {
          let angle = rotation + index * Math.PI / 2;
          return { x: centerX + offset + Math.cos(angle) * 52, y: centerY + Math.sin(angle) * 52 };
        });
        corners.forEach(function(corner, index) {
          let next = corners[(index + 1) % corners.length];
          addSegment(corner.x, corner.y, next.x, next.y, 0.64, (group + index) % 3);
        });
      });
    } else if(elapsedMs < 42000) {
      phase = "laser-dna";
      let progress = easeInOut((elapsedMs - 33000) / 9000);
      let leftPoints = [];
      let rightPoints = [];
      for(let row = 0; row <= 16; row++) {
        let y = -160 + row * 20;
        let x = Math.sin(row * 0.72) * 76;
        leftPoints.push({ x: centerX + x, y: centerY + y });
        rightPoints.push({ x: centerX - x, y: centerY + y });
      }
      let leftPath = buildPath(leftPoints);
      let rightPath = buildPath(rightPoints);
      let leftDistance = leftPath.totalLength * progress;
      let rightDistance = rightPath.totalLength * progress;
      let spacing = leftPath.totalLength * 0.038 * Math.sin(progress * Math.PI);
      targets = Array.from({ length: 9 }, function(_, index) {
        if(index < 4) return pointAlongPath(leftPath, leftDistance - index * spacing);
        if(index < 8) return pointAlongPath(rightPath, rightDistance - (index - 4) * spacing);
        let left = pointAlongPath(leftPath, leftDistance);
        let right = pointAlongPath(rightPath, rightDistance);
        addSegment(left.x, left.y, right.x, right.y, 0.86, 1);
        return { x: (left.x + right.x) * 0.5, y: (left.y + right.y) * 0.5 };
      });
      addPathTrail(leftPath, leftDistance, 0.56);
      addPathTrail(rightPath, rightDistance, 0.56);
    } else if(elapsedMs < 51000) {
      phase = "neon-pinball";
      let progress = (elapsedMs - 42000) / 9000;
      function ballPoint(ball, sampleProgress) {
        let x = -145 + triangleWave(sampleProgress * (5 + ball * 0.7) + ball * 0.43) * 290;
        let y = -135 + triangleWave(sampleProgress * (7 - ball * 0.55) + ball * 0.71) * 270;
        return { x: centerX + x, y: centerY + y };
      }
      targets = Array.from({ length: 9 }, function(_, index) {
        if(index < 3) {
          addRecentTrail(function(sampleProgress) { return ballPoint(index, sampleProgress); }, progress, 0.07, 7, index);
          return ballPoint(index, progress);
        }
        let bumper = index - 3;
        let angle = bumper * Math.PI * 2 / 6 + progress * Math.PI * 0.5;
        return { x: centerX + Math.cos(angle) * 92, y: centerY + Math.sin(angle) * 92 };
      });
    } else if(elapsedMs < 60000) {
      phase = "big-top";
      let progress = (elapsedMs - 51000) / 9000;
      let strokes = [
        [-160, 150, 160, 150], [-160, 150, -160, 18], [-160, 18, 0, -130],
        [0, -130, 160, 18], [160, 18, 160, 150], [-48, 150, -48, 55],
        [-48, 55, 0, 18], [0, 18, 48, 55]
      ];
      let sequence = Math.min(1, progress / 0.72) * strokes.length;
      targets = strokes.map(function(stroke, index) {
        let portion = easeInOut(sequence - index);
        let x1 = centerX + stroke[0];
        let y1 = centerY + stroke[1];
        let x2 = centerX + stroke[2];
        let y2 = centerY + stroke[3];
        let target = { x: x1 + (x2 - x1) * portion, y: y1 + (y2 - y1) * portion };
        if(portion > 0) addSegment(x1, y1, target.x, target.y, 0.9, index % 3);
        return target;
      });
      let flagSequence = clamp((progress - 0.72) / 0.28, 0, 0.999999) * 3;
      let poleProgress = easeInOut(flagSequence);
      let topProgress = easeInOut(flagSequence - 1);
      let closeProgress = easeInOut(flagSequence - 2);
      let flagTarget = { x: centerX, y: centerY - 130 - poleProgress * 40 };
      if(poleProgress > 0) addSegment(centerX, centerY - 130, centerX, flagTarget.y, 0.9, 2);
      if(flagSequence > 1) {
        addSegment(centerX, centerY - 170, centerX + 52 * topProgress, centerY - 170 + 16 * topProgress, 0.9, 2);
        flagTarget = { x: centerX + 52 * topProgress, y: centerY - 170 + 16 * topProgress };
      }
      if(flagSequence > 2) {
        addSegment(centerX, centerY - 170, centerX + 52, centerY - 154, 0.9, 2);
        addSegment(centerX + 52, centerY - 154, centerX + 52 * (1 - closeProgress), centerY - 154 + 10 * closeProgress, 0.78, 2);
        flagTarget = { x: centerX + 52 * (1 - closeProgress), y: centerY - 154 + 10 * closeProgress };
      }
      targets.push(flagTarget);
    } else if(elapsedMs < 69000) {
      phase = "prism-flowers";
      let progress = (elapsedMs - 60000) / 9000;
      let flowerCenters = [-108, 0, 108];
      function flowerPoint(group, member, sampleProgress) {
        let angle = sampleProgress * Math.PI * 4 + member * Math.PI * 2 / 3;
        let petal = 25 + Math.abs(Math.sin(angle * 2.5)) * 24;
        return { x: centerX + flowerCenters[group] + Math.cos(angle) * petal, y: centerY + Math.sin(angle) * petal };
      }
      targets = Array.from({ length: 9 }, function(_, index) {
        let group = Math.floor(index / 3);
        let member = index % 3;
        addRecentTrail(function(sampleProgress) { return flowerPoint(group, member, sampleProgress); }, progress, 0.16, 9, group);
        return flowerPoint(group, member, progress);
      });
    } else if(elapsedMs < 78000) {
      phase = "nine-tile-sequencer";
      let progress = (elapsedMs - 69000) / 9000;
      let grid = [
        [-112, -112], [0, -112], [112, -112], [112, 0], [112, 112],
        [0, 112], [-112, 112], [-112, 0], [0, 0], [-112, -112]
      ].map(function(point) { return { x: centerX + point[0], y: centerY + point[1] }; });
      let gridPath = buildPath(grid);
      targets = Array.from({ length: 9 }, function(_, index) {
        let distance = (progress * gridPath.totalLength * 1.8 + index * gridPath.totalLength / 9) % gridPath.totalLength;
        let target = pointAlongPath(gridPath, distance);
        let previous = pointAlongPath(gridPath, (distance - 22 + gridPath.totalLength) % gridPath.totalLength);
        addSegment(previous.x, previous.y, target.x, target.y, 0.64, index % 3);
        return target;
      });
    } else if(elapsedMs < 86000) {
      phase = "laser-heartbeat";
      let progress = easeInOut((elapsedMs - 78000) / 8000);
      let rows = [-92, 0, 92];
      targets = [];
      rows.forEach(function(row, group) {
        let amplitude = group === 1 ? 62 : 44;
        let points = [
          { x: centerX - safeHalf, y: centerY + row }, { x: centerX - 105, y: centerY + row },
          { x: centerX - 72, y: centerY + row - amplitude }, { x: centerX - 38, y: centerY + row + amplitude },
          { x: centerX, y: centerY + row - amplitude * 1.35 }, { x: centerX + 38, y: centerY + row + amplitude },
          { x: centerX + 72, y: centerY + row }, { x: centerX + safeHalf, y: centerY + row }
        ];
        let path = buildPath(points);
        let headDistance = path.totalLength * progress;
        let spacing = path.totalLength * 0.045 * Math.sin(progress * Math.PI);
        for(let member = 0; member < 3; member++) targets.push(pointAlongPath(path, headDistance - member * spacing));
        addPathTrail(path, headDistance, 0.68);
      });
    } else if(elapsedMs < 96000) {
      phase = "stacked-text";
      let textElapsed = elapsedMs - 86000;
      let heartbeatEntryTargets = [
        { x: centerX + safeHalf, y: centerY - 92 }, { x: centerX + safeHalf, y: centerY - 92 }, { x: centerX + safeHalf, y: centerY - 92 },
        { x: centerX + safeHalf, y: centerY }, { x: centerX + safeHalf, y: centerY }, { x: centerX + safeHalf, y: centerY },
        { x: centerX + safeHalf, y: centerY + 92 }, { x: centerX + safeHalf, y: centerY + 92 }, { x: centerX + safeHalf, y: centerY + 92 }
      ];
      let textFrame = this.__getLaserStackedTextChoreography(textElapsed / 10000, centerX, centerY, radius, textElapsed, heartbeatEntryTargets);
      targets = textFrame.targets;
      trailLines = textFrame.trailLines;
    } else {
      phase = "grand-presentation";
      let holdFrame = this.__getLaserStackedTextHoldChoreography(centerX, centerY, radius, elapsedMs - 96000);
      targets = holdFrame.targets;
      trailLines = holdFrame.trailLines;
    }
  } else if(show.mode === "arcade") {
    let safeHalf = Math.min(176, floorHalf - 16);

    function arcadeTriangle(value) {
      let wrapped = ((value % 2) + 2) % 2;
      return 1 - Math.abs(wrapped - 1);
    }

    function arcadeCell(x, y, size, alpha, colorIndex, progress) {
      let half = size * 0.5;
      let points = [
        { x: x - half, y: y - half }, { x: x + half, y: y - half },
        { x: x + half, y: y + half }, { x: x - half, y: y + half }, { x: x - half, y: y - half }
      ];
      let path = buildPath(points);
      let trailStart = trailLines.length;
      addPathTrail(path, path.totalLength * clamp(progress == null ? 1 : progress, 0, 1), alpha);
      for(let index = trailStart; index < trailLines.length; index++) trailLines[index].colorIndex = colorIndex;
    }

    function arcadeWordFrame(word, localMs, writeMs, holdMs, eraseMs, maximumScale) {
      let totalMs = writeMs + holdMs + eraseMs;
      let centerEntries = Array.from({ length: 9 }, function() { return { x: centerX, y: centerY }; });
      if(localMs < writeMs) {
        return this.__getLaserTextChoreography(
          word, Math.max(0, localMs - 500) / Math.max(1, writeMs - 500),
          centerX, centerY, radius, localMs, centerEntries, 340, maximumScale
        );
      }
      if(localMs < writeMs + holdMs) {
        return this.__getLaserTextChoreography(word, 0.999999, centerX, centerY, radius, 1000, null, 340, maximumScale);
      }
      let erase = easeInOut((localMs - writeMs - holdMs) / eraseMs);
      let reverse = this.__getLaserTextChoreography(word, Math.max(0, 0.999999 - erase), centerX, centerY, radius, 1000, null, 340, maximumScale);
      reverse.targets = reverse.targets.map(function(target) {
        return { x: target.x + (centerX - target.x) * erase, y: target.y + (centerY - target.y) * erase };
      });
      reverse.trailLines.forEach(function(line) { line.alpha *= 1 - erase; });
      if(localMs >= totalMs) return { targets: centerEntries, trailLines: [] };
      return reverse;
    }

    if(elapsedMs < 16000) {
      phase = "arcade-callout";
      let callout;
      if(elapsedMs < 6000) callout = arcadeWordFrame.call(this, "LET'S", elapsedMs, 4200, 1000, 800, 90);
      else if(elapsedMs < 10500) callout = arcadeWordFrame.call(this, "DO", elapsedMs - 6000, 2800, 1000, 700, 76);
      else callout = arcadeWordFrame.call(this, "THIS", elapsedMs - 10500, 3700, 1000, 800, 76);
      targets = callout.targets;
      trailLines = callout.trailLines;
    } else if(elapsedMs < 21000) {
      phase = "insert-coin";
      let progress = (elapsedMs - 16000) / 5000;
      let coinRadius;
      let coinY;
      if(progress < 0.45) {
        coinRadius = easeInOut(progress / 0.45) * 72;
        coinY = 0;
      } else if(progress < 0.75) {
        coinRadius = 72 - Math.sin((progress - 0.45) / 0.3 * Math.PI) * 12;
        coinY = 0;
      } else {
        let insert = easeInOut((progress - 0.75) / 0.25);
        coinRadius = 72 * (1 - insert);
        coinY = (-safeHalf + 18) * insert;
      }
      targets = Array.from({ length: 9 }, function(_, index) {
        let angle = progress * Math.PI * 5 + index * Math.PI * 2 / 9;
        return {
          x: centerX + Math.cos(angle) * coinRadius,
          y: centerY + coinY + Math.sin(angle) * coinRadius * 0.72
        };
      });
      targets.forEach(function(target, index) {
        let next = targets[(index + 1) % targets.length];
        addSegment(target.x, target.y, next.x, next.y, 0.62, index % 3);
      });
    } else if(elapsedMs < 42000) {
      phase = "arcade-tetris";
      let progress = (elapsedMs - 21000) / 21000;
      let pieces = [
        { shape: [[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]], cells: [[0, 10], [1, 10], [2, 10], [3, 10]] },
        { shape: [[-1, 0], [0, 0], [1, 0], [0, -1]], cells: [[4, 10], [5, 10], [6, 10], [5, 9]] },
        { shape: [[-1, 0], [0, 0], [1, 0], [-1, -1]], cells: [[7, 10], [8, 10], [9, 10], [7, 9]] },
        { shape: [[-1, 0], [0, 0], [0, -1], [1, -1]], cells: [[3, 10], [4, 10], [4, 9], [5, 9]] },
        { shape: [[0, 0], [1, 0], [0, -1], [1, -1]], cells: [[8, 10], [9, 10], [8, 9], [9, 9]] }
      ];
      let piecePosition = Math.min(4.999999, progress * pieces.length);
      let pieceIndex = Math.floor(piecePosition);
      let pieceProgress = piecePosition - pieceIndex;
      let piece = pieces[pieceIndex];
      function gridPoint(cell) {
        return { x: centerX - 135 + cell[0] * 30, y: centerY - 150 + cell[1] * 30 };
      }
      let clearProgress = pieceIndex === 2 && pieceProgress > 0.82
        ? easeInOut((pieceProgress - 0.82) / 0.18)
        : 0;
      for(let complete = 0; complete < pieceIndex; complete++) {
        pieces[complete].cells.forEach(function(cell, cellIndex) {
          if(complete < 3 && cell[1] === 10 && pieceIndex >= 3) return;
          let transformed = cell.slice();
          if(complete < 3 && pieceIndex >= 3 && transformed[1] < 10) transformed[1]++;
          let point = gridPoint(transformed);
          if(pieceIndex === 2 && cell[1] < 10) point.y += clearProgress * 30;
          let cellAlpha = pieceIndex === 2 && cell[1] === 10 ? 0.38 * (1 - clearProgress) : 0.38;
          if(cellAlpha > 0) arcadeCell(point.x, point.y, 25, cellAlpha, (complete + cellIndex) % 3, 1);
        });
      }
      let finalPoints = piece.cells.map(gridPoint);
      let minFinalY = Math.min.apply(null, finalPoints.map(function(point) { return point.y; }));
      let activePoints = finalPoints.map(function(finalPoint, index) {
        let descentProgress = pieceIndex === 0 ? pieceProgress : Math.max(0, pieceProgress - 0.16);
        let fall = easeInOut(descentProgress / (pieceIndex === 0 ? 0.82 : 0.66));
        let startX = finalPoint.x;
        let startY = centerY - safeHalf + 14 + finalPoint.y - minFinalY;
        let point = {
          x: clamp(startX + (finalPoint.x - startX) * fall, centerX - safeHalf + 14, centerX + safeHalf - 14),
          y: clamp(startY + (finalPoint.y - startY) * fall, centerY - safeHalf + 14, centerY + safeHalf - 14)
        };
        if(pieceIndex > 0 && pieceProgress < 0.16) {
          let previousCell = pieces[pieceIndex - 1].cells[index].slice();
          if(pieceIndex === 3 && previousCell[1] < 10) previousCell[1]++;
          let previousPoint = gridPoint(previousCell);
          let travel = easeInOut(pieceProgress / 0.16);
          point.x = previousPoint.x + (point.x - previousPoint.x) * travel;
          point.y = previousPoint.y + (point.y - previousPoint.y) * travel;
        }
        if(pieceIndex === 2 && piece.cells[index][1] < 10) point.y += clearProgress * 30;
        let activeAlpha = pieceIndex === 2 && piece.cells[index][1] === 10 ? 0.72 * (1 - clearProgress) : 0.72;
        if(pieceIndex > 0 && pieceProgress < 0.16) activeAlpha *= easeInOut((pieceProgress - 0.1) / 0.06);
        if(activeAlpha > 0) arcadeCell(point.x, point.y, 25, activeAlpha, (pieceIndex + index) % 3, 1);
        return point;
      });
      targets = Array.from({ length: 9 }, function(_, index) { return activePoints[index % 4]; });
      if(pieceIndex === 2 && pieceProgress > 0.82) {
        addSegment(centerX - 150, centerY + 150, centerX - 150 + clearProgress * 300, centerY + 150, 0.95 * (1 - clearProgress * 0.6), 1);
      }
    } else if(elapsedMs < 58000) {
      phase = "arcade-pong";
      let progress = (elapsedMs - 42000) / 16000;
      function pongBall(sampleProgress) {
        let horizontal = arcadeTriangle(sampleProgress * 10.8);
        let verticalPhase = sampleProgress * 14.3 + Math.sin(sampleProgress * Math.PI * 6) * 0.24;
        return {
          x: centerX - 145 + horizontal * 290,
          y: centerY - 126 + arcadeTriangle(verticalPhase) * 252
        };
      }
      let ball = pongBall(progress);
      let delayedBall = pongBall(Math.max(0, progress - 0.035));
      let leftPaddleY = clamp((ball.y - centerY) * 0.88, -110, 110);
      let rightPaddleY = clamp((delayedBall.y - centerY) * 0.88, -110, 110);
      targets = Array.from({ length: 9 }, function(_, index) {
        if(index === 6) return ball;
        if(index < 3) return { x: centerX - 154, y: centerY + leftPaddleY + (index - 1) * 30 };
        if(index < 6) return { x: centerX + 154, y: centerY + rightPaddleY + (index - 4) * 30 };
        let echo = pongBall(Math.max(0, progress - (index - 6) * 0.009));
        return echo;
      });
      addSegment(centerX - 154, centerY + leftPaddleY - 45, centerX - 154, centerY + leftPaddleY + 45, 0.86, 0);
      addSegment(centerX + 154, centerY + rightPaddleY - 45, centerX + 154, centerY + rightPaddleY + 45, 0.86, 2);
      for(let echo = 1; echo <= 8; echo++) {
        let past = pongBall(Math.max(0, progress - echo * 0.006));
        let nextPast = pongBall(Math.max(0, progress - (echo - 1) * 0.006));
        addSegment(past.x, past.y, nextPast.x, nextPast.y, 0.65 - echo * 0.055, 1);
      }
    } else if(elapsedMs < 74000) {
      phase = "arcade-snake";
      let progress = easeInOut((elapsedMs - 58000) / 16000);
      let snakePoints = [
        [-160, -150], [160, -150], [160, -90], [-120, -90], [-120, -30],
        [120, -30], [120, 30], [-120, 30], [-120, 90], [160, 90], [160, 150], [-160, 150]
      ].map(function(point) { return { x: centerX + point[0], y: centerY + point[1] }; });
      let snakePath = buildPath(snakePoints);
      let headDistance = snakePath.totalLength * progress;
      let spacing = 36 * Math.sin(progress * Math.PI);
      targets = Array.from({ length: 8 }, function(_, index) {
        return pointAlongPath(snakePath, headDistance - index * spacing);
      });
      let food = snakePoints[snakePoints.length - 1];
      targets.push({ x: food.x, y: food.y });
      let tailDistance = Math.max(0, headDistance - spacing * 7);
      snakePath.segments.forEach(function(segment, index) {
        let from = Math.max(tailDistance, segment.start);
        let to = Math.min(headDistance, segment.start + segment.length);
        if(to <= from) return;
        let start = pointAlongPath(snakePath, from);
        let end = pointAlongPath(snakePath, to);
        addSegment(start.x, start.y, end.x, end.y, 0.7, index % 3);
      });
      let foodGlow = 1 - easeInOut((progress - 0.94) / 0.06);
      if(foodGlow > 0) arcadeCell(food.x, food.y, 12 + foodGlow * 6, 0.9 * foodGlow, 1, 1);
    } else if(elapsedMs < 88000) {
      phase = "space-invaders";
      let progress = (elapsedMs - 74000) / 14000;
      let formationX = -58 + (1 - Math.abs(((progress * 6) % 2) - 1)) * 116;
      let formationY = -118 + progress * 74;
      let defeated = Math.max(0, (progress - 0.42) / 0.58 * 9);
      targets = Array.from({ length: 9 }, function(_, index) {
        let row = Math.floor(index / 3);
        let column = index % 3;
        let invader = { x: centerX + formationX + (column - 1) * 70, y: centerY + formationY + row * 52 };
        let fall = easeInOut(defeated - index);
        let target = {
          x: invader.x + (centerX - invader.x) * fall,
          y: invader.y + (centerY + 154 - invader.y) * fall
        };
        if(fall < 1) arcadeCell(target.x, target.y, 24 * (1 - fall * 0.7), 0.68 * (1 - fall * 0.7), index % 3, 1);
        return target;
      });
      let shot = (progress * 9) % 1;
      let shotX = targets[Math.min(8, Math.floor(defeated))].x;
      addSegment(centerX, centerY + 160, centerX + (shotX - centerX) * shot, centerY + 160 - shot * 290, 0.9, 1);
    } else {
      phase = "arcade-party-finale";
      let local = elapsedMs - 88000;
      let invaderExit = Array.from({ length: 9 }, function() { return { x: centerX, y: centerY + 154 }; });
      let completedParty = this.__getLaserTextChoreography("PARTY", 0.999999, centerX, centerY - 58, radius, 1000, null, 340, 76);
      let completedOn = this.__getLaserTextChoreography("ON!", 0.999999, centerX, centerY + 66, radius, 1000, null, 300, 108);
      if(local < 6000) {
        if(local < 3300) {
          let party = this.__getLaserTextChoreography(
            "PARTY", Math.max(0, local - 500) / 2800,
            centerX, centerY - 58, radius, local, invaderExit, 340, 76
          );
          targets = party.targets;
          trailLines = party.trailLines;
        } else {
          let onElapsed = local - 3300;
          let on = this.__getLaserTextChoreography(
            "ON!", Math.max(0, onElapsed - 500) / 2200,
            centerX, centerY + 66, radius, onElapsed, completedParty.targets, 300, 108
          );
          completedParty.trailLines.forEach(function(line) { line.alpha = 0.66; trailLines.push(line); });
          on.trailLines.forEach(function(line) { trailLines.push(line); });
          targets = on.targets;
        }
      } else {
        completedParty.trailLines.forEach(function(line) { line.alpha = 0.76; trailLines.push(line); });
        completedOn.trailLines.forEach(function(line) { line.alpha = 0.8; trailLines.push(line); });
        let presentation = local - 6000;
        let pulseProgress = Math.max(0, presentation - 1000) / 5000;
        let frameHalf = clamp(158 - Math.sin(pulseProgress * Math.PI * 4) * 18, 140, 174);
        let frameOffset = presentation / 6200;
        let travel = easeInOut(presentation / 1000);
        targets = Array.from({ length: 9 }, function(_, index) {
          let frame = squarePerimeterPoint(frameOffset + index / 9, frameHalf);
          let origin = completedOn.targets[index] || completedOn.targets[0];
          return { x: origin.x + (frame.x - origin.x) * travel, y: origin.y + (frame.y - origin.y) * travel };
        });
        if(presentation > 1000) {
          let rayAlpha = 0.26 + Math.max(0, Math.sin(pulseProgress * Math.PI * 8)) * 0.54;
          targets.forEach(function(target, index) {
            addSegment(target.x, target.y, centerX + (target.x - centerX) * 0.68, centerY + (target.y - centerY) * 0.68, rayAlpha, index % 3);
          });
        }
      }
    }
  } else {
    let textStart = 3000;
    let textWriteEnd = Math.max(textStart + 1000, show.durationMs - 8000);
    let textHoldEnd = Math.max(textWriteEnd + 5000, show.durationMs - 3000);
    if(elapsedMs < textStart) {
      phase = "opening";
      targets = ringTargets(165 - elapsedMs / textStart * 65, angleTime, true);
    } else if(elapsedMs < textWriteEnd) {
      phase = "text";
      let textElapsed = elapsedMs - textStart;
      let textEntryTargets = ringTargets(100, textStart * Math.PI * 2 / 4200, true);
      let textFrame = this.__getLaserTextChoreography(
        show.text,
        Math.max(0, textElapsed - 700) / Math.max(1, textWriteEnd - textStart - 700),
        centerX,
        centerY,
        radius,
        textElapsed,
        textEntryTargets
      );
      targets = textFrame.targets;
      trailLines = textFrame.trailLines;
    } else if(elapsedMs < textHoldEnd) {
      phase = "text-hold";
      let holdFrame = this.__getLaserTextHoldChoreography(show.text, centerX, centerY, radius, elapsedMs - textWriteEnd);
      targets = holdFrame.targets;
      trailLines = holdFrame.trailLines;
    } else {
      phase = "finale";
      targets = ringTargets(65 + Math.min(1, (elapsedMs - textHoldEnd) / 3000) * 125, angleTime * 1.7, true);
    }
  }

  let previousShowFrame = this.__discoLightFrame && this.__discoLightFrame.laserShow;
  if(!previousShowFrame) {
    this.__laserShowPhaseTransition = null;
  } else if(previousShowFrame.phase !== phase) {
    if(phase === "text" || phase === "stacked-text") {
      this.__laserShowPhaseTransition = null;
    } else {
      this.__laserShowPhaseTransition = {
        phase: phase,
        startedAt: now,
        from: previousShowFrame.targets.map(function(target) { return { x: target.x, y: target.y }; })
      };
    }
  }
  let phaseTransition = this.__laserShowPhaseTransition;
  if(phaseTransition && phaseTransition.phase === phase) {
    let phaseProgress = Math.min(1, Math.max(0, (now - phaseTransition.startedAt) / 900));
    let phaseEase = phaseProgress * phaseProgress * (3 - 2 * phaseProgress);
    targets = targets.map(function(target, index) {
      let origin = phaseTransition.from[index] || target;
      return {
        x: origin.x + (target.x - origin.x) * phaseEase,
        y: origin.y + (target.y - origin.y) * phaseEase
      };
    });
    if(phaseProgress >= 1) this.__laserShowPhaseTransition = null;
  }

  let spotlightTargets = customSpotlightTargets || [0, 2, 4, 6].map(function(index) {
    let target = targets[index] || { x: centerX, y: centerY };
    if(spotlightsFollowLaserTargets) return { x: target.x, y: target.y };
    return {
      x: centerX + (target.x - centerX) * 0.82,
      y: centerY + (target.y - centerY) * 0.82
    };
  });
  return {
    active: elapsedMs < show.durationMs,
    amount: amount,
    elapsedMs: elapsedMs,
    phase: phase,
    targets: targets,
    spotlightTargets: spotlightTargets,
    trailLines: trailLines
  };

}

WeatherCanvas.prototype.__getVipShowFrame = function(focus, focusScreen, elapsedMs, now, beatBpm) {

  if(!focus || !focus.vipShow || !focusScreen || !Number.isFinite(focus.durationMs)) {
    return null;
  }

  let remainingMs = Math.max(0, focus.durationMs - elapsedMs);
  if(remainingMs <= 0) return null;

  let presetPalettes = {
    rainbow: [[45, 150, 255], [244, 55, 255], [35, 255, 194], [255, 70, 115], [255, 210, 55], [135, 80, 255]],
    fire: [[255, 55, 22], [255, 125, 20], [255, 210, 45], [255, 35, 90]],
    ice: [[65, 170, 255], [110, 245, 255], [190, 235, 255], [115, 95, 255]],
    toxic: [[70, 255, 60], [185, 255, 30], [30, 225, 150], [220, 255, 70]],
    romance: [[255, 50, 135], [255, 105, 205], [195, 75, 255], [255, 175, 220]]
  };
  let intensityMultipliers = { soft: 0.72, normal: 1, intense: 1.28 };
  let colors = presetPalettes[focus.vipShow.preset] || presetPalettes.rainbow;
  let intensityMultiplier = intensityMultipliers[focus.vipShow.intensity] || 1;
  let amount = Math.max(0, Math.min(1, elapsedMs / 500, remainingMs / 800));
  let participants = (focus.vipShow.participants || []).map(function(participant) {
    let creature = gameClient.world && typeof gameClient.world.getCreature === "function"
      ? gameClient.world.getCreature(participant.targetId)
      : null;
    let screenPosition = creature && typeof gameClient.renderer.getCreatureScreenPosition === "function"
      ? gameClient.renderer.getCreatureScreenPosition(creature)
      : gameClient.renderer.getStaticScreenPosition(new Position(
        participant.targetPosition.x,
        participant.targetPosition.y,
        participant.targetPosition.z
      ));
    return {
      targetId: participant.targetId,
      targetName: participant.targetName,
      x: (screenPosition.x + 0.5) * 32,
      y: (screenPosition.y + 0.5) * 32
    };
  });
  let crowd = focus.vipShow.crowd === true && participants.length > 0;
  if(crowd) {
    focusScreen = participants.reduce(function(center, participant) {
      center.x += participant.x / participants.length;
      center.y += participant.y / participants.length;
      return center;
    }, { x: 0, y: 0 });
    participants.sort(function(left, right) {
      let leftAngle = Math.atan2(left.y - focusScreen.y, left.x - focusScreen.x);
      let rightAngle = Math.atan2(right.y - focusScreen.y, right.x - focusScreen.x);
      return leftAngle - rightAngle || left.targetId - right.targetId;
    });
  }
  let crowdBounds = participants.reduce(function(bounds, participant) {
    bounds.minX = Math.min(bounds.minX, participant.x);
    bounds.maxX = Math.max(bounds.maxX, participant.x);
    bounds.minY = Math.min(bounds.minY, participant.y);
    bounds.maxY = Math.max(bounds.maxY, participant.y);
    return bounds;
  }, { minX: focusScreen.x, maxX: focusScreen.x, minY: focusScreen.y, maxY: focusScreen.y });
  let floorFromScreen = gameClient.renderer.getStaticScreenPosition(new Position(
    VIP_CIRCUIT_FLOOR.from.x,
    VIP_CIRCUIT_FLOOR.from.y,
    VIP_CIRCUIT_FLOOR.from.z
  ));
  let floorToScreen = gameClient.renderer.getStaticScreenPosition(new Position(
    VIP_CIRCUIT_FLOOR.to.x,
    VIP_CIRCUIT_FLOOR.to.y,
    VIP_CIRCUIT_FLOOR.to.z
  ));
  let floorClip = {
    x: Math.min(floorFromScreen.x, floorToScreen.x) * 32,
    y: Math.min(floorFromScreen.y, floorToScreen.y) * 32,
    width: (Math.abs(floorToScreen.x - floorFromScreen.x) + 1) * 32,
    height: (Math.abs(floorToScreen.y - floorFromScreen.y) + 1) * 32
  };
  let effectSequence = [
    "laser", "hologram", "wings", "equalizer", "vortex", "portal", "comet",
    "rewind", "helix", "pixel", "soundwave", "cage", "duel", "discoball",
    "constellation", "combo", "name"
  ];
  if(crowd) effectSequence.splice(effectSequence.length - 1, 0, "circuit");
  let requestedEffect = effectSequence.includes(focus.vipShow.effect)
    ? focus.vipShow.effect
    : (focus.vipShow.effect === "all" ? "all" : "laser");
  let effectDurationMs = requestedEffect === "all"
    ? focus.durationMs / effectSequence.length
    : focus.durationMs;
  let effectIndex = requestedEffect === "all"
    ? Math.min(effectSequence.length - 1, Math.floor(elapsedMs / effectDurationMs))
    : effectSequence.indexOf(requestedEffect);
  let effect = requestedEffect === "all" ? effectSequence[effectIndex] : requestedEffect;
  let effectElapsedMs = requestedEffect === "all"
    ? Math.max(0, elapsedMs - effectIndex * effectDurationMs)
    : elapsedMs;
  let effectProgress = Math.max(0, Math.min(1, effectElapsedMs / effectDurationMs));
  let effectAmount = requestedEffect === "all"
    ? Math.max(0, Math.min(1, effectElapsedMs / 180, (effectDurationMs - effectElapsedMs) / 220))
    : 1;
  let stage;
  let stageProgress;

  if(effectProgress < 0.11) {
    stage = "lock";
    stageProgress = effectProgress / 0.11;
  } else if(effectProgress < 0.35) {
    stage = "orbit";
    stageProgress = (effectProgress - 0.11) / 0.24;
  } else if(effectProgress < 0.58) {
    stage = "tunnel";
    stageProgress = (effectProgress - 0.35) / 0.23;
  } else if(effectProgress < 0.79) {
    stage = "spiral";
    stageProgress = (effectProgress - 0.58) / 0.21;
  } else {
    stage = "finale";
    stageProgress = Math.min(1, (effectProgress - 0.79) / 0.21);
  }

  let ease = stageProgress * stageProgress * (3 - 2 * stageProgress);
  let spotlightOrbitRadius = 30;
  if(stage === "lock") spotlightOrbitRadius = 50 - ease * 28;
  if(stage === "tunnel") spotlightOrbitRadius = 42 + Math.sin(stageProgress * Math.PI * 4) * 8;
  if(stage === "spiral") spotlightOrbitRadius = 24 + (0.5 + 0.5 * Math.sin(stageProgress * Math.PI * 6)) * 18;
  if(stage === "finale") {
    spotlightOrbitRadius = stageProgress < 0.46
      ? 32 * (1 - stageProgress / 0.46)
      : 6 + 48 * ((stageProgress - 0.46) / 0.54);
  }

  let orbitPeriod = focus.vipShow.intensity === "soft" ? 2500 : (focus.vipShow.intensity === "intense" ? 1350 : 1850);
  let spotlightOrbitAngle = -Math.PI * 0.5 + elapsedMs * Math.PI * 2 / orbitPeriod;
  if(stage === "spiral") spotlightOrbitAngle *= -1;

  let laserTargets = Array.from({ length: 9 }, function(_, beamIndex) {
    let head = Math.floor(beamIndex / 3);
    let beam = beamIndex % 3 - 1;
    let direction = head === 1 ? -1 : 1;
    let angle;
    let radius;

    if(stage === "lock") {
      angle = head * Math.PI * 2 / 3 + beam * 0.34 + effectElapsedMs * Math.PI * 2 / 3600;
      radius = 112 - ease * 58 + Math.abs(beam) * 7;
    } else if(stage === "orbit") {
      angle = head * Math.PI * 2 / 3
        + direction * effectElapsedMs * Math.PI * 2 / 1950
        + beam * 0.34;
      radius = 46 + Math.abs(beam) * 18;
    } else if(stage === "tunnel") {
      angle = effectElapsedMs * Math.PI * 2 / 1750 + beamIndex * Math.PI * 2 / 9;
      radius = 34 + (beam + 1) * 18;
    } else if(stage === "spiral") {
      angle = head * Math.PI * 2 / 3
        + direction * effectElapsedMs * Math.PI * 2 / 1450
        + beam * 0.52;
      radius = 22 + ((effectElapsedMs / 900 + beamIndex / 9) % 1) * 78;
    } else {
      let convergence = stageProgress < 0.46
        ? 1 - stageProgress / 0.46
        : (stageProgress - 0.46) / 0.54;
      angle = beamIndex * Math.PI * 2 / 9 + elapsedMs * Math.PI * 2 / 1800;
      radius = stageProgress < 0.46 ? 4 + convergence * 62 : 4 + convergence * 108;
    }

    return {
      x: focusScreen.x + Math.cos(angle) * radius,
      y: focusScreen.y + Math.sin(angle) * radius * 0.72
    };
  });

  let beatDuration = beatBpm > 0 ? 60000 / beatBpm : 520;
  let beatProgress = (elapsedMs % beatDuration) / beatDuration;
  return {
    requestedEffect: requestedEffect,
    effect: effect,
    effectIndex: effectIndex,
    effectCount: requestedEffect === "all" ? effectSequence.length : 1,
    effectElapsedMs: effectElapsedMs,
    effectDurationMs: effectDurationMs,
    effectProgress: effectProgress,
    effectAmount: effectAmount,
    preset: focus.vipShow.preset,
    intensityName: focus.vipShow.intensity,
    intensityMultiplier: intensityMultiplier,
    targetName: focus.targetName,
    targetId: focus.targetId,
    crowd: crowd,
    crowdCount: crowd ? participants.length : 1,
    crowdLayout: !crowd ? "solo" : (participants.length === 1 ? "solo" : (participants.length === 2 ? "duo" : (participants.length === 3 ? "triangle" : "constellation"))),
    crowdBounds: crowdBounds,
    floorClip: floorClip,
    centerX: focusScreen.x,
    centerY: focusScreen.y,
    elapsedMs: elapsedMs,
    durationMs: focus.durationMs,
    remainingMs: remainingMs,
    amount: amount,
    stage: stage,
    stageProgress: stageProgress,
    colors: colors,
    spotlightColors: [colors[0], colors[1 % colors.length], colors[2 % colors.length], colors[3 % colors.length]],
    laserColors: [colors[0], colors[2 % colors.length], colors[4 % colors.length]],
    spotlightOrbitRadius: spotlightOrbitRadius,
    spotlightOrbitAngle: spotlightOrbitAngle,
    laserTargets: laserTargets,
    participants: participants,
    beatProgress: beatProgress,
    beatStrength: 1 - beatProgress
  };

}

WeatherCanvas.prototype.__getLaserChairsFrame = function(game, now) {

  if(!game || !game.floor || !game.floor.from || !game.floor.to) return null;

  let elapsed = game.elapsedMs + Math.max(0, now - game.receivedAt);
  let fromScreen = gameClient.renderer.getStaticScreenPosition(new Position(
    game.floor.from.x, game.floor.from.y, game.floor.from.z
  ));
  let toScreen = gameClient.renderer.getStaticScreenPosition(new Position(
    game.floor.to.x, game.floor.to.y, game.floor.to.z
  ));
  let border = {
    x: Math.min(fromScreen.x, toScreen.x) * 32,
    y: Math.min(fromScreen.y, toScreen.y) * 32,
    width: (Math.abs(toScreen.x - fromScreen.x) + 1) * 32,
    height: (Math.abs(toScreen.y - fromScreen.y) + 1) * 32
  };
  let targets = Array.from({ length: 9 }, function() {
    return { x: border.x, y: border.y };
  });
  let trailLines = [];

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function ease(value) {
    value = clamp(value);
    return value * value * (3 - 2 * value);
  }

  function perimeterLength(rectangle) {
    return rectangle.width * 2 + rectangle.height * 2;
  }

  function perimeterPoint(rectangle, fraction) {
    let perimeter = perimeterLength(rectangle);
    let distance = (((fraction % 1) + 1) % 1) * perimeter;
    if(distance <= rectangle.width) return { x: rectangle.x + distance, y: rectangle.y };
    distance -= rectangle.width;
    if(distance <= rectangle.height) return { x: rectangle.x + rectangle.width, y: rectangle.y + distance };
    distance -= rectangle.height;
    if(distance <= rectangle.width) return { x: rectangle.x + rectangle.width - distance, y: rectangle.y + rectangle.height };
    distance -= rectangle.width;
    return { x: rectangle.x, y: rectangle.y + rectangle.height - distance };
  }

  function addPerimeterRange(rectangle, startFraction, endFraction, colorIndex, alpha) {
    let perimeter = perimeterLength(rectangle);
    let start = startFraction * perimeter;
    let end = endFraction * perimeter;
    let boundaries = [0, rectangle.width, rectangle.width + rectangle.height,
      rectangle.width * 2 + rectangle.height, perimeter];
    let cursor = start;
    while(cursor < end - 0.001) {
      let wrapped = ((cursor % perimeter) + perimeter) % perimeter;
      let nextBoundary = boundaries.find(function(boundary) { return boundary > wrapped + 0.001; });
      if(nextBoundary === undefined) nextBoundary = perimeter;
      let length = Math.min(end - cursor, nextBoundary - wrapped);
      let first = perimeterPoint(rectangle, cursor / perimeter);
      let second = perimeterPoint(rectangle, (cursor + length) / perimeter);
      trailLines.push({
        x1: first.x, y1: first.y, x2: second.x, y2: second.y,
        alpha: alpha, colorIndex: colorIndex
      });
      cursor += Math.max(0.001, length);
    }
  }

  function addCompleteBorder() {
    for(let index = 0; index < 9; index++) {
      addPerimeterRange(border, index / 9, (index + 1) / 9, index % 3, 0.72);
    }
  }

  let amount = 0;
  if(game.phase === "countdown") {
    let approachMs = 900;
    let drawMs = 2200;
    let returnMs = 1300;
    let drawProgress = clamp((elapsed - approachMs) / drawMs);
    if(elapsed < approachMs) amount = ease(elapsed / approachMs);
    else if(elapsed < approachMs + drawMs) amount = 1;
    else amount = 1 - ease((elapsed - approachMs - drawMs) / returnMs);

    for(let index = 0; index < 9; index++) {
      let start = index / 9;
      targets[index] = perimeterPoint(border, start + drawProgress / 9);
      if(drawProgress > 0) {
        addPerimeterRange(border, start, start + drawProgress / 9, index % 3, 0.92);
      }
    }
  } else {
    addCompleteBorder();
  }

  let squareRectangles = game.squares.map(function(position) {
    let screen = gameClient.renderer.getStaticScreenPosition(new Position(position.x, position.y, position.z));
    return { x: screen.x * 32 + 3, y: screen.y * 32 + 3, width: 26, height: 26 };
  });

  let tasks = Array.from({ length: 9 }, function() { return []; });
  if(squareRectangles.length > 0 && squareRectangles.length <= 9) {
    squareRectangles.forEach(function(rectangle, squareIndex) {
      let members = [];
      for(let laser = squareIndex; laser < 9; laser += squareRectangles.length) members.push(laser);
      members.forEach(function(laser, memberIndex) {
        tasks[laser].push({
          rectangle: rectangle,
          start: memberIndex / members.length,
          end: (memberIndex + 1) / members.length
        });
      });
    });
  } else {
    squareRectangles.forEach(function(rectangle, squareIndex) {
      tasks[squareIndex % 9].push({ rectangle: rectangle, start: 0, end: 1 });
    });
  }

  function finalTaskTarget(laser) {
    let route = tasks[laser];
    if(route.length === 0) return perimeterPoint(border, laser / 9);
    let task = route[route.length - 1];
    return perimeterPoint(task.rectangle, task.end);
  }

  function drawTaskRoutes(route, progress, colorIndex) {
    if(route.length === 0) return null;
    let routePosition = Math.min(route.length - 0.000001, clamp(progress) * route.length);
    let activeIndex = Math.floor(routePosition);
    let local = routePosition - activeIndex;
    for(let index = 0; index < activeIndex; index++) {
      addPerimeterRange(route[index].rectangle, route[index].start, route[index].end, colorIndex, 0.92);
    }
    let active = route[activeIndex];
    let previous = activeIndex > 0
      ? perimeterPoint(route[activeIndex - 1].rectangle, route[activeIndex - 1].end)
      : perimeterPoint(active.rectangle, active.start);
    let start = perimeterPoint(active.rectangle, active.start);
    if(activeIndex > 0 && local < 0.22) {
      let travel = ease(local / 0.22);
      return {
        x: previous.x + (start.x - previous.x) * travel,
        y: previous.y + (start.y - previous.y) * travel
      };
    }
    let drawProgress = activeIndex > 0 ? clamp((local - 0.22) / 0.78) : local;
    addPerimeterRange(
      active.rectangle,
      active.start,
      active.start + (active.end - active.start) * drawProgress,
      colorIndex,
      1
    );
    return perimeterPoint(active.rectangle, active.start + (active.end - active.start) * drawProgress);
  }

  if(game.phase === "claiming" && squareRectangles.length > 0) {
    let approachMs = 700;
    let fallbackDrawMs = 1600 + Math.ceil(Math.max(0, squareRectangles.length - 9) / 9) * 800;
    let drawMs = Number.isFinite(game.drawDurationMs) && game.drawDurationMs >= 1600
      ? game.drawDurationMs
      : fallbackDrawMs;
    let returnMs = 1300;
    let drawProgress = clamp((elapsed - approachMs) / drawMs);
    if(elapsed < approachMs) amount = ease(elapsed / approachMs);
    else if(elapsed < approachMs + drawMs) amount = 1;
    else amount = 1 - ease((elapsed - approachMs - drawMs) / returnMs);

    tasks.forEach(function(route, laser) {
      if(route.length === 0) {
        targets[laser] = perimeterPoint(border, laser / 9);
        return;
      }
      let first = perimeterPoint(route[0].rectangle, route[0].start);
      if(elapsed < approachMs) {
        targets[laser] = first;
      } else if(elapsed < approachMs + drawMs) {
        targets[laser] = drawTaskRoutes(route, drawProgress, laser % 3) || first;
      } else {
        route.forEach(function(task) {
          addPerimeterRange(task.rectangle, task.start, task.end, laser % 3, 0.9);
        });
        targets[laser] = finalTaskTarget(laser);
      }
    });
  } else if(game.phase === "result" && squareRectangles.length > 0) {
    amount = 1 - ease(elapsed / 1300);
    tasks.forEach(function(route, laser) {
      route.forEach(function(task) {
        addPerimeterRange(task.rectangle, task.start, task.end, laser % 3, 0.82);
      });
      targets[laser] = finalTaskTarget(laser);
    });
  }

  let transition = this.__chairLaserTransition;
  if(transition && transition.phase === game.phase) {
    let progress = ease((now - transition.startedAt) / 900);
    let currentAnchorX = border.x + border.width * 0.5;
    let currentAnchorY = border.y + border.height * 0.5;
    let cameraDeltaX = currentAnchorX - transition.anchorX;
    let cameraDeltaY = currentAnchorY - transition.anchorY;
    targets = targets.map(function(target, index) {
      let origin = transition.targets[index] || target;
      return {
        x: origin.x + cameraDeltaX + (target.x - origin.x - cameraDeltaX) * progress,
        y: origin.y + cameraDeltaY + (target.y - origin.y - cameraDeltaY) * progress
      };
    });
    amount = transition.amount + (amount - transition.amount) * progress;
    if(progress >= 1) this.__chairLaserTransition = null;
  }

  return {
    phase: game.phase,
    elapsedMs: elapsed,
    amount: clamp(amount),
    drawDurationMs: Number.isFinite(game.drawDurationMs)
      ? game.drawDurationMs
      : 1600 + Math.ceil(Math.max(0, squareRectangles.length - 9) / 9) * 800,
    targets: targets,
    trailLines: trailLines
  };

};

WeatherCanvas.prototype.__getPartyFlowFrame = function(flow, now) {

  let elapsed = flow.elapsedMs + Math.max(0, now - flow.receivedAt);
  let floor = flow.floor;
  let fromScreen = gameClient.renderer.getStaticScreenPosition(
    new Position(floor.from.x, floor.from.y, floor.from.z)
  );
  let toScreen = gameClient.renderer.getStaticScreenPosition(
    new Position(floor.to.x, floor.to.y, floor.to.z)
  );
  let border = {
    x: Math.min(fromScreen.x, toScreen.x) * 32,
    y: Math.min(fromScreen.y, toScreen.y) * 32,
    width: (Math.abs(toScreen.x - fromScreen.x) + 1) * 32,
    height: (Math.abs(toScreen.y - fromScreen.y) + 1) * 32
  };
  let centerX = border.x + border.width * 0.5;
  let centerY = border.y + border.height * 0.5;
  let perimeter = border.width * 2 + border.height * 2;

  function perimeterPoint(progress) {
    let distance = ((progress % 1) + 1) % 1 * perimeter;
    if(distance <= border.width) return { x: border.x + distance, y: border.y };
    distance -= border.width;
    if(distance <= border.height) return { x: border.x + border.width, y: border.y + distance };
    distance -= border.height;
    if(distance <= border.width) return { x: border.x + border.width - distance, y: border.y + border.height };
    distance -= border.width;
    return { x: border.x, y: border.y + border.height - distance };
  }

  function borderLines(progress) {
    let points = [
      { x: border.x, y: border.y },
      { x: border.x + border.width, y: border.y },
      { x: border.x + border.width, y: border.y + border.height },
      { x: border.x, y: border.y + border.height },
      { x: border.x, y: border.y }
    ];
    let remaining = Math.max(0, Math.min(1, progress)) * perimeter;
    let lines = [];
    for(let index = 0; index < 4 && remaining > 0; index++) {
      let start = points[index];
      let end = points[index + 1];
      let length = Math.hypot(end.x - start.x, end.y - start.y);
      let portion = Math.min(1, remaining / length);
      lines.push({
        x1: start.x,
        y1: start.y,
        x2: start.x + (end.x - start.x) * portion,
        y2: start.y + (end.y - start.y) * portion,
        alpha: 0.94,
        colorIndex: index % 3
      });
      remaining -= length;
    }
    return lines;
  }

  if(flow.phase === "lobby") {
    let borderProgress = Math.min(1, elapsed / 1800);
    let orbit = elapsed / 9000;
    let targets = Array.from({ length: 9 }, function(_, index) {
      return perimeterPoint(orbit + index / 9);
    });
    let spotlightTargets = Array.from({ length: 4 }, function(_, index) {
      let point = perimeterPoint(orbit * 0.72 + index / 4);
      return {
        x: point.x + (centerX - point.x) * 0.16,
        y: point.y + (centerY - point.y) * 0.16
      };
    });
    let remainingMs = Math.max(0, flow.durationMs - elapsed);
    let bonus = null;
    if(flow.lastBonus) {
      let bonusElapsed = flow.lastBonus.elapsedMs + Math.max(0, now - flow.receivedAt);
      if(bonusElapsed < 2400) {
        let bonusScreen = gameClient.renderer.getStaticScreenPosition(
          new Position(flow.lastBonus.position.x, flow.lastBonus.position.y, flow.lastBonus.position.z)
        );
        bonus = {
          x: (bonusScreen.x + 0.5) * 32,
          y: (bonusScreen.y + 0.5) * 32,
          addedSeconds: flow.lastBonus.addedSeconds,
          elapsedMs: bonusElapsed
        };
      }
    }
    return {
      phase: "lobby",
      amount: 1 - Math.pow(1 - borderProgress, 3),
      targets: targets,
      trailLines: borderLines(borderProgress),
      spotlightTargets: spotlightTargets,
      centerX: centerX,
      centerY: centerY,
      remainingMs: remainingMs,
      waitingForPlayers: flow.waitingForPlayers,
      bonus: bonus
    };
  }

  let candidates = flow.candidates;
  if(candidates.length === 0) return null;
  function candidateScreen(candidate) {
    let creature = gameClient.world && typeof gameClient.world.getCreature === "function"
      ? gameClient.world.getCreature(candidate.targetId)
      : null;
    let position = creature && typeof creature.getPosition === "function"
      ? creature.getPosition()
      : new Position(candidate.targetPosition.x, candidate.targetPosition.y, candidate.targetPosition.z);
    let screen = creature && typeof gameClient.renderer.getCreatureScreenPosition === "function"
      ? gameClient.renderer.getCreatureScreenPosition(creature)
      : gameClient.renderer.getStaticScreenPosition(position);
    return { x: (screen.x + 0.5) * 32, y: (screen.y + 0.5) * 32 };
  }
  let winnerIndex = Math.max(0, candidates.findIndex(function(candidate) {
    return candidate.targetId === flow.winnerId;
  }));
  let progress = Math.max(0, Math.min(1, elapsed / flow.durationMs));
  let eased = 1 - Math.pow(1 - progress, 3.1);
  let totalSteps = candidates.length * 5 + winnerIndex;
  let rawStep = eased * totalSteps;
  let step = Math.floor(rawStep);
  let blend = rawStep - step;
  blend = blend * blend * (3 - 2 * blend);
  let current = candidateScreen(candidates[step % candidates.length]);
  let next = candidateScreen(candidates[Math.min(totalSteps, step + 1) % candidates.length]);
  let selected = progress >= 0.999
    ? candidateScreen(candidates[winnerIndex])
    : {
      x: current.x + (next.x - current.x) * blend,
      y: current.y + (next.y - current.y) * blend
    };
  let ringRadius = 44 + 8 * Math.sin(elapsed / 180);
  let ringRotation = elapsed * Math.PI * 2 / 2400;
  let rouletteTargets = Array.from({ length: 9 }, function(_, index) {
    let angle = ringRotation + index * Math.PI * 2 / 9;
    return {
      x: selected.x + Math.cos(angle) * ringRadius,
      y: selected.y + Math.sin(angle) * ringRadius * 0.72
    };
  });
  let rouletteSpotlights = Array.from({ length: 4 }, function(_, index) {
    let angle = -Math.PI * 0.5 + index * Math.PI * 0.5 + elapsed / 700;
    return {
      x: selected.x + Math.cos(angle) * 20,
      y: selected.y + Math.sin(angle) * 14
    };
  });
  let intro = Math.min(1, elapsed / 1300);
  let outro = Math.min(1, Math.max(0, (flow.durationMs - elapsed) / 500));
  return {
    phase: "roulette",
    amount: (1 - Math.pow(1 - intro, 3)) * outro,
    targets: rouletteTargets,
    trailLines: borderLines(1),
    spotlightTargets: rouletteSpotlights,
    centerX: selected.x,
    centerY: selected.y,
    remainingMs: Math.max(0, flow.durationMs - elapsed),
    winnerLocked: progress > 0.92
  };

};

WeatherCanvas.prototype.__getDiscoLightFrame = function() {

  let disco = this.__discoLights;
  let now = performance.now();
  let show = disco.laserShow;
  let showElapsed = show ? show.elapsedMs + Math.max(0, now - show.receivedAt) : 0;
  let chairActive = disco.chairGame !== null;
  let partyActive = disco.partyFlow !== null;
  let showActive = !chairActive && !partyActive && show != null && showElapsed < show.durationMs;
  let vipRequested = disco.focus && disco.focus.vipShow;
  if((!disco.spotlightsEnabled && !disco.legacyLasersEnabled && !showActive && !vipRequested && !chairActive && !partyActive) || !disco.center || disco.radius <= 0) {
    return null;
  }

  let frameNumber = gameClient.renderer.debugger.__nFrames;
  if(this.__discoLightFrame && this.__discoLightFrame.frameNumber === frameNumber) {
    return this.__discoLightFrame;
  }

  let soundManager = gameClient.interface && gameClient.interface.soundManager;
  let radioRhythm = soundManager && typeof soundManager.getRadioRhythm === "function"
    ? soundManager.getRadioRhythm(disco.beatBpm, now)
    : null;
  let effectiveBeatBpm = radioRhythm ? radioRhythm.bpm : disco.beatBpm;
  let beatPulse = radioRhythm
    ? radioRhythm.pulse
    : disco.beatBpm > 0
      ? Math.max(0, Math.sin(now * Math.PI * 2 * disco.beatBpm / 60000))
      : Math.max(0, Math.min(1, (0.76 + 0.24 * Math.sin(now / 260) - 0.62) / 0.38));
  let pulse = 0.62 + 0.38 * beatPulse;
  let intensity = disco.intensity / 100;
  let radius = Math.max(2, disco.radius);
  let center = new Position(disco.center.x, disco.center.y, disco.center.z);
  let centerScreen = gameClient.renderer.getStaticScreenPosition(center);
  let centerX = (centerScreen.x + 0.5) * 32;
  let centerY = (centerScreen.y + 0.5) * 32;
  let chairLaserFrame = chairActive
    ? this.__getLaserChairsFrame(disco.chairGame, now)
    : null;
  let partyFlowFrame = partyActive
    ? this.__getPartyFlowFrame(disco.partyFlow, now)
    : null;
  let partyTransition = this.__partyFlowTransition;
  if(partyFlowFrame && partyTransition && partyTransition.phase === disco.partyFlow.phase) {
    let partyProgress = Math.max(0, Math.min(1, (now - partyTransition.startedAt) / 1300));
    let partyEase = 1 - Math.pow(1 - partyProgress, 3);
    partyFlowFrame.targets = partyFlowFrame.targets.map(function(target, index) {
      let origin = partyTransition.targets[index] || target;
      return {
        x: origin.x + (target.x - origin.x) * partyEase,
        y: origin.y + (target.y - origin.y) * partyEase
      };
    });
    partyFlowFrame.spotlightTargets = partyFlowFrame.spotlightTargets.map(function(target, index) {
      let origin = partyTransition.spotlightTargets[index] || target;
      return {
        x: origin.x + (target.x - origin.x) * partyEase,
        y: origin.y + (target.y - origin.y) * partyEase
      };
    });
    partyFlowFrame.amount = partyTransition.amount
      + (partyFlowFrame.amount - partyTransition.amount) * partyEase;
    if(partyProgress >= 1) this.__partyFlowTransition = null;
  }
  let laserShowFrame = showActive
    ? this.__getLaserShowFrame(show, centerX, centerY, radius, now)
    : null;
  let focus = disco.focus;
  let focusElapsed = focus ? focus.elapsedMs + Math.max(0, now - focus.receivedAt) : 0;
  let focusActive = !showActive && !chairActive && !partyActive && focus !== null && (focus.persistent || focusElapsed < focus.durationMs);
  if(focus && !focusActive && !focus.expiryTransitionStarted) {
    focus.expiryTransitionStarted = true;
    if(this.__discoLightFrame && this.__discoLightFrame.lights) {
      this.__spotlightFocusTransition = {
        startedAt: now,
        laserStartAmount: focus.includeLasers === true ? 1 : 0,
        laserEndAmount: 0,
        focusCenter: this.__spotlightFocusVisual
          ? { x: this.__spotlightFocusVisual.x, y: this.__spotlightFocusVisual.y }
          : null,
        from: this.__discoLightFrame.lights.map(function(light) {
          return { x: light.targetX, y: light.targetY };
        })
      };
    }
  }
  let focusFlashing = focusActive && focusElapsed < focus.flashDurationMs && focus.flashCount > 0;
  let focusFlashOn = focusFlashing
    && focusElapsed % (focus.flashDurationMs / focus.flashCount) < Math.min(360, focus.flashDurationMs / focus.flashCount * 0.38);
  let focusStrength = focusFlashing ? (focusFlashOn ? 1.45 : 0.20) : 1;
  let laserIntroProgress = focusActive ? Math.min(1, focusElapsed / 2400) : 1;
  let laserIntroEase = laserIntroProgress * laserIntroProgress * (3 - 2 * laserIntroProgress);
  let laserFocusRadius = 40 + 120 * (1 - laserIntroEase);
  let focusScreen = null;

  if(focusActive) {
    let creature = gameClient.world && typeof gameClient.world.getCreature === "function"
      ? gameClient.world.getCreature(focus.targetId)
      : null;
    let desiredScreen = creature && typeof gameClient.renderer.getCreatureScreenPosition === "function"
      ? gameClient.renderer.getCreatureScreenPosition(creature)
      : gameClient.renderer.getStaticScreenPosition(
        creature && typeof creature.getPosition === "function"
          ? creature.getPosition()
          : new Position(focus.targetPosition.x, focus.targetPosition.y, focus.targetPosition.z)
      );
    let desiredX = (desiredScreen.x + 0.5) * 32;
    let desiredY = (desiredScreen.y + 0.5) * 32;

    // Use the exact screen-space anchor used by the creature renderer. Creature
    // movement is already interpolated there; smoothing this value a second time
    // makes an observer's camera movement leak into the focused light position.
    this.__spotlightFocusVisual = {
      targetId: focus.targetId,
      x: desiredX,
      y: desiredY,
      updatedAt: now
    };

    focusScreen = this.__spotlightFocusVisual;
  } else {
    this.__spotlightFocusVisual = null;
  }
  let vipShowFrame = focusActive && focus.vipShow && focusScreen
    ? this.__getVipShowFrame(focus, focusScreen, focusElapsed, now, effectiveBeatBpm)
    : null;
  let activeFocusScreen = vipShowFrame
    ? { x: vipShowFrame.centerX, y: vipShowFrame.centerY }
    : focusScreen;
  if(!vipShowFrame) {
    this.__vipShowTrail = [];
    this.__vipShowTrailTarget = null;
    this.__vipCrowdTrails.clear();
  } else if(!vipShowFrame.crowd) {
    this.__vipCrowdTrails.clear();
  }
  let colors = vipShowFrame ? vipShowFrame.spotlightColors : [
    [42, 120, 255],
    [232, 48, 255],
    [35, 255, 194],
    [255, 58, 112]
  ];
  let fixtureOffsets = [
    [-0.68, -1.00],
    [0.68, -1.00],
    [-1.00, 0.55],
    [1.00, 0.55]
  ];
  let motionTime = now * disco.spotlightSpeed / 100;
  let focusOrbitAngle = vipShowFrame
    ? vipShowFrame.spotlightOrbitAngle
    : -Math.PI * 0.5 + now * Math.PI * 2 / 4500;
  let focusOrbitRadius = vipShowFrame ? vipShowFrame.spotlightOrbitRadius : 22;
  let focusTransition = this.__spotlightFocusTransition;
  let transitionProgress = focusTransition
    ? Math.min(1, Math.max(0, (now - focusTransition.startedAt) / 1300))
    : 1;
  let transitionEase = 1 - Math.pow(1 - transitionProgress, 3);
  let laserFocusAmount = focusTransition
    ? focusTransition.laserStartAmount
      + (focusTransition.laserEndAmount - focusTransition.laserStartAmount) * transitionEase
    : (focusActive && focus.includeLasers ? 1 : 0);
  let laserFocusCenter = activeFocusScreen || (focusTransition ? focusTransition.focusCenter : null);
  if(focusTransition && focusTransition.focusCenter && activeFocusScreen) {
    laserFocusCenter = {
      x: focusTransition.focusCenter.x + (activeFocusScreen.x - focusTransition.focusCenter.x) * transitionEase,
      y: focusTransition.focusCenter.y + (activeFocusScreen.y - focusTransition.focusCenter.y) * transitionEase
    };
  }
  let lights = colors.map(function(color, index) {
    let phase = index * Math.PI * 0.5;
    let travelX = Math.sin(motionTime / (1350 + index * 170) + phase);
    let travelY = Math.cos(motionTime / (1750 - index * 90) + phase * 1.35);
    let targetWorld = new Position(
        center.x + travelX * radius * 0.46,
        center.y + travelY * radius * 0.46,
        center.z
    );
    let targetScreen = gameClient.renderer.getStaticScreenPosition(targetWorld);
    let orbitAngle = focusOrbitAngle + index * Math.PI * 0.5;
    let normalTargetX = (targetScreen.x + 0.5) * 32;
    let normalTargetY = (targetScreen.y + 0.5) * 32;
    let showTarget = laserShowFrame && laserShowFrame.spotlightTargets[index];
    let partyTarget = partyFlowFrame && partyFlowFrame.spotlightTargets[index];
    let desiredTargetX = partyTarget
      ? normalTargetX + (partyTarget.x - normalTargetX) * partyFlowFrame.amount
      : showTarget
      ? normalTargetX + (showTarget.x - normalTargetX) * laserShowFrame.amount
      : activeFocusScreen
        ? activeFocusScreen.x + Math.cos(orbitAngle) * focusOrbitRadius
        : normalTargetX;
    let desiredTargetY = partyTarget
      ? normalTargetY + (partyTarget.y - normalTargetY) * partyFlowFrame.amount
      : showTarget
      ? normalTargetY + (showTarget.y - normalTargetY) * laserShowFrame.amount
      : activeFocusScreen
        ? activeFocusScreen.y + Math.sin(orbitAngle) * focusOrbitRadius
        : normalTargetY;
    let transitionStart = focusTransition && focusTransition.from[index];

    return {
      color: color,
      fixtureX: centerX + fixtureOffsets[index][0] * radius * 32,
      fixtureY: centerY + fixtureOffsets[index][1] * radius * 32,
      targetX: transitionStart
        ? transitionStart.x + (desiredTargetX - transitionStart.x) * transitionEase
        : desiredTargetX,
      targetY: transitionStart
        ? transitionStart.y + (desiredTargetY - transitionStart.y) * transitionEase
        : desiredTargetY
    };
  });

  if(focusTransition && transitionProgress >= 1) {
    this.__spotlightFocusTransition = null;
  }

  this.__discoLightFrame = {
    frameNumber: frameNumber,
    now: now,
    beatBpm: effectiveBeatBpm,
    beatSource: radioRhythm ? radioRhythm.source : "bpm",
    beatPulse: beatPulse,
    beatStrength: radioRhythm ? radioRhythm.strength : 1,
    pulse: pulse,
    intensity: intensity,
    spotlightsEnabled: disco.spotlightsEnabled || showActive || partyActive || Boolean(
      vipShowFrame && vipShowFrame.effect !== "circuit"
    ),
    legacyLasersEnabled: disco.legacyLasersEnabled || showActive || chairActive || partyActive || Boolean(
      vipShowFrame && ["laser", "name", "duel"].includes(vipShowFrame.effect)
    ),
    radius: radius,
    centerX: centerX,
    centerY: centerY,
    focusActive: focusActive,
    focusFlashing: focusFlashing,
    focusFlashOn: focusFlashOn,
    focusStrength: focusStrength,
    laserFocusAmount: laserFocusAmount,
    laserFocusCenterX: laserFocusCenter ? laserFocusCenter.x : null,
    laserFocusCenterY: laserFocusCenter ? laserFocusCenter.y : null,
    laserFocusRadius: laserFocusRadius,
    laserShow: laserShowFrame,
    chairGame: disco.chairGame,
    chairLasers: chairLaserFrame,
    partyFlow: partyFlowFrame,
    vipShow: vipShowFrame,
    vipLaserTargets: vipShowFrame ? vipShowFrame.laserTargets : null,
    clip: {
      x: centerX - radius * 32 - 16,
      y: centerY - radius * 32 - 16,
      width: (radius * 2 + 1) * 32,
      height: (radius * 2 + 1) * 32
    },
    lights: lights
  };

  return this.__discoLightFrame;

}

WeatherCanvas.prototype.renderDiscoIllumination = function(lightCanvas) {

  let frame = this.__getDiscoLightFrame();
  if(!frame || !frame.spotlightsEnabled) {
    return;
  }

  let mobileScale = gameClient.touch && gameClient.touch.isMobileMode ? 0.82 : 1;
  let strength = frame.intensity * frame.pulse * mobileScale;
  if(frame.vipShow) strength *= frame.vipShow.intensityMultiplier;

  frame.lights.forEach(function(light) {
    let mobile = gameClient.touch && gameClient.touch.isMobileMode;
    let beamEndWidth = (mobile ? 30 : 42) + 20 * frame.intensity;
    let targetRadius = Math.min(250, Math.max(155, frame.radius * 28)) * mobileScale;
    let targetStrength = Math.min(1, strength * 2.55 * frame.focusStrength);

    // The complete cone participates in the real light mask. Its lower power
    // keeps the moving target visibly brighter than the path leading to it.
    lightCanvas.renderColorLightBeam(
      light.fixtureX,
      light.fixtureY,
      light.targetX,
      light.targetY,
      4,
      beamEndWidth,
      light.color,
      strength * 0.38 * frame.focusStrength,
      frame.clip
    );

    // The moving pool illuminates tiles, items and creatures through the same
    // darkness mask as ordinary Tibia light sources.
    lightCanvas.renderColorLightBubble(
      light.targetX,
      light.targetY,
      targetRadius,
      light.color,
      targetStrength,
      frame.clip
    );

    // A smaller halo keeps the physical fixture readable in a dark room.
    lightCanvas.renderColorLightBubble(
      light.fixtureX,
      light.fixtureY,
      45 * mobileScale,
      light.color,
      strength * 0.68,
      frame.clip
    );
  });

}

WeatherCanvas.prototype.__drawVipSpecialEffect = function(context, frame, mobile, rgb, drawGlow) {

  let show = frame.vipShow;
  let centerX = show.centerX;
  let centerY = show.centerY;
  let colors = show.colors;
  let strength = show.intensityMultiplier * show.amount * show.effectAmount;
  let phase = show.effectElapsedMs;
  let countScale = mobile ? 0.68 : 1;

  function color(index, alpha) {
    return rgb(colors[index % colors.length], alpha);
  }

  function polygon(x, y, radius, sides, rotation) {
    context.beginPath();
    for(let index = 0; index <= sides; index++) {
      let angle = rotation + index * Math.PI * 2 / sides;
      let px = x + Math.cos(angle) * radius;
      let py = y + Math.sin(angle) * radius * 0.72;
      if(index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  }

  context.globalCompositeOperation = "screen";
  context.lineWidth = mobile ? 1.4 : 2;

  if(show.effect === "hologram") {
    let cloneCount = mobile ? 3 : 5;
    for(let clone = 0; clone < cloneCount; clone++) {
      let angle = phase / 600 + clone * Math.PI * 2 / cloneCount;
      let distance = (mobile ? 38 : 54) + 9 * Math.sin(phase / 240 + clone);
      let x = centerX + Math.cos(angle) * distance;
      let y = centerY + Math.sin(angle) * distance * 0.58;
      drawGlow(x, y, mobile ? 20 : 27, colors[clone % colors.length], 0.28 * strength);
      if(typeof context.drawImage === "function" && this.screen.canvas) {
        context.globalAlpha = 0.30 * strength;
        context.drawImage(this.screen.canvas, centerX - 18, centerY - 24, 36, 48, x - 18, y - 24, 36, 48);
      } else {
        context.globalAlpha = 0.68 * strength;
        context.fillStyle = color(clone, 1);
        context.beginPath();
        context.arc(x, y - 8, mobile ? 5 : 7, 0, Math.PI * 2);
        context.fill();
        context.fillRect(x - (mobile ? 5 : 7), y, mobile ? 10 : 14, mobile ? 15 : 21);
      }
    }
  } else if(show.effect === "wings") {
    let flap = 0.72 + 0.28 * Math.sin(phase / 150);
    [-1, 1].forEach(function(side, wingIndex) {
      context.globalAlpha = 0.80 * strength;
      context.strokeStyle = color(wingIndex * 2 + 1, 1);
      context.lineWidth = mobile ? 2 : 3;
      for(let feather = 0; feather < 5; feather++) {
        let rootX = centerX + side * 6;
        let rootY = centerY - 7 + feather * 3;
        let reach = (mobile ? 32 : 48) + feather * 3;
        context.beginPath();
        context.moveTo(rootX, rootY);
        context.quadraticCurveTo(
          centerX + side * reach * 0.62,
          centerY - (mobile ? 35 : 48) * flap + feather * 7,
          centerX + side * reach,
          centerY - 18 + feather * (mobile ? 8 : 10)
        );
        context.stroke();
      }
      drawGlow(centerX + side * (mobile ? 31 : 43), centerY - 8, mobile ? 25 : 35, colors[wingIndex * 2 + 1], 0.20 * strength);
    });
  } else if(show.effect === "equalizer") {
    let bars = mobile ? 11 : 17;
    let totalWidth = mobile ? 150 : 250;
    let barWidth = totalWidth / bars - 3;
    for(let bar = 0; bar < bars; bar++) {
      let pulse = 0.25 + 0.75 * Math.abs(Math.sin(phase / 155 + bar * 0.83));
      let height = (mobile ? 30 : 48) * pulse * (0.75 + show.beatStrength * 0.45);
      let x = centerX - totalWidth / 2 + bar * totalWidth / bars;
      let y = centerY + (mobile ? 55 : 78);
      context.globalAlpha = 0.68 * strength;
      context.fillStyle = color(bar, 1);
      context.fillRect(x, y - height, barWidth, height);
      drawGlow(x + barWidth / 2, y - height, mobile ? 8 : 12, colors[bar % colors.length], 0.13 * strength);
    }
  } else if(show.effect === "vortex" || show.effect === "portal") {
    let portal = show.effect === "portal";
    let rings = mobile ? 5 : 8;
    for(let ring = 0; ring < rings; ring++) {
      let progress = (ring / rings + phase / (portal ? 1800 : 1250)) % 1;
      let radius = portal ? 22 + progress * (mobile ? 58 : 88) : 12 + progress * (mobile ? 82 : 126);
      context.globalAlpha = (1 - progress) * 0.62 * strength;
      context.strokeStyle = color(ring, 1);
      context.lineWidth = mobile ? 1.5 : 2.4;
      context.beginPath();
      context.arc(centerX, centerY, radius, phase / 370 + ring, phase / 370 + ring + Math.PI * (portal ? 1.65 : 1.15));
      context.stroke();
      let angle = phase / (portal ? 260 : 180) + ring * 2.399963;
      let x = centerX + Math.cos(angle) * radius;
      let y = centerY + Math.sin(angle) * radius * 0.68;
      drawGlow(x, y, mobile ? 7 : 10, colors[ring % colors.length], 0.42 * strength);
    }
    if(portal) {
      drawGlow(centerX, centerY, mobile ? 46 : 68, colors[1 % colors.length], 0.28 * strength);
      context.globalAlpha = 0.72 * strength;
      context.strokeStyle = color(2, 1);
      polygon(centerX, centerY, mobile ? 31 : 46, 8, phase / 900);
    }
  } else if(show.effect === "comet") {
    let comets = Math.round((mobile ? 10 : 17) * countScale + 4);
    for(let comet = 0; comet < comets; comet++) {
      let travel = (phase / (900 + comet % 4 * 120) + comet * 0.173) % 1;
      let x = frame.clip.x + ((comet * 79) % Math.max(1, frame.clip.width + 180)) - 80 + travel * 95;
      let y = frame.clip.y - 30 + travel * (frame.clip.height + 90);
      let length = mobile ? 22 : 34;
      context.globalAlpha = (1 - travel * 0.35) * 0.72 * strength;
      context.strokeStyle = color(comet, 1);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - length * 0.72, y - length);
      context.stroke();
      drawGlow(x, y, mobile ? 5 : 8, colors[comet % colors.length], 0.55 * strength);
    }
  } else if(show.effect === "rewind") {
    let freezePulse = 0.55 + 0.45 * Math.sin(phase / 90);
    this.__vipShowTrail.slice().reverse().forEach(function(point, index) {
      context.globalAlpha = (1 - index / Math.max(1, this.__vipShowTrail.length)) * 0.72 * strength;
      context.strokeStyle = color(index, 1);
      context.beginPath();
      context.arc(point.x, point.y, (mobile ? 9 : 13) + index * 2, 0, Math.PI * 2);
      context.stroke();
    }, this);
    context.globalAlpha = 0.75 * strength;
    context.strokeStyle = color(2, 1);
    for(let shard = 0; shard < (mobile ? 8 : 14); shard++) {
      let angle = shard * Math.PI * 2 / (mobile ? 8 : 14);
      let inner = 24 + freezePulse * 8;
      let outer = inner + 12 + shard % 3 * 5;
      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
      context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
      context.stroke();
    }
  } else if(show.effect === "helix") {
    let points = mobile ? 22 : 34;
    for(let strand = 0; strand < 2; strand++) {
      context.globalAlpha = 0.78 * strength;
      context.strokeStyle = color(strand * 2, 1);
      context.beginPath();
      for(let point = 0; point < points; point++) {
        let t = point / (points - 1);
        let y = centerY - (mobile ? 75 : 112) + t * (mobile ? 150 : 224);
        let x = centerX + Math.sin(t * Math.PI * 5 + phase / 270 + strand * Math.PI) * (mobile ? 28 : 42);
        if(point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
        if(strand === 1 && point % 3 === 0) {
          let otherX = centerX + Math.sin(t * Math.PI * 5 + phase / 270) * (mobile ? 28 : 42);
          context.moveTo(otherX, y);
          context.lineTo(x, y);
        }
      }
      context.stroke();
    }
  } else if(show.effect === "pixel") {
    let pixels = mobile ? 22 : 38;
    let burst = 0.15 + 0.85 * Math.abs(Math.sin(phase / 700));
    for(let pixel = 0; pixel < pixels; pixel++) {
      let angle = pixel * 2.399963 + phase / 2200;
      let distance = burst * (20 + (pixel % 9) * (mobile ? 6 : 9));
      let size = mobile ? 3 + pixel % 3 : 4 + pixel % 4;
      context.globalAlpha = (1 - burst * 0.38) * 0.82 * strength;
      context.fillStyle = color(pixel, 1);
      context.fillRect(centerX + Math.cos(angle) * distance - size / 2, centerY + Math.sin(angle) * distance * 0.72 - size / 2, size, size);
    }
  } else if(show.effect === "soundwave") {
    for(let wave = 0; wave < (mobile ? 6 : 9); wave++) {
      let progress = (show.beatProgress + wave / (mobile ? 6 : 9)) % 1;
      context.globalAlpha = (1 - progress) * 0.66 * strength;
      context.strokeStyle = color(wave, 1);
      context.lineWidth = mobile ? 1.2 : 2;
      polygon(centerX, centerY, 18 + progress * (mobile ? 100 : 160), 6, phase / 1500 + wave * 0.12);
    }
  } else if(show.effect === "cage") {
    let posts = mobile ? 8 : 12;
    for(let post = 0; post < posts; post++) {
      let angle = post * Math.PI * 2 / posts + phase / 2100;
      let x = centerX + Math.cos(angle) * (mobile ? 54 : 76);
      let baseY = centerY + Math.sin(angle) * (mobile ? 33 : 46);
      let topY = baseY - (mobile ? 68 : 105) - Math.sin(phase / 85 + post) * 8;
      context.globalAlpha = 0.66 * strength;
      context.strokeStyle = color(post, 1);
      context.beginPath();
      context.moveTo(x, baseY);
      context.lineTo(x + Math.sin(phase / 65 + post) * 5, (baseY + topY) / 2);
      context.lineTo(x, topY);
      context.stroke();
      drawGlow(x, baseY, mobile ? 7 : 10, colors[post % colors.length], 0.32 * strength);
    }
  } else if(show.effect === "duel") {
    for(let sword = 0; sword < 4; sword++) {
      let direction = sword % 2 === 0 ? 1 : -1;
      let angle = direction * phase / 360 + sword * Math.PI / 2;
      let orbit = mobile ? 35 : 52;
      let x = centerX + Math.cos(angle) * orbit;
      let y = centerY + Math.sin(angle) * orbit * 0.62;
      let bladeAngle = angle + direction * Math.PI * 0.72;
      context.globalAlpha = 0.86 * strength;
      context.strokeStyle = color(sword, 1);
      context.lineWidth = mobile ? 3 : 4;
      context.beginPath();
      context.moveTo(x - Math.cos(bladeAngle) * 8, y - Math.sin(bladeAngle) * 8);
      context.lineTo(x + Math.cos(bladeAngle) * (mobile ? 35 : 52), y + Math.sin(bladeAngle) * (mobile ? 35 : 52));
      context.stroke();
    }
    drawGlow(centerX, centerY, mobile ? 24 : 35, colors[4 % colors.length], (0.28 + show.beatStrength * 0.32) * strength);
  } else if(show.effect === "discoball") {
    let ballY = centerY - (mobile ? 68 : 105);
    let ballRadius = mobile ? 20 : 30;
    drawGlow(centerX, ballY, ballRadius * 2.6, colors[1 % colors.length], 0.35 * strength);
    context.globalAlpha = 0.92 * strength;
    context.fillStyle = color(2, 0.52);
    context.beginPath();
    context.arc(centerX, ballY, ballRadius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.75)";
    for(let grid = -2; grid <= 2; grid++) {
      context.beginPath();
      context.moveTo(centerX - ballRadius, ballY + grid * ballRadius / 3);
      context.lineTo(centerX + ballRadius, ballY + grid * ballRadius / 3);
      context.stroke();
    }
    for(let ray = 0; ray < (mobile ? 10 : 16); ray++) {
      let angle = phase / 620 + ray * Math.PI * 2 / (mobile ? 10 : 16);
      context.globalAlpha = 0.42 * strength;
      context.strokeStyle = color(ray, 1);
      context.beginPath();
      context.moveTo(centerX, ballY);
      context.lineTo(centerX + Math.cos(angle) * (mobile ? 130 : 220), ballY + Math.sin(angle) * (mobile ? 100 : 165));
      context.stroke();
    }
  } else if(show.effect === "constellation") {
    let stars = show.crowd
      ? (show.participants || []).slice()
      : [{ x: centerX, y: centerY, targetName: show.targetName }].concat(show.participants || []);
    if(stars.length === 1) {
      for(let fallback = 0; fallback < 5; fallback++) {
        let angle = fallback * Math.PI * 2 / 5 + phase / 1600;
        stars.push({ x: centerX + Math.cos(angle) * (mobile ? 60 : 95), y: centerY + Math.sin(angle) * (mobile ? 40 : 62) });
      }
    }
    stars.slice(0, 13).forEach(function(star, index, allStars) {
      let next = allStars[(index + 1) % allStars.length];
      context.globalAlpha = 0.50 * strength;
      context.strokeStyle = color(index, 1);
      context.beginPath();
      context.moveTo(star.x, star.y);
      context.lineTo(next.x, next.y);
      context.stroke();
      drawGlow(star.x, star.y, mobile ? 8 : 12, colors[index % colors.length], 0.64 * strength);
    });
  } else if(show.effect === "combo") {
    let combo = 1 + Math.floor(show.effectProgress * 12);
    for(let step = 0; step < combo; step++) {
      let angle = step * 2.399963 - phase / 430;
      let radius = 24 + step * (mobile ? 4 : 6);
      drawGlow(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius * 0.65, mobile ? 5 : 8, colors[step % colors.length], 0.44 * strength);
    }
    if(typeof context.fillText === "function") {
      context.globalAlpha = 0.92 * strength;
      context.font = mobile ? "bold 18px Arial" : "bold 28px Arial";
      context.textAlign = "center";
      context.fillStyle = color(combo, 1);
      if(typeof context.strokeText === "function") {
        context.lineWidth = 5;
        context.strokeStyle = "rgba(0,0,0,0.9)";
        context.strokeText("COMBO x" + combo, centerX, centerY - (mobile ? 50 : 72));
      }
      context.fillText("COMBO x" + combo, centerX, centerY - (mobile ? 50 : 72));
    }
  } else if(show.effect === "name") {
    let name = String(show.targetName || "STAR").toUpperCase().slice(0, 12);
    let textFrame = this.__getLaserTextHoldChoreography(name, centerX, centerY - (mobile ? 60 : 90), frame.radius, phase, mobile ? 220 : 360, mobile ? 28 : 42);
    context.lineWidth = mobile ? 1.7 : 2.7;
    textFrame.trailLines.forEach(function(line, index) {
      context.globalAlpha = 0.78 * strength;
      context.strokeStyle = color(index, 1);
      context.beginPath();
      context.moveTo(line.x1, line.y1);
      context.lineTo(line.x2, line.y2);
      context.stroke();
    });
  }

}

WeatherCanvas.prototype.__drawVipCrowdEffect = function(context, frame, mobile, rgb, drawGlow) {

  let show = frame.vipShow;
  let dancers = show && show.crowd ? (show.participants || []) : [];
  if(dancers.length === 0) return;

  let colors = show.colors;
  let strength = show.intensityMultiplier * show.amount * show.effectAmount;
  let phase = show.effectElapsedMs;
  let centerX = show.centerX;
  let centerY = show.centerY;
  let now = frame.now;
  let activeIds = new Set(dancers.map(function(dancer) { return dancer.targetId; }));

  this.__vipCrowdTrails.forEach(function(_, targetId, trails) {
    if(!activeIds.has(targetId)) trails.delete(targetId);
  });

  dancers.forEach(function(dancer) {
    let trail = this.__vipCrowdTrails.get(dancer.targetId) || [];
    let latest = trail.length > 0 ? trail[trail.length - 1] : null;
    if(!latest || now - latest.at >= 80) trail.push({ x: dancer.x, y: dancer.y, at: now });
    trail = trail.filter(function(point) { return now - point.at <= 760; }).slice(-7);
    this.__vipCrowdTrails.set(dancer.targetId, trail);
  }, this);

  function color(index, alpha) {
    return rgb(colors[index % colors.length], alpha);
  }

  function link(from, to, index, alpha, width) {
    context.globalAlpha = alpha * strength;
    context.strokeStyle = color(index, 1);
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  function loop(alpha, width) {
    if(dancers.length < 2) return;
    dancers.forEach(function(dancer, index) {
      link(dancer, dancers[(index + 1) % dancers.length], index, alpha, width);
    });
  }

  context.globalCompositeOperation = "screen";

  dancers.forEach(function(dancer, index) {
    let pulse = 0.78 + show.beatStrength * 0.42;
    drawGlow(dancer.x, dancer.y, (mobile ? 17 : 23) * pulse, colors[index % colors.length], 0.16 * strength);
  });

  if(show.effect === "circuit") {
    let floor = show.floorClip;
    let floorCenterX = floor.x + floor.width / 2;
    let floorCenterY = floor.y + floor.height / 2;
    let tileSize = 32;
    let beatStep = Math.floor((show.elapsedMs / Math.max(1, frame.beatBpm > 0 ? 60000 / frame.beatBpm : 520)));

    function drawCircuitPath(from, bend, to, index, alpha, width) {
      context.globalAlpha = alpha * strength;
      context.strokeStyle = color(index, 1);
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(bend.x, bend.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }

    function pointAlongCircuitPath(from, bend, to, progress) {
      let firstLength = Math.hypot(bend.x - from.x, bend.y - from.y);
      let secondLength = Math.hypot(to.x - bend.x, to.y - bend.y);
      let totalLength = Math.max(1, firstLength + secondLength);
      let distance = progress * totalLength;
      if(distance <= firstLength) {
        let amount = firstLength === 0 ? 1 : distance / firstLength;
        return {
          x: from.x + (bend.x - from.x) * amount,
          y: from.y + (bend.y - from.y) * amount
        };
      }
      let amount = secondLength === 0 ? 1 : (distance - firstLength) / secondLength;
      return {
        x: bend.x + (to.x - bend.x) * amount,
        y: bend.y + (to.y - bend.y) * amount
      };
    }

    function perimeterPoint(progress) {
      let width = floor.width;
      let height = floor.height;
      let perimeter = 2 * (width + height);
      let distance = ((progress % 1) + 1) % 1 * perimeter;
      if(distance <= width) return { x: floor.x + distance, y: floor.y };
      distance -= width;
      if(distance <= height) return { x: floor.x + width, y: floor.y + distance };
      distance -= height;
      if(distance <= width) return { x: floor.x + width - distance, y: floor.y + height };
      distance -= width;
      return { x: floor.x, y: floor.y + height - distance };
    }

    context.save();
    context.beginPath();
    context.rect(floor.x, floor.y, floor.width, floor.height);
    context.clip();

    // The physical 13x13 tile grid becomes a dim circuit board.
    context.lineWidth = mobile ? 0.6 : 0.9;
    for(let grid = 0; grid <= 13; grid++) {
      context.globalAlpha = (grid === 0 || grid === 13 ? 0.30 : 0.09) * strength;
      context.strokeStyle = color(grid, 1);
      context.beginPath();
      context.moveTo(floor.x + grid * tileSize, floor.y);
      context.lineTo(floor.x + grid * tileSize, floor.y + floor.height);
      context.moveTo(floor.x, floor.y + grid * tileSize);
      context.lineTo(floor.x + floor.width, floor.y + grid * tileSize);
      context.stroke();
    }

    // A moving border and four packets make the square itself part of the show.
    context.globalAlpha = 0.72 * strength;
    context.strokeStyle = color(beatStep, 1);
    context.lineWidth = mobile ? 2 : 3;
    if(typeof context.setLineDash === "function") {
      context.setLineDash([12, 8]);
      context.lineDashOffset = -phase / 28;
    }
    context.strokeRect && context.strokeRect(floor.x + 2, floor.y + 2, floor.width - 4, floor.height - 4);
    if(typeof context.setLineDash === "function") context.setLineDash([]);
    for(let packet = 0; packet < 4; packet++) {
      let point = perimeterPoint(phase / 2600 + packet / 4);
      drawGlow(point.x, point.y, mobile ? 9 : 13, colors[(packet + beatStep) % colors.length], 0.72 * strength);
    }

    // Crossing scanners wake each occupied SQM as they pass it.
    let scanProgress = (phase / 1700) % 1;
    let scanX = floor.x + scanProgress * floor.width;
    let scanY = floor.y + ((phase / 2100 + 0.5) % 1) * floor.height;
    context.globalAlpha = 0.32 * strength;
    context.strokeStyle = color(beatStep + 1, 1);
    context.lineWidth = mobile ? 1 : 1.5;
    context.beginPath();
    context.moveTo(scanX, floor.y);
    context.lineTo(scanX, floor.y + floor.height);
    context.moveTo(floor.x, scanY);
    context.lineTo(floor.x + floor.width, scanY);
    context.stroke();

    // Every dancer is a live node. Movement rewires the Manhattan paths on
    // the next frame, while beat packets travel between the current SQMs.
    dancers.forEach(function(dancer, index) {
      let target = dancers.length === 1
        ? { x: floorCenterX, y: floorCenterY }
        : dancers[(index + 1) % dancers.length];
      let useHorizontalFirst = (index + beatStep) % 2 === 0;
      let bend = useHorizontalFirst
        ? { x: target.x, y: dancer.y }
        : { x: dancer.x, y: target.y };
      let tileDistance = (Math.abs(target.x - dancer.x) + Math.abs(target.y - dancer.y)) / tileSize;
      let proximity = Math.max(0, Math.min(1, 1 - tileDistance / 8));
      let pathAlpha = 0.30 + proximity * 0.48 + show.beatStrength * 0.14;
      drawCircuitPath(dancer, bend, target, index + beatStep, pathAlpha, mobile ? 1.3 : 2);

      let packetProgress = (show.beatProgress + index / Math.max(1, dancers.length)) % 1;
      let packetPoint = pointAlongCircuitPath(dancer, bend, target, packetProgress);
      drawGlow(packetPoint.x, packetPoint.y, mobile ? 7 : 10, colors[(index + beatStep + 2) % colors.length], 0.72 * strength);

      let nodeRadius = (mobile ? 10 : 14) + show.beatStrength * (mobile ? 6 : 9);
      context.globalAlpha = (0.58 + proximity * 0.28) * strength;
      context.strokeStyle = color(index + beatStep, 1);
      context.lineWidth = mobile ? 1.5 : 2.3;
      context.beginPath();
      context.arc(dancer.x, dancer.y, nodeRadius, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = color(index + 2, 1);
      context.globalAlpha = 0.75 * strength;
      context.fillRect(dancer.x - 3, dancer.y - 3, 6, 6);
    });

    // The closing charge converges on the central SQM and expands as a square
    // pulse, still clipped to the physical dance floor.
    if(show.effectProgress >= 0.72) {
      let finale = Math.min(1, (show.effectProgress - 0.72) / 0.28);
      dancers.forEach(function(dancer, index) {
        let bend = index % 2 === 0
          ? { x: floorCenterX, y: dancer.y }
          : { x: dancer.x, y: floorCenterY };
        drawCircuitPath(dancer, bend, { x: floorCenterX, y: floorCenterY }, index + 3, 0.66 * finale, mobile ? 1.5 : 2.4);
      });
      drawGlow(floorCenterX, floorCenterY, (mobile ? 18 : 26) + finale * (mobile ? 24 : 38), colors[(beatStep + 4) % colors.length], 0.60 * finale * strength);
      context.globalAlpha = (1 - finale * 0.35) * 0.82 * strength;
      context.strokeStyle = color(beatStep + 4, 1);
      context.lineWidth = mobile ? 2 : 3;
      context.strokeRect && context.strokeRect(
        floorCenterX - finale * floor.width / 2,
        floorCenterY - finale * floor.height / 2,
        finale * floor.width,
        finale * floor.height
      );
    }

    context.restore();
  } else if(show.effect === "laser") {
    loop(0.52, mobile ? 1.2 : 1.8);
    dancers.forEach(function(dancer, index) {
      link({ x: centerX, y: centerY }, dancer, index + 1, 0.58, mobile ? 1.3 : 2);
      for(let ray = -1; ray <= 1; ray++) {
        let angle = phase / 480 + index * 2.399963 + ray * 0.32;
        let reach = mobile ? 27 : 40;
        link(dancer, {
          x: dancer.x + Math.cos(angle) * reach,
          y: dancer.y + Math.sin(angle) * reach * 0.72
        }, index + ray + 4, 0.64, mobile ? 1.2 : 1.8);
      }
    });
  } else if(show.effect === "hologram") {
    dancers.forEach(function(dancer, index) {
      for(let clone = 1; clone <= 3; clone++) {
        let angle = phase / 650 + index * 1.7 + clone * Math.PI * 2 / 3;
        let x = dancer.x + Math.cos(angle) * clone * (mobile ? 6 : 9);
        let y = dancer.y + Math.sin(angle) * clone * (mobile ? 4 : 6);
        context.globalAlpha = (0.34 / clone) * strength;
        context.strokeStyle = color(index + clone, 1);
        context.lineWidth = mobile ? 1 : 1.5;
        context.beginPath();
        context.arc(x, y - (mobile ? 7 : 9), mobile ? 4 : 5, 0, Math.PI * 2);
        context.stroke();
        context.strokeRect && context.strokeRect(x - (mobile ? 5 : 7), y, mobile ? 10 : 14, mobile ? 13 : 18);
      }
    });
  } else if(show.effect === "wings") {
    dancers.forEach(function(dancer, index) {
      [-1, 1].forEach(function(side) {
        context.globalAlpha = 0.70 * strength;
        context.strokeStyle = color(index + (side > 0 ? 2 : 0), 1);
        context.lineWidth = mobile ? 1.4 : 2;
        for(let feather = 0; feather < 3; feather++) {
          context.beginPath();
          context.moveTo(dancer.x + side * 4, dancer.y - 5 + feather * 3);
          context.quadraticCurveTo(
            dancer.x + side * (mobile ? 19 : 27),
            dancer.y - (mobile ? 20 : 28) + feather * 6,
            dancer.x + side * (mobile ? 27 : 38),
            dancer.y - 8 + feather * 8
          );
          context.stroke();
        }
      });
    });
  } else if(show.effect === "equalizer") {
    dancers.forEach(function(dancer, index) {
      for(let bar = 0; bar < 5; bar++) {
        let height = (mobile ? 9 : 14) + Math.abs(Math.sin(phase / 135 + index + bar)) * (mobile ? 14 : 22);
        context.globalAlpha = 0.70 * strength;
        context.fillStyle = color(index + bar, 1);
        context.fillRect(dancer.x - 13 + bar * 6, dancer.y + 19 - height, mobile ? 3 : 4, height);
      }
    });
  } else if(show.effect === "vortex" || show.effect === "portal") {
    loop(0.36, mobile ? 1 : 1.5);
    dancers.forEach(function(dancer, index) {
      let progress = (phase / 900 + index / Math.max(1, dancers.length)) % 1;
      let next = dancers[(index + 1) % dancers.length];
      let x = dancer.x + (next.x - dancer.x) * progress;
      let y = dancer.y + (next.y - dancer.y) * progress;
      drawGlow(x, y, mobile ? 7 : 10, colors[index % colors.length], 0.56 * strength);
      context.globalAlpha = 0.50 * strength;
      context.strokeStyle = color(index + 1, 1);
      context.beginPath();
      context.arc(dancer.x, dancer.y, (mobile ? 15 : 21) + 7 * Math.sin(phase / 220 + index), 0, Math.PI * 2);
      context.stroke();
    });
  } else if(show.effect === "comet") {
    dancers.forEach(function(dancer, index) {
      let angle = -0.9 + Math.sin(phase / 700 + index) * 0.24;
      let length = mobile ? 42 : 66;
      link({
        x: dancer.x - Math.cos(angle) * length,
        y: dancer.y - Math.sin(angle) * length
      }, dancer, index, 0.68, mobile ? 2 : 3);
      drawGlow(dancer.x, dancer.y, mobile ? 11 : 16, colors[index % colors.length], 0.58 * strength);
    });
  } else if(show.effect === "rewind") {
    this.__vipCrowdTrails.forEach(function(trail, targetId) {
      trail.forEach(function(point, index) {
        let alpha = (index + 1) / Math.max(1, trail.length) * 0.28 * strength;
        drawGlow(point.x, point.y, mobile ? 9 : 13, colors[(targetId + index) % colors.length], alpha);
      });
    });
  } else if(show.effect === "helix") {
    dancers.forEach(function(dancer, index) {
      let next = dancers[(index + 1) % dancers.length];
      for(let point = 0; point <= 8; point++) {
        let progress = point / 8;
        let x = dancer.x + (next.x - dancer.x) * progress;
        let y = dancer.y + (next.y - dancer.y) * progress;
        let wave = Math.sin(progress * Math.PI * 4 + phase / 170) * (mobile ? 5 : 8);
        drawGlow(x, y + wave, mobile ? 2.5 : 4, colors[index % colors.length], 0.55 * strength);
        drawGlow(x, y - wave, mobile ? 2.5 : 4, colors[(index + 2) % colors.length], 0.55 * strength);
      }
    });
  } else if(show.effect === "pixel") {
    dancers.forEach(function(dancer, index) {
      for(let pixel = 0; pixel < 8; pixel++) {
        let angle = pixel * Math.PI / 4 + phase / 700;
        let radius = (mobile ? 16 : 23) + (pixel % 2) * 7;
        context.globalAlpha = 0.68 * strength;
        context.fillStyle = color(index + pixel, 1);
        context.fillRect(dancer.x + Math.cos(angle) * radius - 2, dancer.y + Math.sin(angle) * radius - 2, mobile ? 3 : 5, mobile ? 3 : 5);
      }
    });
  } else if(show.effect === "soundwave") {
    dancers.forEach(function(dancer, index) {
      for(let wave = 0; wave < 3; wave++) {
        let progress = (show.beatProgress + wave / 3) % 1;
        context.globalAlpha = (1 - progress) * 0.52 * strength;
        context.strokeStyle = color(index + wave, 1);
        context.lineWidth = mobile ? 1 : 1.6;
        context.beginPath();
        context.arc(dancer.x, dancer.y, 8 + progress * (mobile ? 29 : 43), 0, Math.PI * 2);
        context.stroke();
      }
    });
  } else if(show.effect === "cage") {
    loop(0.72, mobile ? 1.4 : 2.2);
    dancers.forEach(function(dancer, index) {
      let jitter = Math.sin(phase / 65 + index * 3.1) * (mobile ? 3 : 5);
      link({ x: dancer.x, y: dancer.y + 20 }, { x: dancer.x + jitter, y: dancer.y - (mobile ? 42 : 62) }, index, 0.72, mobile ? 1.2 : 1.8);
    });
  } else if(show.effect === "duel") {
    for(let index = 0; index < dancers.length; index += 2) {
      let left = dancers[index];
      let right = dancers[(index + 1) % dancers.length];
      let middle = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      let size = mobile ? 16 : 24;
      link({ x: middle.x - size, y: middle.y - size }, { x: middle.x + size, y: middle.y + size }, index, 0.82, mobile ? 2.4 : 3.4);
      link({ x: middle.x + size, y: middle.y - size }, { x: middle.x - size, y: middle.y + size }, index + 2, 0.82, mobile ? 2.4 : 3.4);
    }
  } else if(show.effect === "discoball") {
    let ball = { x: centerX, y: show.crowdBounds.minY - (mobile ? 38 : 56) };
    dancers.forEach(function(dancer, index) {
      link(ball, dancer, index, 0.58, mobile ? 1 : 1.5);
    });
  } else if(show.effect === "constellation") {
    loop(0.72, mobile ? 1.2 : 1.8);
    dancers.forEach(function(dancer, index) {
      drawGlow(dancer.x, dancer.y, mobile ? 9 : 13, colors[index % colors.length], 0.64 * strength);
    });
  } else if(show.effect === "combo") {
    dancers.forEach(function(dancer, index) {
      let combo = 1 + Math.floor(show.effectProgress * 12);
      let angle = phase / 260 + index * 2.399963;
      drawGlow(dancer.x + Math.cos(angle) * 17, dancer.y + Math.sin(angle) * 12, mobile ? 8 : 12, colors[(index + combo) % colors.length], 0.62 * strength);
    });
  } else if(show.effect === "name" && typeof context.fillText === "function") {
    dancers.forEach(function(dancer, index) {
      let name = String(dancer.targetName || "STAR").toUpperCase().slice(0, 12);
      context.globalAlpha = 0.82 * strength;
      context.font = mobile ? "bold 9px Arial" : "bold 12px Arial";
      context.textAlign = "center";
      context.fillStyle = color(index, 1);
      if(typeof context.strokeText === "function") {
        context.lineWidth = 3;
        context.strokeStyle = "rgba(0,0,0,0.9)";
        context.strokeText(name, dancer.x, dancer.y - (mobile ? 25 : 32));
      }
      context.fillText(name, dancer.x, dancer.y - (mobile ? 25 : 32));
    });
  }

}

WeatherCanvas.prototype.__drawVipShow = function(context, frame, mobile) {

  let show = frame.vipShow;
  if(!show || show.amount <= 0) return;

  let centerX = show.centerX;
  let centerY = show.centerY;
  let colors = show.colors;
  let intensity = show.intensityMultiplier * show.amount;
  let now = frame.now;

  if(this.__vipShowTrailTarget !== show.targetId) {
    this.__vipShowTrailTarget = show.targetId;
    this.__vipShowTrail = [];
  }
  let previousTrailPoint = this.__vipShowTrail.length > 0
    ? this.__vipShowTrail[this.__vipShowTrail.length - 1]
    : null;
  if(!previousTrailPoint || now - previousTrailPoint.at >= 70) {
    this.__vipShowTrail.push({ x: centerX, y: centerY, at: now });
  }
  this.__vipShowTrail = this.__vipShowTrail.filter(function(point) {
    return now - point.at <= 720;
  }).slice(-8);

  function rgb(color, alpha) {
    return "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], alpha);
  }

  function drawGlow(x, y, radius, color, alpha) {
    let glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, rgb(color, alpha));
    glow.addColorStop(0.42, rgb(color, alpha * 0.55));
    glow.addColorStop(1, rgb(color, 0));
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  context.save();
  context.globalCompositeOperation = "screen";
  context.beginPath();
  context.rect(frame.clip.x, frame.clip.y, frame.clip.width, frame.clip.height);
  context.clip();

  if(show.effect !== "laser") {
    this.__drawVipSpecialEffect(context, frame, mobile, rgb, drawGlow);
    this.__drawVipCrowdEffect(context, frame, mobile, rgb, drawGlow);
    context.restore();
    return;
  }

  // A short afterglow follows the selected participant without leaving a
  // permanent screen-space smear.
  this.__vipShowTrail.forEach(function(point, index, trail) {
    let age = Math.max(0, now - point.at);
    let alpha = (1 - age / 720) * 0.20 * intensity;
    let color = colors[index % colors.length];
    drawGlow(point.x, point.y, (mobile ? 18 : 24) + index / Math.max(1, trail.length) * 8, color, alpha);
  });

  // Bass waves expand from the dancer on every configured radio beat.
  for(let wave = 0; wave < 3; wave++) {
    let progress = (show.beatProgress + wave / 3) % 1;
    let radius = 22 + progress * (mobile ? 78 : 105);
    context.globalAlpha = (1 - progress) * 0.42 * intensity;
    context.strokeStyle = rgb(colors[(wave + 1) % colors.length], 1);
    context.lineWidth = mobile ? 1.5 : 2.2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }

  // Two counter-rotating neon orbits and their beat-synchronised particles.
  for(let ring = 0; ring < 2; ring++) {
    let radius = (mobile ? 27 : 34) + ring * (mobile ? 13 : 18)
      + Math.sin(show.elapsedMs / 230 + ring * Math.PI) * 3;
    context.globalAlpha = 0.48 * intensity;
    context.strokeStyle = rgb(colors[(ring * 2) % colors.length], 1);
    context.lineWidth = ring === 0 ? 2.4 : 1.8;
    if(typeof context.setLineDash === "function") {
      context.setLineDash(ring === 0 ? [8, 5] : [4, 7]);
      context.lineDashOffset = (ring === 0 ? -1 : 1) * show.elapsedMs / 34;
    }
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    if(typeof context.setLineDash === "function") context.setLineDash([]);

    let particleCount = show.intensityName === "soft" ? 5 : (show.intensityName === "intense" ? 9 : 7);
    for(let particle = 0; particle < particleCount; particle++) {
      let direction = ring === 0 ? 1 : -1;
      let angle = direction * show.elapsedMs / (ring === 0 ? 360 : 470)
        + particle * Math.PI * 2 / particleCount;
      let x = centerX + Math.cos(angle) * radius;
      let y = centerY + Math.sin(angle) * radius * 0.72;
      let color = colors[(particle + ring * 2) % colors.length];
      context.globalAlpha = 0.78 * intensity;
      context.fillStyle = rgb(color, 1);
      context.beginPath();
      context.arc(x, y, mobile ? 2.8 : 3.8, 0, Math.PI * 2);
      context.fill();
    }
  }

  // During the tunnel and spiral phases, deterministic electric arcs bridge
  // the orbit rings without random client-to-client differences.
  if(show.stage === "tunnel" || show.stage === "spiral") {
    let arcRadius = mobile ? 52 : 70;
    let arcPoints = 9;
    context.globalAlpha = 0.62 * intensity;
    context.lineWidth = mobile ? 1.2 : 1.7;
    context.strokeStyle = rgb(colors[2 % colors.length], 1);
    context.beginPath();
    for(let point = 0; point <= arcPoints; point++) {
      let angle = point * Math.PI * 2 / arcPoints + show.elapsedMs / 780;
      let jitter = Math.sin(show.elapsedMs / 75 + point * 4.17) * (mobile ? 5 : 8);
      let x = centerX + Math.cos(angle) * (arcRadius + jitter);
      let y = centerY + Math.sin(angle) * (arcRadius + jitter) * 0.70;
      if(point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  // A small neon crown marks the selected dancer while leaving the name and
  // health bar readable. Shows deliberately render no generic title text.
  let crownY = centerY - (mobile ? 40 : 50);
  context.globalAlpha = 0.88 * intensity;
  context.fillStyle = rgb(colors[4 % colors.length], 1);
  context.beginPath();
  context.moveTo(centerX - 13, crownY + 8);
  context.lineTo(centerX - 11, crownY - 5);
  context.lineTo(centerX - 4, crownY + 1);
  context.lineTo(centerX, crownY - 9);
  context.lineTo(centerX + 5, crownY + 1);
  context.lineTo(centerX + 12, crownY - 5);
  context.lineTo(centerX + 13, crownY + 8);
  context.closePath();
  context.fill();
  // Romance uses orbiting hearts; other presets get compact neon stars.
  let decorationCount = show.intensityName === "intense" ? 8 : 5;
  for(let decoration = 0; decoration < decorationCount; decoration++) {
    let angle = decoration * Math.PI * 2 / decorationCount - show.elapsedMs / 620;
    let radius = (mobile ? 56 : 72) + Math.sin(show.elapsedMs / 310 + decoration) * 8;
    let x = centerX + Math.cos(angle) * radius;
    let y = centerY + Math.sin(angle) * radius * 0.62;
    let size = mobile ? 3 : 4;
    context.globalAlpha = 0.72 * intensity;
    context.fillStyle = rgb(colors[decoration % colors.length], 1);
    context.beginPath();
    if(show.preset === "romance") {
      context.moveTo(x, y + size * 1.7);
      context.quadraticCurveTo(x - size * 2.2, y, x - size, y - size);
      context.quadraticCurveTo(x, y - size * 2, x, y - size * 0.4);
      context.quadraticCurveTo(x, y - size * 2, x + size, y - size);
      context.quadraticCurveTo(x + size * 2.2, y, x, y + size * 1.7);
    } else {
      for(let ray = 0; ray < 8; ray++) {
        let starAngle = ray * Math.PI / 4;
        let starRadius = ray % 2 === 0 ? size * 1.8 : size * 0.65;
        let starX = x + Math.cos(starAngle) * starRadius;
        let starY = y + Math.sin(starAngle) * starRadius;
        if(ray === 0) context.moveTo(starX, starY);
        else context.lineTo(starX, starY);
      }
      context.closePath();
    }
    context.fill();
  }

  // The final convergence releases a radial burst and deterministic confetti.
  if(show.stage === "finale") {
    let finale = show.stageProgress;
    let burst = Math.max(0, (finale - 0.35) / 0.65);
    context.lineWidth = mobile ? 1.7 : 2.4;
    for(let ray = 0; ray < 18; ray++) {
      let angle = ray * Math.PI * 2 / 18 + show.elapsedMs / 1200;
      let innerRadius = 12 + burst * 22;
      let outerRadius = 24 + burst * (mobile ? 82 : 118);
      context.globalAlpha = (1 - burst * 0.45) * 0.88 * intensity;
      context.strokeStyle = rgb(colors[ray % colors.length], 1);
      context.beginPath();
      context.moveTo(
        centerX + Math.cos(angle) * innerRadius,
        centerY + Math.sin(angle) * innerRadius * 0.72
      );
      context.lineTo(
        centerX + Math.cos(angle) * outerRadius,
        centerY + Math.sin(angle) * outerRadius * 0.72
      );
      context.stroke();
    }
    for(let confetti = 0; confetti < 24; confetti++) {
      let angle = confetti * 2.399963 + show.elapsedMs / 1600;
      let distance = burst * (35 + (confetti % 7) * 12);
      let x = centerX + Math.cos(angle) * distance;
      let y = centerY + Math.sin(angle) * distance * 0.72 + burst * burst * 16;
      context.globalAlpha = (1 - burst * 0.35) * 0.85 * intensity;
      context.fillStyle = rgb(colors[confetti % colors.length], 1);
      context.fillRect(x - 2, y - 2, mobile ? 3 : 4, mobile ? 3 : 4);
    }
  }

  this.__drawVipCrowdEffect(context, frame, mobile, rgb, drawGlow);

  context.restore();

}

WeatherCanvas.prototype.__drawPartyFlowOverlay = function(context, flow, mobile) {
  if(!flow) return;
  let seconds = Math.max(0, Math.ceil(flow.remainingMs / 1000));
  let pulse = 0.72 + 0.28 * Math.sin(performance.now() / 145);
  context.save();
  context.globalCompositeOperation = "screen";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowBlur = mobile ? 8 : 13;
  context.shadowColor = flow.phase === "roulette" ? "#ffd34d" : "#65ddff";

  if(flow.phase === "lobby") {
    context.fillStyle = "rgba(101, 221, 255, %s)".format(0.72 + pulse * 0.20);
    context.font = "700 %spx Arial".format(mobile ? 13 : 17);
    context.fillText("LASER ROULETTE", flow.centerX, flow.centerY - (mobile ? 26 : 34));
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.font = "700 %spx Arial".format(mobile ? 11 : 14);
    context.fillText(
      flow.waitingForPlayers ? "WAITING FOR PLAYERS" : "STARTS IN",
      flow.centerX,
      flow.centerY - (mobile ? 7 : 10)
    );
    context.fillStyle = seconds <= 10 ? "#ff6577" : "#ffd34d";
    context.font = "800 %spx Arial".format(seconds <= 10 ? (mobile ? 40 : 58) : (mobile ? 24 : 34));
    context.fillText(
      flow.waitingForPlayers ? "2+" : (seconds <= 10 ? String(seconds) : "0:" + String(seconds).padStart(2, "0")),
      flow.centerX,
      flow.centerY + (mobile ? 24 : 31)
    );
    if(flow.bonus) {
      let fade = Math.max(0, 1 - flow.bonus.elapsedMs / 2400);
      context.globalAlpha = fade;
      context.fillStyle = "#52e0a1";
      context.font = "800 %spx Arial".format(mobile ? 16 : 21);
      context.fillText("+%ss".format(flow.bonus.addedSeconds), flow.bonus.x, flow.bonus.y - 25 - flow.bonus.elapsedMs / 45);
    }
  } else {
    context.fillStyle = "rgba(255, 211, 77, %s)".format(0.76 + pulse * 0.22);
    context.font = "800 %spx Arial".format(mobile ? 15 : 20);
    context.fillText(
      flow.winnerLocked ? "SELECTED!" : "LASER ROULETTE",
      flow.centerX,
      flow.centerY - (mobile ? 52 : 70)
    );
  }
  context.restore();
};

WeatherCanvas.prototype.drawDiscoLights = function() {

  let frame = this.__getDiscoLightFrame();
  if(!frame) {
    return;
  }

  let context = this.screen.context;
  let intensity = frame.intensity * frame.pulse;
  if(frame.vipShow) intensity *= frame.vipShow.intensityMultiplier;
  let mobile = gameClient.touch && gameClient.touch.isMobileMode;

  if(frame.spotlightsEnabled) {
    context.save();
    context.globalCompositeOperation = "screen";
    context.beginPath();
    context.rect(frame.clip.x, frame.clip.y, frame.clip.width, frame.clip.height);
    context.clip();

    frame.lights.forEach(function(light) {
    let dx = light.targetX - light.fixtureX;
    let dy = light.targetY - light.fixtureY;
    let length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    let directionX = dx / length;
    let directionY = dy / length;
    let perpendicularX = -dy / length;
    let perpendicularY = dx / length;
    let endWidth = (mobile ? 34 : 48) + 24 * frame.intensity;
    let color = light.color;
    let beamVisibility = frame.focusActive ? frame.focusStrength : 1;
    let beam = context.createLinearGradient(light.fixtureX, light.fixtureY, light.targetX, light.targetY);
    beam.addColorStop(0, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], 0.035 * intensity * beamVisibility));
    beam.addColorStop(0.55, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], 0.065 * intensity * beamVisibility));
    beam.addColorStop(1, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], 0.16 * intensity * beamVisibility));

    // A widening translucent cone makes the beam visible, particularly in
    // fog and pipe smoke, while the LightCanvas pool does the real lighting.
    context.beginPath();
    context.moveTo(light.fixtureX - perpendicularX * 3, light.fixtureY - perpendicularY * 3);
    context.lineTo(light.targetX - perpendicularX * endWidth, light.targetY - perpendicularY * endWidth);
    context.quadraticCurveTo(
      light.targetX + directionX * endWidth * 0.52,
      light.targetY + directionY * endWidth * 0.52,
      light.targetX + perpendicularX * endWidth,
      light.targetY + perpendicularY * endWidth
    );
    context.lineTo(light.fixtureX + perpendicularX * 3, light.fixtureY + perpendicularY * 3);
    context.closePath();
    context.fillStyle = beam;
    context.fill();

    let haloRadius = mobile ? 100 : 128;
    let haloAlpha = Math.min(0.92, 0.52 * intensity * frame.focusStrength);
    let halo = context.createRadialGradient(0, 0, 0, 0, 0, haloRadius);
    halo.addColorStop(0, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], haloAlpha));
    halo.addColorStop(0.38, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], haloAlpha * 0.58));
    halo.addColorStop(1, "rgba(%s, %s, %s, 0)".format(color[0], color[1], color[2]));
    context.globalAlpha = 1;

    context.save();
    context.translate(light.targetX, light.targetY);
    context.scale(1, 0.68);
    context.fillStyle = halo;
    context.fillRect(-haloRadius, -haloRadius, haloRadius * 2, haloRadius * 2);
    context.restore();
    });

    context.restore();
  }

  this.__drawPartyFlowOverlay(context, frame.partyFlow, mobile);

  // Preserve the original three wall-mounted laser fans. These are separate
  // from the four illuminating spotlights and retain their former positions,
  // sweep and three-ray pattern.
  if(!frame.legacyLasersEnabled) {
    if(frame.vipShow) {
      this.__drawVipShow(context, frame, mobile);
    }
    return;
  }

  let legacyColors = frame.vipShow
    ? frame.vipShow.laserColors
    : [[42, 120, 255], [232, 48, 255], [35, 255, 194]];
  let legacyFixtures = [
    [0, -frame.radius],
    [-frame.radius, frame.radius * 0.5],
    [frame.radius, frame.radius * 0.5]
  ];
  let legacyPulse = Number.isFinite(frame.beatPulse)
    ? 0.55 + 0.45 * frame.beatPulse
    : frame.beatBpm > 0
      ? 0.55 + 0.45 * Math.max(0, Math.sin(frame.now * Math.PI * 2 * frame.beatBpm / 60000))
      : 0.72 + 0.28 * Math.sin(frame.now / 260);
  let beamLength = Math.max(this.screen.canvas.width, this.screen.canvas.height) * 1.5;
  let laserFocusAmount = frame.laserFocusAmount || 0;
  let laserShow = frame.laserShow;
  let chairLasers = frame.chairLasers;
  let partyFlow = frame.partyFlow;
  let laserControlAmount = partyFlow
    ? partyFlow.amount
    : (chairLasers ? chairLasers.amount : (laserShow ? laserShow.amount : laserFocusAmount));
  let focusedLaserRadius = frame.laserFocusRadius;
  let laserOrbitAngle = -Math.PI * 0.5 + frame.now * Math.PI * 2 / 3200;
  let laserBrightness = laserShow
    ? 1.08 + 0.22 * Math.max(0, Math.sin(frame.now / 180))
    : partyFlow
      ? 1.16 + 0.26 * Math.max(0, Math.sin(frame.now / 135))
    : chairLasers
      ? 1.12 + 0.20 * Math.max(0, Math.sin(frame.now / 150))
    : frame.vipShow
      ? 1.16 + 0.30 * frame.vipShow.beatStrength
      : 1 + (frame.focusStrength - 1) * laserFocusAmount;
  let laserAlpha = Math.min(1, 0.72 * frame.intensity * legacyPulse * laserBrightness);
  let focusedEndpoints = [];

  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = laserAlpha;
  context.lineWidth = 3;
  legacyFixtures.forEach(function(fixture, index) {
    let color = legacyColors[index];
    let x = frame.centerX + fixture[0] * 32;
    let y = frame.centerY + fixture[1] * 32;
    let inwardAngle = Math.atan2(-fixture[1], -fixture[0]);
    let sweep = Math.sin(frame.now / 760 + index * 1.7) * 0.72;
    let normalAngle = inwardAngle + sweep;
    let hasFocusCenter = Number.isFinite(frame.laserFocusCenterX) && Number.isFinite(frame.laserFocusCenterY);

    context.strokeStyle = "rgb(%s, %s, %s)".format(color[0], color[1], color[2]);
    for(let beam = -1; beam <= 1; beam++) {
      let beamIndex = index * 3 + beam + 1;
      let normalBeamAngle = normalAngle + beam * 0.24;
      let focusTargetAngle = laserOrbitAngle + beamIndex * Math.PI * 2 / 9;
      let chairEndpoint = chairLasers && chairLasers.targets[beamIndex];
      let showEndpoint = laserShow && laserShow.targets[beamIndex];
      let partyEndpoint = partyFlow && partyFlow.targets[beamIndex];
      let vipEndpoint = frame.vipLaserTargets && frame.vipLaserTargets[beamIndex];
      let hasControlledTarget = Boolean(partyEndpoint) || Boolean(chairEndpoint) || Boolean(showEndpoint) || Boolean(vipEndpoint) || hasFocusCenter;
      let focusedTargetX = partyEndpoint
        ? partyEndpoint.x
        : chairEndpoint
        ? chairEndpoint.x
        : showEndpoint
        ? showEndpoint.x
        : vipEndpoint
          ? vipEndpoint.x
        : hasFocusCenter
          ? frame.laserFocusCenterX + Math.cos(focusTargetAngle) * focusedLaserRadius
        : x + Math.cos(normalBeamAngle) * beamLength;
      let focusedTargetY = partyEndpoint
        ? partyEndpoint.y
        : chairEndpoint
        ? chairEndpoint.y
        : showEndpoint
        ? showEndpoint.y
        : vipEndpoint
          ? vipEndpoint.y
        : hasFocusCenter
          ? frame.laserFocusCenterY + Math.sin(focusTargetAngle) * focusedLaserRadius
        : y + Math.sin(normalBeamAngle) * beamLength;
      let focusedAngle = hasControlledTarget
        ? Math.atan2(focusedTargetY - y, focusedTargetX - x)
        : normalBeamAngle;
      let focusedBeamLength = hasControlledTarget
        ? Math.hypot(focusedTargetX - x, focusedTargetY - y)
        : beamLength;
      let angleDifference = Math.atan2(
        Math.sin(focusedAngle - normalBeamAngle),
        Math.cos(focusedAngle - normalBeamAngle)
      );
      let angle = normalBeamAngle + angleDifference * laserControlAmount;
      let visibleBeamLength = beamLength + (focusedBeamLength - beamLength) * laserControlAmount;
      let endpointX = x + Math.cos(angle) * visibleBeamLength;
      let endpointY = y + Math.sin(angle) * visibleBeamLength;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(endpointX, endpointY);
      context.stroke();
      if(laserControlAmount > 0.01) {
        focusedEndpoints.push({ x: endpointX, y: endpointY, color: color });
      }
    }
  });

  context.globalAlpha = Math.min(1, laserAlpha * 1.45) * laserControlAmount;
  focusedEndpoints.forEach(function(endpoint) {
    let color = endpoint.color;
    let dot = context.createRadialGradient(endpoint.x, endpoint.y, 0, endpoint.x, endpoint.y, 4);
    dot.addColorStop(0, "rgba(255, 255, 255, 1)");
    dot.addColorStop(0.42, "rgba(%s, %s, %s, 1)".format(color[0], color[1], color[2]));
    dot.addColorStop(1, "rgba(%s, %s, %s, 0)".format(color[0], color[1], color[2]));
    context.fillStyle = dot;
    context.beginPath();
    context.arc(endpoint.x, endpoint.y, 4, 0, Math.PI * 2);
    context.fill();
  });

  let controlledTrails = partyFlow || chairLasers || laserShow;
  if(controlledTrails && controlledTrails.trailLines.length > 0) {
    context.lineWidth = 2.4;
    controlledTrails.trailLines.forEach(function(line) {
      let color = legacyColors[line.colorIndex % legacyColors.length];
      context.globalAlpha = (partyFlow ? partyFlow.amount : (chairLasers ? 1 : laserShow.amount)) * line.alpha * 0.72;
      context.strokeStyle = "rgb(%s, %s, %s)".format(color[0], color[1], color[2]);
      context.beginPath();
      context.moveTo(line.x1, line.y1);
      context.lineTo(line.x2, line.y2);
      context.stroke();
    });
  }
  context.restore();

  if(frame.vipShow) {
    this.__drawVipShow(context, frame, mobile);
  }

}

WeatherCanvas.prototype.drawRain = function() {

  /*
   * Draw a lightweight, deterministic layer of falling raindrops. The old
   * weather code only enabled rain ambience, so the option had sound but no
   * visible precipitation.
   */

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height;
  // Extend precipitation one extra tile below the viewport. This keeps the
  // last visible southern SQM covered while the camera scrolls.
  let rainHeight = height + 32;
  let frame = gameClient.renderer.debugger.__nFrames;
  let count = Math.max(45, Math.floor((width * rainHeight) / 7000));

  context.save();
  context.globalAlpha = 0.68;
  context.strokeStyle = "#b9dcff";
  context.lineWidth = 1.5;
  context.beginPath();

  for(let index = 0; index < count; index++) {
    let x = ((index * 83 - frame * 1.5) % (width + 12) + (width + 12)) % (width + 12) - 6;
    let impactY = rainHeight - 18 - (index * 29) % Math.max(32, Math.floor(rainHeight * 0.42));
    let y = (index * 47 + frame * 4) % (impactY + 22) - 12;

    if(y < impactY - 4) {
      // A slightly longer, thicker streak makes the rain readable on both
      // bright ground and dark interiors.
      context.moveTo(x, y);
      context.lineTo(x - 3, y + 15);
    } else {
      // Short ripple plus two upward droplets: a cheap splash illusion when
      // a raindrop reaches the ground/roof plane.
      context.moveTo(x - 5, impactY);
      context.quadraticCurveTo(x, impactY + 3, x + 5, impactY);
      context.moveTo(x - 1, impactY);
      context.lineTo(x - 4, impactY - 4);
      context.moveTo(x + 1, impactY);
      context.lineTo(x + 4, impactY - 3);
    }
  }

  context.stroke();
  context.restore();

}

WeatherCanvas.prototype.drawSnow = function() {

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height + 32;
  let frame = gameClient.renderer.debugger.__nFrames;
  let count = Math.max(35, Math.floor((width * height) / 10500));

  context.save();
  context.globalAlpha = 0.9;
  context.fillStyle = "#f4fbff";

  for(let index = 0; index < count; index++) {
    // Each flake drifts gently and falls slowly towards its own visible
    // ground plane, which makes the snow feel softer than square particles.
    let baseX = ((index * 101 - frame * 0.28) % (width + 12) + (width + 12)) % (width + 12) - 6;
    let x = baseX + Math.sin((frame + index * 23) * 0.035) * 3;
    let impactY = height - 16 - (index * 31) % Math.max(32, Math.floor(height * 0.4));
    let y = (index * 59 + frame * 0.7) % (impactY + 18) - 8;
    let size = index % 5 === 0 ? 2 : 1;

    if(y < impactY - 3) {
      // Pixel snowflake: centre, horizontal arms and vertical arms.
      context.fillRect(x - size, y, size * 3, 1);
      context.fillRect(x, y - size, 1, size * 3);
      context.fillRect(x, y, size + 1, size + 1);
    } else {
      // A tiny soft pile and scattered grains when a flake reaches ground.
      context.globalAlpha = 0.55;
      context.fillRect(x - 4, impactY, 9, 1);
      context.fillRect(x - 2, impactY - 1, 2, 1);
      context.fillRect(x + 3, impactY - 2, 1, 1);
      context.globalAlpha = 0.9;
    }
  }

  context.restore();

}

WeatherCanvas.prototype.drawSandstorm = function() {

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height + 32;
  let frame = gameClient.renderer.debugger.__nFrames;
  let count = Math.max(45, Math.floor((width * height) / 7200));

  context.save();
  context.globalAlpha = 0.42;
  context.strokeStyle = "#d8a34b";
  context.lineWidth = 1.5;
  context.beginPath();

  for(let index = 0; index < count; index++) {
    let x = ((index * 73 - frame * 5.5) % (width + 22) + (width + 22)) % (width + 22) - 11;
    let y = (index * 41 + frame * 0.55) % (height + 10) - 5;
    context.moveTo(x, y);
    context.lineTo(x - 16, y + 2);
  }

  context.stroke();
  context.restore();

}

WeatherCanvas.prototype.drawAsh = function() {

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height + 32;
  let frame = gameClient.renderer.debugger.__nFrames;
  let count = Math.max(35, Math.floor((width * height) / 9500));

  context.save();
  context.globalAlpha = 0.58;
  context.fillStyle = "#787878";

  for(let index = 0; index < count; index++) {
    let x = ((index * 89 + frame * 0.7) % (width + 10) + (width + 10)) % (width + 10) - 5;
    let y = (index * 53 + frame * 1.45) % (height + 8) - 4;
    context.fillRect(x, y, index % 4 === 0 ? 3 : 2, 2);
  }

  context.restore();

}

WeatherCanvas.prototype.drawEmbers = function() {

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height + 32;
  let frame = gameClient.renderer.debugger.__nFrames;
  let count = Math.max(28, Math.floor((width * height) / 13000));

  context.save();
  context.globalAlpha = 0.9;
  context.fillStyle = "#ffae32";

  for(let index = 0; index < count; index++) {
    let x = ((index * 97 + frame * 0.9) % (width + 10) + (width + 10)) % (width + 10) - 5;
    let y = height - ((index * 67 + frame * 2.6) % (height + 12));
    context.fillRect(x, y, 2, 3);
    context.fillStyle = "#ffe07a";
    context.fillRect(x, y + 1, 1, 1);
    context.fillStyle = "#ffae32";
  }

  context.restore();

}

WeatherCanvas.prototype.drawWeather = function() {

  /*
   * Function Canvas.drawWeather
   * Draws the weather (e.g., clouds) to the gamescreen canvas
   */

  // Hardcoded to clouds
  let pattern = this.cloudPattern;

  // Underground has no weather
  if(!gameClient.player.isUnderground()) {
    this.handleThunder();
    if(this.isRaining()) {
      this.drawRain();
    }

    if(this.__weatherType === "snow") {
      this.drawSnow();
    } else if(this.__weatherType === "sandstorm") {
      this.drawSandstorm();
    } else if(this.__weatherType === "ash") {
      this.drawAsh();
    } else if(this.__weatherType === "embers") {
      this.drawEmbers();
    }
  }

  if(this.__counter > 0) {
    this.__ambientAlpha = this.__ambientAlphaTarget + ((this.__counter - 1) / this.__steps) * (this.__ambientAlphaStart - this.__ambientAlphaTarget);
    this.__counter--;
  }

  // No ambient no weather
  if(this.__ambientAlpha === 0) {
    return;
  }

  this.screen.context.globalAlpha = this.__ambientAlpha;

  let off = gameClient.player.getMoveOffset();

  let selfx = 0.15 * gameClient.renderer.debugger.__nFrames + 256 * Math.cos(0.002 * gameClient.renderer.debugger.__nFrames);
  let selfy = 0.15 * gameClient.renderer.debugger.__nFrames + 256 * Math.sin(0.002 * gameClient.renderer.debugger.__nFrames);

  // Add self movement of the texture to the static world position
  let x = (32 * (gameClient.player.getPosition().x - off.x) | 0) + selfx;
  let y = (32 * (gameClient.player.getPosition().y - off.y) | 0) + selfy;
  
  this.drawPattern(pattern, x, y);

  let selfx2 = -0.15 * gameClient.renderer.debugger.__nFrames + 256;
  let selfy2 = -0.15 * gameClient.renderer.debugger.__nFrames + 256;

  // Add self movement of the texture to the static world position
  let x2 = (32 * (gameClient.player.getPosition().x - off.x) | 0) + selfx2;
  let y2 = (32 * (gameClient.player.getPosition().y - off.y) | 0) + selfy2;

  this.drawPattern(pattern, x2, y2);

  // Reset global alpha
  this.screen.context.globalAlpha = 1;

}

WeatherCanvas.prototype.drawPattern = function(pattern, x, y) {

  /*
   * Function Canvas.drawPattern
   * Draws a pattern a tilealble pattern to the screen  (x, y) are arbitarry
   */

  // Clamp
  x = Math.max(0, x) % this.screen.canvas.width;
  y = Math.max(0, y) % this.screen.canvas.height;

  x = Math.round(x);
  y = Math.round(y);
  // Draw the image four times to make sure the seamless texture overlaps the entire screen: 
  // (top left corner, right slice, bottom slice, right-bottom corner
  //
  // +----+
  // |  + +--+
  // +--+-+  | y
  //    +----+
  //      x

  // Top left corner
  this.screen.context.drawImage(
    pattern,
    x, y,
    this.screen.canvas.width - x,
    this.screen.canvas.height - y,
    0, 0,
    this.screen.canvas.width - x,
    this.screen.canvas.height - y
  );

  // Bottom slice
  this.screen.context.drawImage(
    pattern,
    0, y,
    x, this.screen.canvas.height - y,
    this.screen.canvas.width - x, 0,
    x, this.screen.canvas.height - y
  );

  // Right slice
  this.screen.context.drawImage(
    pattern,
    x, 0,
    this.screen.canvas.width - x, y,
    0, this.screen.canvas.height - y,
    this.screen.canvas.width - x, y
  );

  // Bottom right corner
  this.screen.context.drawImage(
    pattern,
    0, 0,
    x, y,
    this.screen.canvas.width - x, this.screen.canvas.height - y,
    x, y
  );

}
