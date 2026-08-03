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
  this.__discoLights = { spotlightsEnabled: false, legacyLasersEnabled: false, intensity: 60, spotlightSpeed: 100, beatBpm: 0, radius: 0, center: null, focus: null, laserShow: null };
  this.__discoLightFrame = null;
  this.__spotlightFocusVisual = null;
  this.__spotlightFocusTransition = null;
  this.__laserShowPhaseTransition = null;
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

WeatherCanvas.prototype.setDiscoLights = function(spotlightsEnabled, legacyLasersEnabled, intensity, spotlightSpeed, beatBpm, radius, center, focus, laserShow) {

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
      targetPosition: focus.targetPosition,
      elapsedMs: Math.max(0, Number(focus.elapsedMs) || 0),
      persistent: focus.persistent === true,
      durationMs: focus.persistent === true ? null : focus.durationMs,
      flashDurationMs: Math.max(0, Number(focus.flashDurationMs) || 0),
      flashCount: Math.max(0, Number(focus.flashCount) || 0),
      includeLasers: focus.includeLasers === true,
      receivedAt: performance.now()
    } : null,
    laserShow: validLaserShow ? {
      mode: laserShow.mode,
      text: laserShow.text.slice(0, 12),
      elapsedMs: Math.max(0, Number(laserShow.elapsedMs) || 0),
      durationMs: laserShow.durationMs,
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

WeatherCanvas.prototype.__getDiscoLightFrame = function() {

  let disco = this.__discoLights;
  let now = performance.now();
  let show = disco.laserShow;
  let showElapsed = show ? show.elapsedMs + Math.max(0, now - show.receivedAt) : 0;
  let showActive = show != null && showElapsed < show.durationMs;
  if((!disco.spotlightsEnabled && !disco.legacyLasersEnabled && !showActive) || !disco.center || disco.radius <= 0) {
    return null;
  }

  let frameNumber = gameClient.renderer.debugger.__nFrames;
  if(this.__discoLightFrame && this.__discoLightFrame.frameNumber === frameNumber) {
    return this.__discoLightFrame;
  }

  let pulse = disco.beatBpm > 0
    ? 0.62 + 0.38 * Math.max(0, Math.sin(now * Math.PI * 2 * disco.beatBpm / 60000))
    : 0.76 + 0.24 * Math.sin(now / 260);
  let intensity = disco.intensity / 100;
  let radius = Math.max(2, disco.radius);
  let center = new Position(disco.center.x, disco.center.y, disco.center.z);
  let centerScreen = gameClient.renderer.getStaticScreenPosition(center);
  let centerX = (centerScreen.x + 0.5) * 32;
  let centerY = (centerScreen.y + 0.5) * 32;
  let laserShowFrame = showActive
    ? this.__getLaserShowFrame(show, centerX, centerY, radius, now)
    : null;
  let focus = disco.focus;
  let focusElapsed = focus ? focus.elapsedMs + Math.max(0, now - focus.receivedAt) : 0;
  let focusActive = !showActive && focus !== null && (focus.persistent || focusElapsed < focus.durationMs);
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
  let colors = [
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
  let focusOrbitAngle = -Math.PI * 0.5 + now * Math.PI * 2 / 4500;
  let focusOrbitRadius = 22;
  let focusTransition = this.__spotlightFocusTransition;
  let transitionProgress = focusTransition
    ? Math.min(1, Math.max(0, (now - focusTransition.startedAt) / 1300))
    : 1;
  let transitionEase = 1 - Math.pow(1 - transitionProgress, 3);
  let laserFocusAmount = focusTransition
    ? focusTransition.laserStartAmount
      + (focusTransition.laserEndAmount - focusTransition.laserStartAmount) * transitionEase
    : (focusActive && focus.includeLasers ? 1 : 0);
  let laserFocusCenter = focusScreen || (focusTransition ? focusTransition.focusCenter : null);
  if(focusTransition && focusTransition.focusCenter && focusScreen) {
    laserFocusCenter = {
      x: focusTransition.focusCenter.x + (focusScreen.x - focusTransition.focusCenter.x) * transitionEase,
      y: focusTransition.focusCenter.y + (focusScreen.y - focusTransition.focusCenter.y) * transitionEase
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
    let desiredTargetX = showTarget
      ? normalTargetX + (showTarget.x - normalTargetX) * laserShowFrame.amount
      : focusScreen
        ? focusScreen.x + Math.cos(orbitAngle) * focusOrbitRadius
        : normalTargetX;
    let desiredTargetY = showTarget
      ? normalTargetY + (showTarget.y - normalTargetY) * laserShowFrame.amount
      : focusScreen
        ? focusScreen.y + Math.sin(orbitAngle) * focusOrbitRadius
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
    beatBpm: disco.beatBpm,
    pulse: pulse,
    intensity: intensity,
    spotlightsEnabled: disco.spotlightsEnabled || showActive,
    legacyLasersEnabled: disco.legacyLasersEnabled || showActive,
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

WeatherCanvas.prototype.drawDiscoLights = function() {

  let frame = this.__getDiscoLightFrame();
  if(!frame) {
    return;
  }

  let context = this.screen.context;
  let intensity = frame.intensity * frame.pulse;
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

  // Preserve the original three wall-mounted laser fans. These are separate
  // from the four illuminating spotlights and retain their former positions,
  // sweep and three-ray pattern.
  if(!frame.legacyLasersEnabled) {
    return;
  }

  let legacyColors = [[42, 120, 255], [232, 48, 255], [35, 255, 194]];
  let legacyFixtures = [
    [0, -frame.radius],
    [-frame.radius, frame.radius * 0.5],
    [frame.radius, frame.radius * 0.5]
  ];
  let legacyPulse = frame.beatBpm > 0
    ? 0.55 + 0.45 * Math.max(0, Math.sin(frame.now * Math.PI * 2 * frame.beatBpm / 60000))
    : 0.72 + 0.28 * Math.sin(frame.now / 260);
  let beamLength = Math.max(this.screen.canvas.width, this.screen.canvas.height) * 1.5;
  let laserFocusAmount = frame.laserFocusAmount || 0;
  let laserShow = frame.laserShow;
  let laserControlAmount = laserShow ? laserShow.amount : laserFocusAmount;
  let focusedLaserRadius = frame.laserFocusRadius;
  let laserOrbitAngle = -Math.PI * 0.5 + frame.now * Math.PI * 2 / 3200;
  let laserBrightness = laserShow
    ? 1.08 + 0.22 * Math.max(0, Math.sin(frame.now / 180))
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
      let showEndpoint = laserShow && laserShow.targets[beamIndex];
      let hasControlledTarget = Boolean(showEndpoint) || hasFocusCenter;
      let focusedTargetX = showEndpoint
        ? showEndpoint.x
        : hasFocusCenter
          ? frame.laserFocusCenterX + Math.cos(focusTargetAngle) * focusedLaserRadius
        : x + Math.cos(normalBeamAngle) * beamLength;
      let focusedTargetY = showEndpoint
        ? showEndpoint.y
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

  if(laserShow && laserShow.trailLines.length > 0) {
    context.lineWidth = 2.4;
    laserShow.trailLines.forEach(function(line) {
      let color = legacyColors[line.colorIndex % legacyColors.length];
      context.globalAlpha = laserShow.amount * line.alpha * 0.72;
      context.strokeStyle = "rgb(%s, %s, %s)".format(color[0], color[1], color[2]);
      context.beginPath();
      context.moveTo(line.x1, line.y1);
      context.lineTo(line.x2, line.y2);
      context.stroke();
    });
  }
  context.restore();

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
