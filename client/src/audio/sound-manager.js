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
  this.__radioAudioContext = null;
  this.__radioSourceNode = null;
  this.__radioAnalyser = null;
  this.__radioFrequencyData = null;
  this.__radioRhythm = {
    baseline: 0,
    samples: 0,
    lastEnergy: 0,
    lastSignalAt: 0,
    lastBeatAt: 0,
    beatInterval: 0,
    beatSequence: 0,
    beatStrength: 0
  };

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

  this.__sampleRadioRhythm(performance.now());

  if(Math.abs(this.__radioGameVolume - this.__radioGameVolumeTarget) > 0.002) {
    this.__radioGameVolume += (this.__radioGameVolumeTarget - this.__radioGameVolume) * 0.18;
    this.__applyRadioVolume();
  } else if(this.__radioGameVolume !== this.__radioGameVolumeTarget) {
    this.__radioGameVolume = this.__radioGameVolumeTarget;
    this.__applyRadioVolume();
  }

}

SoundManager.prototype.__resetRadioRhythm = function() {

  this.__radioFrequencyData = null;
  this.__radioRhythm = {
    baseline: 0,
    samples: 0,
    lastEnergy: 0,
    lastSignalAt: 0,
    lastBeatAt: 0,
    beatInterval: 0,
    beatSequence: 0,
    beatStrength: 0
  };

}

SoundManager.prototype.__disposeRadioAnalyser = function() {

  if(this.__radioSourceNode !== null) {
    try { this.__radioSourceNode.disconnect(); } catch(error) {}
  }
  if(this.__radioAnalyser !== null) {
    try { this.__radioAnalyser.disconnect(); } catch(error) {}
  }
  if(this.__radioAudioContext !== null && typeof this.__radioAudioContext.close === "function") {
    let closePromise = this.__radioAudioContext.close();
    if(closePromise && typeof closePromise.catch === "function") {
      closePromise.catch(function() {});
    }
  }

  this.__radioAudioContext = null;
  this.__radioSourceNode = null;
  this.__radioAnalyser = null;
  this.__resetRadioRhythm();

}

SoundManager.prototype.__startRadioAnalyser = function(stream) {

  let AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if(!AudioContextClass || stream !== this.__radioStream) return;

  let context;
  try {
    context = new AudioContextClass();
  } catch(error) {
    return;
  }

  let self = this;
  let resumePromise;
  try {
    resumePromise = context.state === "running" ? Promise.resolve() : context.resume();
  } catch(error) {
    resumePromise = Promise.reject(error);
  }

  Promise.resolve(resumePromise).then(function() {
    if(stream !== self.__radioStream) {
      if(typeof context.close === "function") context.close().catch(function() {});
      return;
    }
    if(context.state !== "running") {
      throw new Error("Radio audio analyser context is not running.");
    }

    let source = null;
    let analyser = null;
    try {
      source = context.createMediaElementSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.68;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -15;
      source.connect(analyser);
      analyser.connect(context.destination);

      self.__radioAudioContext = context;
      self.__radioSourceNode = source;
      self.__radioAnalyser = analyser;
      self.__resetRadioRhythm();
      self.__radioFrequencyData = new Uint8Array(analyser.frequencyBinCount);
    } catch(error) {
      // A media element routed through Web Audio must stay connected to the
      // destination even when analysis is unsupported. Music keeps playing and
      // all visuals fall back to the BPM configured in /radio.
      if(analyser !== null) {
        try { analyser.disconnect(); } catch(disconnectError) {}
      }
      if(source !== null) {
        try { source.disconnect(); } catch(disconnectError) {}
        try {
          source.connect(context.destination);
          self.__radioAudioContext = context;
          self.__radioSourceNode = source;
        } catch(connectError) {}
      } else if(typeof context.close === "function") {
        context.close().catch(function() {});
      }
      console.info("Radio bass analysis is unavailable; using configured BPM instead.");
    }
  }).catch(function() {
    if(typeof context.close === "function") context.close().catch(function() {});
  });

}

