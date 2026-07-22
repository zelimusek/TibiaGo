const SoundManager = function(enabled) {

  /*
   * Class SoundManager
   * Wrapper for the sound manager that contains multiple sound traces
   */

  this.traces = new Object();
  this.soundbits = new Object();
  this.ambientTraces = new Object();

  // These are ambient traces of which only one can play at a time
  this.registerAmbientTrace("field");
  this.registerAmbientTrace("cave");
  this.registerAmbientTrace("forest");
  this.registerAmbientTrace("wind");

  // Extra trace
  this.registerTrace("rain");

  // Small sound bits
  this.registerSoundbit("wood", ["wood-2"]);
  this.registerSoundbit("thunder", ["thunder-1", "thunder-2", "thunder-3", "thunder-4"]);
  this.registerSoundbit("grass-walk", ["grass-1", "grass-2", "grass-3", "grass-4", "grass-5", "grass-6", "grass-7", "grass-8"]);

  // Master volume for all traces
  this.__masterVolume = enabled ? 1.0 : 0.0;
  this.__currentAmbientTrace = null;
  this.__radioStream = null;
  this.__radioUrl = "";

}

SoundManager.prototype.playWalkBit = function(position) {

  let tile = gameClient.world.getTileFromWorldPosition(position);

  if(tile.id === 405) {
    return this.play("wood");
  } else {
    return this.play("grass-walk");
  }

}

SoundManager.prototype.enableSound = function(bool) {

  this.setMasterVolume(bool ? 1.0 : 0.0);

}

SoundManager.prototype.setMasterVolume = function(amount) {

  if(!gameClient.interface.settings.isSoundEnabled()) {
    amount = 0;
  }

  this.__masterVolume = amount;
  if(this.__currentAmbientTrace !== null) {
    this.__currentAmbientTrace.setVolume(amount);
  }
  if(this.__radioStream !== null) {
    this.__radioStream.volume = amount;
  }

}

SoundManager.prototype.registerSoundbit = function(id, ids) {

  this.soundbits[id] = new SoundBit(ids);

}

SoundManager.prototype.registerAmbientTrace = function(id) {

  this.ambientTraces[id] = new SoundTrace(id);

}

SoundManager.prototype.registerTrace = function(id) {

  this.traces[id] = new SoundTrace(id);

}

SoundManager.prototype.tick = function() {

  /*
   * Function SoundManager.tick
   * Ticks all the available sound traces in order to match face in/out
   */

  Object.values(this.traces).forEach(function(trace) {
    trace.tick();
  });

  Object.values(this.ambientTraces).forEach(function(trace) {
    trace.tick();
  });

}

SoundManager.prototype.fadeTo = function(trackOne, trackTwo) {

  /*
   * Function SoundManager.fadeTo
   * Fades one ambient song in to another
   */

  // Swap volumes
  this.setVolume(trackOne, 0);
  this.setVolume(trackTwo, 1);

}

SoundManager.prototype.play = function(id) {

  if(!this.soundbits.hasOwnProperty(id)) {
    return;
  }

  this.soundbits[id].play();

}

SoundManager.prototype.setAmbientTrace = function(id) {

  if(this.__currentAmbientTrace !== null) {
    this.__currentAmbientTrace.setVolume(0);
  }

  this.__currentAmbientTrace = this.setAmbientVolume(id, 1);

}

SoundManager.prototype.setAmbientVolume = function(id, volume) {

  if(!this.ambientTraces.hasOwnProperty(id)) {
    return null;
  }

  return this.ambientTraces[id].setVolume(volume);

}

SoundManager.prototype.setVolume = function(id, volume) {

  if(!this.traces.hasOwnProperty(id)) {
    return null;
  }

  return this.traces[id].setVolume(volume);

}

SoundManager.prototype.setRadioStream = function(url, volume) {

  /*
   * Function SoundManager.setRadioStream
   * Starts/stops an external browser audio stream, e.g. an internet radio URL.
   */

  if(!url) {
    this.stopRadioStream();
    return;
  }

  if(this.__radioUrl === url && this.__radioStream !== null) {
    this.__radioStream.volume = Math.min(this.__masterVolume, volume === undefined ? 1 : volume);
    return;
  }

  this.stopRadioStream();

  this.__radioUrl = url;
  this.__radioStream = new Audio(url);
  this.__radioStream.loop = false;
  this.__radioStream.preload = "none";
  this.__radioStream.volume = Math.min(this.__masterVolume, volume === undefined ? 1 : volume);

  let playPromise = this.__radioStream.play();
  if(playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(function(error) {
      console.warn("Radio stream could not be played:", error);
    });
  }

}

SoundManager.prototype.stopRadioStream = function() {

  if(this.__radioStream === null) {
    this.__radioUrl = "";
    return;
  }

  this.__radioStream.pause();
  this.__radioStream.removeAttribute("src");
  this.__radioStream.load();
  this.__radioStream = null;
  this.__radioUrl = "";

}
