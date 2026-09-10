// audio.js — procedural Web Audio for Deep Glow: a depth-reactive drone, pickup
// chimes stepped through a pentatonic scale, muffled bump thuds, and a brownout
// dip/recover. Everything is synthesised — no audio files, per the repo's
// no-assets rule.
//
// Lifecycle is the whole game here. The AudioContext is built LAZILY, inside
// unlock(), which must be called from a real user gesture (browsers create a
// fresh context 'suspended', and some never resume it on their own). unlock()
// is safe to call repeatedly — it also nudges an already-suspended context back
// to 'running', because Safari suspends contexts on its own schedule regardless
// of what the game does.
//
// Muted by default. Muting is implemented by suspending the context outright
// (not just zeroing a gain), so a muted tab does no audio processing at all,
// and "resume audio while muted" is structurally impossible rather than a flag
// callers must remember to check.
//
// If AudioContext doesn't exist at all, every method below is a safe no-op —
// `supported` is false and callers (game.js) use it to disable the mute button
// instead of letting any of this throw.

const MUTED_KEY = 'deep-glow:muted';

// A5-rooted major pentatonic. ping() steps through it on consecutive pickups so
// a run of collections reads as a little rising melody, not one repeated beep.
const PENTATONIC_HZ = [440, 493.88, 587.33, 659.25, 783.99]; // A4 B4 D5 E5 G5

const DRONE_BASE_FREQ = 55;        // Hz — low A, the resting drone pitch
const DRONE_DETUNE_CENTS = 9;      // spread between the two detuned saws
const DRONE_GAIN_MIN = 0.02;       // gain at the surface
const DRONE_GAIN_MAX = 0.05;       // gain at full depth — "rises slightly per zone"
const DRONE_RAMP_S = 0.4;          // time constant for setDepth's smoothing

const CUTOFF_SURFACE_HZ = 1400;    // lowpass cutoff near the surface — brighter
const CUTOFF_TRENCH_HZ = 160;      // cutoff at full depth — thick and muffled
const CUTOFF_FULL_DEPTH_M = 2000;  // depth at which the cutoff bottoms out

const PING_DECAY_S = 0.32;         // fast decay envelope
const PING_GAIN = 0.16;

const THUD_DURATION_S = 0.22;      // short noise burst
const THUD_GAIN = 0.3;
const THUD_CUTOFF_HZ = 380;        // muffled, not harsh

const BROWNOUT_DIVE_S = 0.6;       // pitch/filter close time
const BROWNOUT_RECOVER_S = 1.4;    // reopen time as the lamp relights

function hasWebAudio() {
  return typeof window !== 'undefined' &&
    (typeof window.AudioContext === 'function' || typeof window.webkitAudioContext === 'function');
}

// localStorage throws on ACCESS (not just writes) in private-mode Safari, so
// every read and every write is wrapped. Anything but the literal string
// "false" reads as muted — that includes a missing key, which is what makes
// the default "muted".
function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) !== 'false';
  } catch {
    return true;
  }
}
function writeMuted(muted) {
  try { localStorage.setItem(MUTED_KEY, muted ? 'true' : 'false'); } catch { /* private mode */ }
}

