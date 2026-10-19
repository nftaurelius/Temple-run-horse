// Alle geluiden worden live gesynthetiseerd met WebAudio (geen audiobestanden nodig).

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.musicTimer = null;
    this.musicPlaying = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.32 : 0;
    this.music.connect(this.master);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // iOS: een stil buffertje afspelen binnen het tik-event ontgrendelt de audio.
    const src = this.ctx.createBufferSource();
    src.buffer = this.ctx.createBuffer(1, 1, 22050);
    src.connect(this.ctx.destination);
    src.start(0);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.value = on ? 1 : 0;
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.005, dest = null } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, { vol = 0.3, freq = 1000, q = 1, type = 'bandpass', at = 0, sweepTo = null, dest = null } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  coin(streak = 0) {
    const base = 1180 * Math.pow(1.03, Math.min(streak, 12));
    this.tone(base, 0.08, { type: 'square', vol: 0.06 });
    this.tone(base * 1.5, 0.16, { type: 'sine', vol: 0.12, at: 0.05 });
  }

  hoof(strength = 1) {
    this.noiseBurst(0.06, { vol: 0.16 * strength, freq: 260, q: 0.8, type: 'lowpass' });
    this.tone(90, 0.07, { type: 'sine', vol: 0.18 * strength, slideTo: 50 });
  }

  jump() {
    this.noiseBurst(0.35, { vol: 0.12, freq: 400, sweepTo: 1800, q: 0.7 });
  }

  land() {
    this.hoof(1.6);
    this.hoof(1.2);
  }

  duck() {
    this.noiseBurst(0.25, { vol: 0.1, freq: 1800, sweepTo: 500, q: 0.7 });
  }

  lane() {
    this.noiseBurst(0.12, { vol: 0.06, freq: 900, sweepTo: 1500, q: 1.2 });
  }

  splash() {
    this.noiseBurst(0.45, { vol: 0.3, freq: 2200, sweepTo: 600, q: 0.6 });
    this.noiseBurst(0.25, { vol: 0.15, freq: 4000, q: 1, at: 0.05 });
  }

  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.16, at: i * 0.06 }));
  }

  shieldBreak() {
    this.noiseBurst(0.4, { vol: 0.3, freq: 3000, sweepTo: 300, q: 2 });
    this.tone(400, 0.3, { type: 'square', vol: 0.08, slideTo: 120 });
  }

  turn() {
    this.noiseBurst(0.18, { vol: 0.08, freq: 600, sweepTo: 1200, q: 1 });
  }

  whinny() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(700, t);
    o.frequency.linearRampToValueAtTime(1050, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.9);
    lfo.frequency.value = 22;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.05);
    g.gain.setValueAtTime(0.13, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1);
    lfo.stop(t + 1);
  }

  crash() {
    this.tone(120, 0.35, { type: 'sine', vol: 0.4, slideTo: 40 });
    this.noiseBurst(0.4, { vol: 0.3, freq: 500, q: 0.5, type: 'lowpass' });
    setTimeout(() => this.whinny(), 120);
  }

  click() {
    this.tone(880, 0.06, { type: 'triangle', vol: 0.12 });
  }

  buy() {
    [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.15, at: i * 0.07 }));
    this.tone(1760, 0.4, { type: 'sine', vol: 0.08, at: 0.3 });
  }

  // --- Muziek: vrolijke folk-loop in G-groot ---
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const bpm = 128;
    this.step = 0;
    this.stepDur = 60 / bpm / 2; // achtsten
    this.nextTime = this.ctx.currentTime + 0.1;
    const chords = [
      [196, 247, 294], // G
      [196, 247, 294],
      [262, 330, 392], // C
      [294, 370, 440], // D
      [165, 196, 247], // Em
      [262, 330, 392], // C
      [294, 370, 440], // D
      [196, 247, 294], // G
    ];
    const scale = [392, 440, 494, 587, 659, 784, 880];
    const melody = [
      0, null, 2, 3, 4, null, 3, 2, 1, null, 0, null, 2, null, null, null,
      4, null, 5, 4, 3, null, 2, null, 3, null, 4, null, 2, null, null, null,
      5, null, 4, 5, 6, null, 5, 4, 3, null, 2, null, 4, null, null, null,
      3, 2, 1, null, 2, null, 0, null, 1, null, 0, null, 0, null, null, null,
    ];
    const tick = () => {
      if (!this.musicPlaying) return;
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        const s = this.step % 64;
        const bar = Math.floor(this.step / 8) % 8;
        const chord = chords[bar];
        const t = this.nextTime - this.ctx.currentTime;
        if (s % 4 === 0) this.tone(chord[0] / 2, 0.28, { type: 'triangle', vol: 0.22, at: t, dest: this.music });
        if (s % 4 === 2) chord.forEach((f) => this.tone(f, 0.12, { type: 'square', vol: 0.025, at: t, dest: this.music }));
        const m = melody[s];
        if (m !== null) this.tone(scale[m], 0.22, { type: 'triangle', vol: 0.11, at: t, dest: this.music });
        if (s % 2 === 1) this.noiseBurst(0.03, { vol: 0.03, freq: 7000, type: 'highpass', at: t, dest: this.music });
        this.nextTime += this.stepDur;
        this.step++;
      }
      this.musicTimer = setTimeout(tick, 60);
    };
    tick();
  }

  stopMusic() {
    this.musicPlaying = false;
    clearTimeout(this.musicTimer);
  }
}
