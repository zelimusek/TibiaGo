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
  this.__discoLights = { spotlightsEnabled: false, legacyLasersEnabled: false, intensity: 60, spotlightSpeed: 100, beatBpm: 0, radius: 0, center: null, focus: null };
  this.__discoLightFrame = null;
  this.__spotlightFocusVisual = null;
  this.__spotlightFocusTransition = null;
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

WeatherCanvas.prototype.setDiscoLights = function(spotlightsEnabled, legacyLasersEnabled, intensity, spotlightSpeed, beatBpm, radius, center, focus) {

  let validFocus = focus
    && Number.isInteger(focus.targetId)
    && focus.targetPosition
    && (focus.persistent === true || (Number.isFinite(focus.durationMs) && focus.durationMs > 0));
  let previousFocus = this.__discoLights.focus;
  let previousTargetId = previousFocus ? previousFocus.targetId : null;
  let nextTargetId = validFocus ? focus.targetId : null;
  let previousLaserFocus = previousFocus !== null && previousFocus.includeLasers === true;
  let nextLaserFocus = validFocus === true && focus.includeLasers === true;

  if((previousTargetId !== nextTargetId || previousLaserFocus !== nextLaserFocus) && this.__discoLightFrame && this.__discoLightFrame.lights) {
    this.__spotlightFocusTransition = {
      startedAt: performance.now(),
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
    } : null
  };
  this.__discoLightFrame = null;

}