SoundManager.prototype.__sampleRadioRhythm = function(now) {

  if(this.__radioAnalyser === null || this.__radioAudioContext === null
      || this.__radioAudioContext.state !== "running") {
    return;
  }

  if(this.__radioFrequencyData === null
      || this.__radioFrequencyData.length !== this.__radioAnalyser.frequencyBinCount) {
    this.__radioFrequencyData = new Uint8Array(this.__radioAnalyser.frequencyBinCount);
  }

  this.__radioAnalyser.getByteFrequencyData(this.__radioFrequencyData);
  let binSize = this.__radioAudioContext.sampleRate / this.__radioAnalyser.fftSize;
  let firstBin = Math.max(1, Math.ceil(40 / binSize));
  let lastBin = Math.min(this.__radioFrequencyData.length - 1, Math.floor(180 / binSize));
  if(lastBin < firstBin) return;

  let squareSum = 0;
  let count = 0;
  for(let index = firstBin; index <= lastBin; index++) {
    squareSum += this.__radioFrequencyData[index] * this.__radioFrequencyData[index];
    count++;
  }

  let energy = count > 0 ? Math.sqrt(squareSum / count) : 0;
  let rhythm = this.__radioRhythm;
  rhythm.samples++;
  if(energy > 2) rhythm.lastSignalAt = now;

  if(rhythm.baseline <= 0) {
    rhythm.baseline = energy;
  } else {
    let baselineSpeed = energy < rhythm.baseline ? 0.08 : 0.018;
    rhythm.baseline += (energy - rhythm.baseline) * baselineSpeed;
  }

  let threshold = Math.max(rhythm.baseline * 1.30, rhythm.baseline + 7);
  let rising = energy > rhythm.lastEnergy * 1.025;
  let cooldownElapsed = now - rhythm.lastBeatAt;
  if(rhythm.samples > 18 && energy > threshold && rising && cooldownElapsed >= 240) {
    if(rhythm.lastBeatAt > 0) {
      let interval = now - rhythm.lastBeatAt;
      if(interval >= 240 && interval <= 1500) {
        rhythm.beatInterval = rhythm.beatInterval > 0
          ? rhythm.beatInterval * 0.72 + interval * 0.28
          : interval;
      }
    }
    rhythm.lastBeatAt = now;
    rhythm.beatSequence++;
    rhythm.beatStrength = Math.max(0.55, Math.min(
      1,
      0.55 + (energy - threshold) / Math.max(1, 255 - threshold) * 1.9
    ));
  }

  rhythm.lastEnergy = energy;

}

SoundManager.prototype.getRadioRhythm = function(fallbackBpm, now) {

  let fallback = Number(fallbackBpm);
  if(!Number.isFinite(fallback) || fallback < 40 || fallback > 240) fallback = 140;
  now = Number.isFinite(now) ? now : performance.now();

  let rhythm = this.__radioRhythm;
  let signalFresh = rhythm.lastSignalAt > 0 && now - rhythm.lastSignalAt < 1500;
  let beatFresh = rhythm.lastBeatAt > 0
    && now - rhythm.lastBeatAt < Math.max(1800, 60000 / fallback * 4);
  let detectedBpm = fallback;

  if(rhythm.beatInterval > 0) {
    let rawBpm = 60000 / rhythm.beatInterval;
    // Reject only implausible double-time/half-time readings. A genuinely slow
    // song must remain slow even when /radio was previously configured to 140.
    while(rawBpm > 190) rawBpm /= 2;
    while(rawBpm < 50) rawBpm *= 2;
    if(rawBpm >= 40 && rawBpm <= 240) detectedBpm = rawBpm;
  }

  let useBass = signalFresh && beatFresh;
  let bpm = useBass ? detectedBpm : fallback;
  let beatDuration = 60000 / bpm;
  let beatPulse;
  let phase;
  if(useBass) {
    let elapsed = Math.max(0, now - rhythm.lastBeatAt);
    phase = (elapsed % beatDuration) / beatDuration;
    let decayWindow = Math.min(360, beatDuration * 0.82);
    beatPulse = Math.max(0, 1 - elapsed / decayWindow)
      * (0.65 + rhythm.beatStrength * 0.35);
  } else {
    phase = (now % beatDuration) / beatDuration;
    beatPulse = Math.max(0, Math.sin(phase * Math.PI * 2));
  }

  return {
    source: useBass ? "bass" : "bpm",
    bpm: bpm,
    phase: phase,
    pulse: Math.max(0, Math.min(1, beatPulse)),
    strength: useBass ? rhythm.beatStrength : 1,
    sequence: rhythm.beatSequence,
    now: now
  };

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
  this.__radioStream = new Audio();
  this.__radioStream.crossOrigin = "anonymous";
  this.__radioStream.loop = false;
  this.__radioStream.preload = "none";
  this.__radioStream.src = url;
  this.__applyRadioVolume();

  let stream = this.__radioStream;
  let self = this;
  let playPromise = stream.play();
  if(playPromise && typeof playPromise.then === "function") {
    playPromise.then(function() {
      self.__startRadioAnalyser(stream);
    }).catch(function(error) {
      if(stream !== self.__radioStream) return;

      // Some user-configured stations play normally but do not allow CORS.
      // Retry those streams without analysis so the radio never goes silent;
      // the visual effects continue from the configured /radio BPM.
      stream.pause();
      stream.removeAttribute("src");
      stream.load();
      self.__disposeRadioAnalyser();
      self.__radioStream = new Audio(url);
      self.__radioStream.loop = false;
      self.__radioStream.preload = "none";
      self.__applyRadioVolume();
      let fallbackPromise = self.__radioStream.play();
      if(fallbackPromise && typeof fallbackPromise.catch === "function") {
        fallbackPromise.catch(function(fallbackError) {
          console.warn("Radio stream could not be played:", fallbackError || error);
        });
      }
    });
  } else {
    this.__startRadioAnalyser(stream);
  }

}

SoundManager.prototype.stopRadioStream = function() {

  if(this.__radioStream === null) {
    this.__radioUrl = "";
    this.__disposeRadioAnalyser();
    return;
  }

  this.__disposeRadioAnalyser();
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
