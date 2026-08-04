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
  this.__radioZoneVolume = 1;
  this.__radioGameVolume = 1;
  this.__radioGameVolumeTarget = 1;
  this.__radioEnvironmentalMute = false;

}

SoundManager.prototype.playWalkBit = function(position) {

  if (this.__radioEnvironmentalMute) {
    return;
  }

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
    this.__currentAmbientTrace.setVolume(this.__radioEnvironmentalMute ? 0 : amount);
  }
  if(this.__radioStream !== null) {
    this.__applyRadioVolume();
  }

}

SoundManager.prototype.setRadioEnvironmentalMute = function (muted) {

  this.__radioEnvironmentalMute = muted === true;
  if (this.__radioEnvironmentalMute) {
    Object.values(this.ambientTraces).forEach(function (trace) {
      trace.stop();
      trace.__volume = 0;
      trace.__volumeTarget = 0;
      trace.__counter = 0;
    });
  } else if (this.__currentAmbientTrace !== null) {
    this.__currentAmbientTrace.setVolume(this.__masterVolume);
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

  if(Math.abs(this.__radioGameVolume - this.__radioGameVolumeTarget) > 0.002) {
    this.__radioGameVolume += (this.__radioGameVolumeTarget - this.__radioGameVolume) * 0.18;
    this.__applyRadioVolume();
  } else if(this.__radioGameVolume !== this.__radioGameVolumeTarget) {
    this.__radioGameVolume = this.__radioGameVolumeTarget;
    this.__applyRadioVolume();
  }

}

SoundManager.prototype.__applyRadioVolume = function() {

  if(this.__radioStream === null) return;
  this.__radioStream.volume = Math.max(0, Math.min(
    1,
    this.__masterVolume * this.__radioZoneVolume * this.__radioGameVolume
  ));

}

SoundManager.prototype.setRadioGameDuck = function(ducked) {

  this.__radioGameVolumeTarget = ducked === true ? 0 : 1;
  if(this.__radioStream === null) {
    this.__radioGameVolume = this.__radioGameVolumeTarget;
  }

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

  this.__currentAmbientTrace = this.setAmbientVolume(id, this.__radioEnvironmentalMute ? 0 : 1);

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

SoundManager.prototype.playAchievement = function () {
  if (this.__masterVolume <= 0) return;
  let AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  let context = this.__achievementAudioContext || new AudioContextClass();
  this.__achievementAudioContext = context;
  let start = context.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach(function (frequency, index) {
    let oscillator = context.createOscillator();
    let gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + index * 0.1);
    gain.gain.linearRampToValueAtTime(0.12 * this.__masterVolume, start + index * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + index * 0.1 + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + index * 0.1);
    oscillator.stop(start + index * 0.1 + 0.3);
  }, this);
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
    this.__radioZoneVolume = Math.max(0, Math.min(1, volume === undefined ? 1 : volume));
    this.__applyRadioVolume();
    return;
  }

  this.stopRadioStream();

  this.__radioUrl = url;
  this.__radioZoneVolume = Math.max(0, Math.min(1, volume === undefined ? 1 : volume));
  this.__radioStream = new Audio(url);
  this.__radioStream.loop = false;
  this.__radioStream.preload = "none";
  this.__applyRadioVolume();

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
  this.__radioZoneVolume = 1;

}

SoundManager.prototype.stopAll = function() {

  /*
   * Function SoundManager.stopAll
   * Stops all active game sounds, used when leaving the game world.
   */

  Object.values(this.traces).forEach(function(trace) {
    trace.stop();
  });

  Object.values(this.ambientTraces).forEach(function(trace) {
    trace.stop();
  });

  Object.values(this.soundbits).forEach(function(soundbit) {
    soundbit.stop();
  });

  this.stopRadioStream();
  this.__currentAmbientTrace = null;

}
