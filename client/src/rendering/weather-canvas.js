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
  this.__discoLights = { enabled: false, intensity: 60, beatBpm: 0, radius: 0, center: null };
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

WeatherCanvas.prototype.setWeatherType = function(type) {

  this.__weatherType = type || "none";

}

WeatherCanvas.prototype.setDiscoLights = function(enabled, intensity, beatBpm, radius, center) {

  this.__discoLights = {
    enabled: enabled === true,
    intensity: Math.max(10, Math.min(100, Number(intensity) || 60)),
    beatBpm: Number.isInteger(beatBpm) ? beatBpm : 0,
    radius: Math.max(0, Math.min(20, Number(radius) || 0)),
    center: center && Number.isInteger(center.x) && Number.isInteger(center.y) && Number.isInteger(center.z) ? center : null
  };

}

WeatherCanvas.prototype.drawDiscoLights = function() {

  let disco = this.__discoLights;
  if(!disco.enabled) {
    return;
  }

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height;
  let now = performance.now();
  let pulse = disco.beatBpm > 0
    ? 0.55 + 0.45 * Math.max(0, Math.sin(now * Math.PI * 2 * disco.beatBpm / 60000))
    : 0.72 + 0.28 * Math.sin(now / 260);
  let intensity = disco.intensity / 100;
  let colors = [[42, 120, 255], [232, 48, 255], [35, 255, 194]];

  context.save();
  context.globalCompositeOperation = "screen";

  // Three moving soft spotlights sweeping across the dance floor.
  for(let index = 0; index < colors.length; index++) {
    let angle = now / 1100 + index * Math.PI * 2 / colors.length;
    let x = width * 0.5 + Math.cos(angle) * width * 0.38;
    let y = height * 0.48 + Math.sin(angle * 1.3) * height * 0.28;
    let color = colors[index];
    let gradient = context.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.34);
    gradient.addColorStop(0, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], 0.36 * intensity * pulse));
    gradient.addColorStop(0.38, "rgba(%s, %s, %s, %s)".format(color[0], color[1], color[2], 0.13 * intensity * pulse));
    gradient.addColorStop(1, "rgba(%s, %s, %s, 0)".format(color[0], color[1], color[2]));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  // Laser fixtures live on the outer wall of the radio square, every four
  // SQMs, instead of firing through the player in the centre of the room.
  let zoneCenter = disco.center
    ? new Position(disco.center.x, disco.center.y, disco.center.z)
    : gameClient.player.getPosition();
  let zoneScreenPosition = gameClient.renderer.getStaticScreenPosition(zoneCenter);
  let centreX = (zoneScreenPosition.x + 0.5) * 32;
  let centreY = (zoneScreenPosition.y + 0.5) * 32;
  let sideLength = Math.max(1, disco.radius * 2);
  let perimeter = sideLength * 4;

  context.globalAlpha = 0.9 * intensity * pulse;
  context.lineWidth = 3;
  for(let index = 0; index < 3; index++) {
    // Three fixtures travel clockwise around the last ring of SQMs, spaced
    // evenly around the perimeter like moving club lasers on the walls.
    let travel = ((now / 520 + index * perimeter / 3) % perimeter + perimeter) % perimeter;
    let offsetX;
    let offsetY;
    let directionX;
    let directionY;

    if(travel < sideLength) {
      offsetX = -disco.radius + travel;
      offsetY = -disco.radius;
      directionX = 1;
      directionY = 0;
    } else if(travel < sideLength * 2) {
      offsetX = disco.radius;
      offsetY = -disco.radius + (travel - sideLength);
      directionX = 0;
      directionY = 1;
    } else if(travel < sideLength * 3) {
      offsetX = disco.radius - (travel - sideLength * 2);
      offsetY = disco.radius;
      directionX = -1;
      directionY = 0;
    } else {
      offsetX = -disco.radius;
      offsetY = disco.radius - (travel - sideLength * 3);
      directionX = 0;
      directionY = -1;
    }

    let color = colors[index];
    let x = centreX + offsetX * 32;
    let y = centreY + offsetY * 32;
    context.strokeStyle = "rgb(%s, %s, %s)".format(color[0], color[1], color[2]);
    context.beginPath();
    context.moveTo(x - directionX * 14, y - directionY * 14);
    context.lineTo(x + directionX * 14, y + directionY * 14);
    context.stroke();
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