export function makeAudio() {
  const supported = hasWebAudio();
  let muted = readMuted();

  let ctx = null;
  let master = null;       // single gain all voices sum into, -> destination
  let droneFilter = null;  // lowpass shared by both drone oscillators
  let droneGain = null;
  let osc1 = null;
  let osc2 = null;
  let noiseBuffer = null;  // one shared white-noise buffer, reused by every thud()
  let pingStep = 0;        // index into PENTATONIC_HZ, advances on every ping()

  function buildNoiseBuffer(audioCtx) {
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * THUD_DURATION_S));
    const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Builds the always-on drone graph: two detuned sawtooths -> shared lowpass ->
  // gain -> master. Runs once, the first time a context exists. The oscillators
  // are started immediately (their sound is inaudible until the context is
  // actually 'running', which only happens once the player unmutes).
  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = CUTOFF_SURFACE_HZ;
    droneFilter.Q.value = 0.7;

    droneGain = ctx.createGain();
    droneGain.gain.value = DRONE_GAIN_MIN;

    osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = DRONE_BASE_FREQ;

    osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = DRONE_BASE_FREQ;
    osc2.detune.value = DRONE_DETUNE_CENTS;

    osc1.connect(droneFilter);
    osc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);

    osc1.start();
    osc2.start();

    noiseBuffer = buildNoiseBuffer(ctx);
  }

  // Creates the context (and its permanent graph) on first call. Every later
  // call is a cheap existence check. Returns false if Web Audio is unavailable
  // or construction itself throws (belt-and-braces — some embedded WebViews
  // advertise AudioContext but fail to construct it).
  function ensureCtx() {
    if (ctx) return true;
    if (!supported) return false;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctor();
      buildGraph();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  // Call from every real user gesture, not just the first — Safari suspends
  // contexts again on its own schedule, so this must be able to pull one back
  // to 'running' at any time, not only construct it once.
  function unlock() {
    if (!ensureCtx()) return;
    if (!muted && ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* ignored — next gesture tries again */ });
    }
  }

  function setDepth(metres) {
    if (!ctx || muted) return;
    const t = Math.min(1, Math.max(0, metres / CUTOFF_FULL_DEPTH_M));
    const cutoff = CUTOFF_SURFACE_HZ + (CUTOFF_TRENCH_HZ - CUTOFF_SURFACE_HZ) * t;
    const gain = DRONE_GAIN_MIN + (DRONE_GAIN_MAX - DRONE_GAIN_MIN) * t;
    const now = ctx.currentTime;
    droneFilter.frequency.setTargetAtTime(cutoff, now, DRONE_RAMP_S);
    droneGain.gain.setTargetAtTime(gain, now, DRONE_RAMP_S);
  }

  function ping() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const freq = PENTATONIC_HZ[pingStep % PENTATONIC_HZ.length];
    pingStep++;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(PING_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + PING_DECAY_S);

    osc.connect(gain);
    gain.connect(master);

    const stopAt = now + PING_DECAY_S + 0.05;
    osc.start(now);
    osc.stop(stopAt);
    // Disconnect once the node is done so a long run of pickups never
    // accumulates dangling nodes.
    osc.addEventListener('ended', () => {
      osc.disconnect();
      gain.disconnect();
    });
  }

  function thud() {
    if (!ctx || muted || !noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = THUD_CUTOFF_HZ;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(THUD_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + THUD_DURATION_S);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    const stopAt = now + THUD_DURATION_S + 0.05;
    src.start(now);
    src.stop(stopAt);
    src.addEventListener('ended', () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    });
  }

  // One call does the whole dip-and-recover: bend the drone down and close the
  // filter, then reopen as if the lamp were relighting — game.js calls this
  // once, right as it enters the brownout state, not again on relight.
  function brownout() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;

    droneFilter.frequency.cancelScheduledValues(now);
    droneGain.gain.cancelScheduledValues(now);
    osc1.frequency.cancelScheduledValues(now);
    osc2.frequency.cancelScheduledValues(now);

    // Dive: pitch drops an octave, filter closes further than even the trench.
    osc1.frequency.setTargetAtTime(DRONE_BASE_FREQ * 0.5, now, BROWNOUT_DIVE_S / 3);
    osc2.frequency.setTargetAtTime(DRONE_BASE_FREQ * 0.5, now, BROWNOUT_DIVE_S / 3);
    droneFilter.frequency.setTargetAtTime(CUTOFF_TRENCH_HZ * 0.4, now, BROWNOUT_DIVE_S / 3);

    // Recover: reopen back to the surface brightness, timed to land after the
    // dive settles — echoes the lamp's own relight.
    const recoverAt = now + BROWNOUT_DIVE_S;
    osc1.frequency.setTargetAtTime(DRONE_BASE_FREQ, recoverAt, BROWNOUT_RECOVER_S / 3);
    osc2.frequency.setTargetAtTime(DRONE_BASE_FREQ, recoverAt, BROWNOUT_RECOVER_S / 3);
    droneFilter.frequency.setTargetAtTime(CUTOFF_SURFACE_HZ, recoverAt, BROWNOUT_RECOVER_S / 3);
  }

  // Muting suspends the context outright rather than zeroing a gain, so a
  // muted tab does no audio processing and "resume while muted" cannot happen —
  // there is nothing running to resume by accident.
  function setMuted(next) {
    muted = !!next;
    writeMuted(muted);
    if (!ctx) return;
    if (muted) {
      ctx.suspend().catch(() => { /* already suspended, or closing — fine either way */ });
    } else {
      ctx.resume().catch(() => { /* next gesture's unlock() retries */ });
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) {
        ctx.suspend().catch(() => { /* ignored */ });
      } else if (!muted) {
        ctx.resume().catch(() => { /* ignored */ });
      }
      // Visible again while muted: deliberately NOT resumed. Resuming audio
      // while muted is the one bug in this file you would never see in a
      // console — only hear, at the worst possible moment.
    });
  }

  return {
    unlock,
    setDepth,
    ping,
    thud,
    brownout,
    setMuted,
    // Called once per new dive (game.js's Start button) so the pentatonic
    // scale always opens from its root note instead of continuing wherever
    // the previous dive's pickups left it.
    resetMelody() { pingStep = 0; },
    get muted() { return muted; },
    // Not part of the task's nominal interface, but game.js needs a way to
    // disable the mute button instead of letting a click throw when
    // AudioContext doesn't exist at all.
    supported,
  };
}