WeatherCanvas.prototype.__getDiscoLightFrame = function() {

  let disco = this.__discoLights;
  if((!disco.spotlightsEnabled && !disco.legacyLasersEnabled) || !disco.center || disco.radius <= 0) {
    return null;
  }

  let frameNumber = gameClient.renderer.debugger.__nFrames;
  if(this.__discoLightFrame && this.__discoLightFrame.frameNumber === frameNumber) {
    return this.__discoLightFrame;
  }

  let now = performance.now();
  let pulse = disco.beatBpm > 0
    ? 0.62 + 0.38 * Math.max(0, Math.sin(now * Math.PI * 2 * disco.beatBpm / 60000))
    : 0.76 + 0.24 * Math.sin(now / 260);
  let intensity = disco.intensity / 100;
  let radius = Math.max(2, disco.radius);
  let center = new Position(disco.center.x, disco.center.y, disco.center.z);
  let centerScreen = gameClient.renderer.getStaticScreenPosition(center);
  let centerX = (centerScreen.x + 0.5) * 32;
  let centerY = (centerScreen.y + 0.5) * 32;
  let focus = disco.focus;
  let focusElapsed = focus ? focus.elapsedMs + Math.max(0, now - focus.receivedAt) : 0;
  let focusActive = focus !== null && (focus.persistent || focusElapsed < focus.durationMs);
  let focusFlashing = focusActive && focusElapsed < focus.flashDurationMs && focus.flashCount > 0;
  let focusFlashOn = focusFlashing
    && focusElapsed % (focus.flashDurationMs / focus.flashCount) < Math.min(360, focus.flashDurationMs / focus.flashCount * 0.38);
  let focusStrength = focusFlashing ? (focusFlashOn ? 1.45 : 0.20) : 1;
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

    if(!this.__spotlightFocusVisual || this.__spotlightFocusVisual.targetId !== focus.targetId) {
      this.__spotlightFocusVisual = {
        targetId: focus.targetId,
        x: desiredX,
        y: desiredY,
        updatedAt: now
      };
    } else {
      let deltaMs = Math.max(0, Math.min(100, now - this.__spotlightFocusVisual.updatedAt));
      let followFactor = 1 - Math.exp(-deltaMs / 180);
      this.__spotlightFocusVisual.x += (desiredX - this.__spotlightFocusVisual.x) * followFactor;
      this.__spotlightFocusVisual.y += (desiredY - this.__spotlightFocusVisual.y) * followFactor;
      this.__spotlightFocusVisual.updatedAt = now;
    }

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
    let desiredTargetX = focusScreen
      ? focusScreen.x + Math.cos(orbitAngle) * focusOrbitRadius
      : (targetScreen.x + 0.5) * 32;
    let desiredTargetY = focusScreen
      ? focusScreen.y + Math.sin(orbitAngle) * focusOrbitRadius
      : (targetScreen.y + 0.5) * 32;
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
    spotlightsEnabled: disco.spotlightsEnabled,
    legacyLasersEnabled: disco.legacyLasersEnabled,
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
    laserFocusRadius: focusFlashing ? (focusFlashOn ? 10 : 38) : 28,
    laserFocusSpread: focusFlashing ? (focusFlashOn ? 0.07 : 0.18) : 0.11,
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
    if(frame.focusActive) {
      context.quadraticCurveTo(
        light.targetX + directionX * endWidth * 0.52,
        light.targetY + directionY * endWidth * 0.52,
        light.targetX + perpendicularX * endWidth,
        light.targetY + perpendicularY * endWidth
      );
    } else {
      context.lineTo(light.targetX + perpendicularX * endWidth, light.targetY + perpendicularY * endWidth);
    }
    context.lineTo(light.fixtureX + perpendicularX * 3, light.fixtureY + perpendicularY * 3);
    context.closePath();
    context.fillStyle = beam;
    context.fill();

    let haloRadius = mobile ? 100 : 128;
    let haloAlpha = Math.min(0.92, 0.52 * intensity * frame.focusStrength);
    let halo = frame.focusActive
      ? context.createRadialGradient(0, 0, 0, 0, 0, haloRadius)
      : context.createRadialGradient(light.targetX, light.targetY, 0, light.targetX, light.targetY, haloRadius);
    halo.addColorStop(0, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], haloAlpha));
    halo.addColorStop(0.38, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], haloAlpha * 0.58));
    halo.addColorStop(1, "rgba(%s, %s, %s, 0)".format(color[0], color[1], color[2]));
    context.globalAlpha = 1;

    if(frame.focusActive) {
      context.save();
      context.translate(light.targetX, light.targetY);
      context.scale(1, 0.68);
      context.fillStyle = halo;
      context.fillRect(-haloRadius, -haloRadius, haloRadius * 2, haloRadius * 2);
      context.restore();
    } else {
      context.fillStyle = halo;
      context.fillRect(light.targetX - haloRadius, light.targetY - haloRadius, haloRadius * 2, haloRadius * 2);
    }
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
  let focusedLaserRadius = frame.laserFocusRadius;
  let focusedLaserSpread = frame.laserFocusSpread;
  let laserOrbitAngle = -Math.PI * 0.5 + frame.now * Math.PI * 2 / 3200;
  let laserBrightness = 1 + (frame.focusStrength - 1) * laserFocusAmount;

  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = Math.min(1, 0.72 * frame.intensity * legacyPulse * laserBrightness);
  context.lineWidth = 3;
  legacyFixtures.forEach(function(fixture, index) {
    let color = legacyColors[index];
    let x = frame.centerX + fixture[0] * 32;
    let y = frame.centerY + fixture[1] * 32;
    let inwardAngle = Math.atan2(-fixture[1], -fixture[0]);
    let sweep = Math.sin(frame.now / 760 + index * 1.7) * 0.72;
    let normalAngle = inwardAngle + sweep;
    let focusTargetAngle = laserOrbitAngle + index * Math.PI * 2 / 3;
    let hasFocusCenter = Number.isFinite(frame.laserFocusCenterX) && Number.isFinite(frame.laserFocusCenterY);
    let focusedTargetX = hasFocusCenter
      ? frame.laserFocusCenterX + Math.cos(focusTargetAngle) * focusedLaserRadius
      : x + Math.cos(normalAngle) * beamLength;
    let focusedTargetY = hasFocusCenter
      ? frame.laserFocusCenterY + Math.sin(focusTargetAngle) * focusedLaserRadius
      : y + Math.sin(normalAngle) * beamLength;
    let focusedAngle = hasFocusCenter
      ? Math.atan2(focusedTargetY - y, focusedTargetX - x)
      : normalAngle;
    let focusedBeamLength = hasFocusCenter
      ? Math.hypot(focusedTargetX - x, focusedTargetY - y)
      : beamLength;
    let angleDifference = Math.atan2(
      Math.sin(focusedAngle - normalAngle),
      Math.cos(focusedAngle - normalAngle)
    );
    let baseAngle = normalAngle + angleDifference * laserFocusAmount;
    let beamSpread = 0.24 + (focusedLaserSpread - 0.24) * laserFocusAmount;
    let visibleBeamLength = beamLength + (focusedBeamLength - beamLength) * laserFocusAmount;

    context.strokeStyle = "rgb(%s, %s, %s)".format(color[0], color[1], color[2]);
    for(let beam = -1; beam <= 1; beam++) {
      let angle = baseAngle + beam * beamSpread;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * visibleBeamLength, y + Math.sin(angle) * visibleBeamLength);
      context.stroke();
    }
  });
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
