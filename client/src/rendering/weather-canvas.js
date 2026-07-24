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

WeatherCanvas.prototype.drawRain = function() {

  /*
   * Draw a lightweight, deterministic layer of falling raindrops. The old
   * weather code only enabled rain ambience, so the option had sound but no
   * visible precipitation.
   */

  let context = this.screen.context;
  let width = this.screen.canvas.width;
  let height = this.screen.canvas.height;
  let frame = gameClient.renderer.debugger.__nFrames;
  let count = Math.max(45, Math.floor((width * height) / 7000));

  context.save();
  context.globalAlpha = 0.68;
  context.strokeStyle = "#b9dcff";
  context.lineWidth = 1.5;
  context.beginPath();

  for(let index = 0; index < count; index++) {
    let x = (index * 83 + frame * 5) % (width + 12) - 6;
    let impactY = height - 18 - (index * 29) % Math.max(32, Math.floor(height * 0.42));
    let y = (index * 47 + frame * 13) % (impactY + 22) - 12;

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
