// Spellogica: de ruiter besturen, botsingen, struikelen, de stier, munten, power-ups,
// opdrachten, camera en de spelstatus.

import * as THREE from './lib/three.module.min.js';
import {
  LANE_WIDTH, CORNER, OVERRUN, JUMP_HEIGHT, JUMP_TIME, DUCK_TIME, DIFFICULTIES, POWERUPS,
  CONTINUE_BASE_COST, CHASE_START, powerDuration, difficultyById, horseById, riderById,
} from './config.js';
import { World, yawOf } from './world.js';
import { HorseRider, HOOF_BEATS } from './horse.js';
import { Bull } from './bull.js';
import { Particles } from './effects.js';
import { Distractions } from './distractions.js';
import { Missions, levelMult } from './missions.js';
import { getSave, save } from './save.js';
import { shadowTexture } from './textures.js';
import { SUN_DIR, FOG_COLOR } from './sky.js';

const params = new URLSearchParams(location.search);
const GOD = params.has('god');

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const QUALITY = {
  hoog: { dpr: 2, shadows: true, map: 2048, detail: 1 },
  normaal: { dpr: 1.5, shadows: true, map: 1024, detail: 1 },
  laag: { dpr: 1, shadows: false, map: 512, detail: 0 },
};

// Statistieken die bij elkaar opgeteld worden voor opdrachten.
const TOTAL_KEYS = ['meters', 'coins', 'powerups', 'splashes', 'crowdJumps', 'escapes', 'jumps'];

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Game {
  constructor(canvas, ui, sound) {
    this.ui = ui;
    this.sound = sound;
    this.save = getSave();
    this.missions = new Missions();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_COLOR, 55, 185);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
    this.scene.add(this.camera);

    this.buildEnvironment();
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x55703a, 1.05));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    this.world = new World(this.scene);
    this.horse = new HorseRider(horseById(this.save.selectedHorse), riderById(this.save.selectedRider));
    this.scene.add(this.horse.root);
    this.bull = new Bull();
    this.bull.root.visible = false;
    this.scene.add(this.bull.root);

    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    blob.renderOrder = 1;
    this.blob = blob;
    this.scene.add(blob);

    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x6ab8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    bubble.scale.set(1.25, 1.6, 1.9);
    bubble.visible = false;
    this.bubble = bubble;
    this.scene.add(bubble);

    this.dust = new Particles(this.scene, { count: 260, gravity: 1.2 });
    this.splash = new Particles(this.scene, { count: 300, gravity: -14 });
    this.sparkle = new Particles(this.scene, { count: 180, additive: true, gravity: 2 });
    this.distractions = new Distractions(this.scene, this.camera, sound);

    this.state = 'menu';
    this.camPos = new THREE.Vector3(6, 3, 6);
    this.camLook = new THREE.Vector3(0, 1.3, 0);
    this.camK = 4;
    this.shake = 0;
    this.time = 0;
    this.last = performance.now();
    this.perf = { acc: 0, n: 0, good: 0 };

    this.applyQuality(this.save.settings.quality || 'hoog');
    this.setDifficulty(this.save.selectedDifficulty);
    this.resetRun();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    requestAnimationFrame((t) => this.frame(t));
  }

  // Zachte omgevingsbelichting en reflecties (voor glanzende munten, water en de vacht).
  buildEnvironment() {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const cols = [];
    const p = geo.attributes.position;
    const top = new THREE.Color(0x4a8fd6), hor = new THREE.Color(0xdcecf2), ground = new THREE.Color(0x5d8a45);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6));
      else c.copy(hor).lerp(ground, Math.min(1, -y * 3));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.4, 6) }));
    sunBall.position.copy(SUN_DIR).multiplyScalar(8);
    envScene.add(sunBall);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  applyQuality(q) {
    const cfg = QUALITY[q] || QUALITY.hoog;
    this.quality = QUALITY[q] ? q : 'hoog';
    this.maxDpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
    this.dpr = this.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    const changed = this.renderer.shadowMap.enabled !== cfg.shadows;
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
    this.sun.shadow.mapSize.set(cfg.map, cfg.map);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.world.detail = cfg.detail;
    this.blob.visible = !cfg.shadows;
    if (changed) this.scene.traverse((o) => {
      if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; });
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // in portret iets breder kijken zodat alle drie de banen in beeld zijn
    this.camera.fov = w < h ? 70 : 58;
    this.camera.updateProjectionMatrix();
    const px = h * this.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    for (const p of [this.dust, this.splash, this.sparkle]) p?.setScale(px);
    this.portrait = w < h;
  }

  setDifficulty(id) {
    const idx = DIFFICULTIES.findIndex((d) => d.id === id);
    const d = difficultyById(id);
    this.diff = { ...d, index: Math.max(0, idx) };
  }

  setAppearance() {
    this.horse.build(horseById(this.save.selectedHorse), riderById(this.save.selectedRider));
  }

  previewAppearance(horseId, riderId) {
    this.horse.build(horseById(horseId || this.save.selectedHorse), riderById(riderId || this.save.selectedRider));
  }

  // ---------- run beheer ----------
  resetRun() {
    this.world.speedRef = this.diff.startSpeed;
    const seg = this.world.reset(this.diff);
    const horseCfg = horseById(this.save.selectedHorse);
    this.p = {
      seg, dist: 0, lane: 0, fromLane: 0, latX: 0, y: 0, vy: 0, air: false, duckT: 0, duckQueued: false,
      speed: this.diff.startSpeed, time: 0, meters: 0, phase: 0, prevPhase: 0,
      coins: 0, score: 0, bonus: 0, nextMilestone: 500, streak: 0, streakT: 0,
      queuedTurn: null, inWater: false, invuln: 0, crashT: -1, crashReason: null, crashObstacle: null,
      magnet: 0, double: 0, shield: false, shieldT: 0, spurt: 0, stumbleT: 0,
      continues: 0, banked: 0, levelMult: levelMult(this.missions.level),
      corr: new THREE.Vector3(), yawCorr: 0, antic: 0, yaw: yawOf(seg.dir),
      pos: new THREE.Vector3(), prevPos: new THREE.Vector3(),
      horse: horseCfg, splashT: 0, hintShown: {}, cleanStart: 0, missionT: 0,
      stats: {
        meters: 0, coins: 0, jumps: 0, ducks: 0, turns: 0, powerups: 0, splashes: 0, crowdJumps: 0,
        noCoinMeters: 0, cleanMeters: 0, score: 0, chaseMeters: 0, magnetCoins: 0, escapes: 0, stumbles: 0,
      },
      statsBanked: {},
    };
    this.chase = { active: false, gap: 30, start: CHASE_START[this.diff.index] ?? 300, startMeters: 0, intro: 0, phase: 0, close: false, snortT: 1, steamT: 0 };
    this.hist = [];
    this.bull.root.visible = false;
    this.ui.setDanger?.(0);
    if (horseCfg.perk?.startShield) this.giveShield(true);
    if (horseCfg.perk?.startMagnet) this.p.magnet = powerDuration('magnet', this.save.upgrades.magnet, horseCfg);
    this.dust.clear();
    this.splash.clear();
    this.sparkle.clear();
    this.distractions.reset();
    this.updatePlayerTransform(0);
  }

  get totalMult() {
    return this.diff.mult * (1 + this.p.bonus) * this.p.levelMult;
  }

  startRun() {
    this.resetRun();
    this.state = 'playing';
    this.camK = 3;
    this.save.stats.runs++;
    save();
    this.ui.showHud();
    this.ui.updateHud(this);
    if (!this.save.tutorialDone || this.diff.hints) this.ui.showTutorial(true);
    this.sound.whinny();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause(this);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.last = performance.now();
    this.ui.showHud();
  }

  toMenu() {
    this.state = 'menu';
    this.resetRun();
    this.camK = 3;
    this.ui.showMenu();
  }

  // ---------- invoer ----------
  input(action) {
    if (action === 'pause') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state !== 'playing') return;
    const p = this.p;
    if (action === 'left' || action === 'right') {
      const t = action === 'left' ? 'L' : 'R';
      if (p.seg.allows(t) && p.dist >= this.turnZoneStart(p.seg)) {
        // bocht vastleggen en meteen al richting de binnenbocht sturen
        const changed = p.queuedTurn !== t;
        p.queuedTurn = t;
        const inner = Math.max(-1, Math.min(1, p.lane + (t === 'L' ? -1 : 1)));
        if (inner !== p.lane) {
          p.fromLane = p.lane;
          p.lane = inner;
        }
        if (p.dist >= p.seg.length) this.doTurn(t);
        else if (changed) this.sound.turn();
        return;
      }
      // onthouden: net te vroeg geveegd telt alsnog als bocht zodra je de bochtzone in rijdt
      p.lastSide = { t, time: p.time };
      const nl = Math.max(-1, Math.min(1, p.lane + (t === 'L' ? -1 : 1)));
      if (nl !== p.lane) {
        p.fromLane = p.lane;
        p.lane = nl;
        this.sound.lane();
      }
    } else if (action === 'up') {
      this.jump();
    } else if (action === 'down') {
      this.duck();
    }
  }

  // Vanaf welk punt een veeg richting de bocht als bocht telt.
  turnZoneStart(seg) {
    return Math.max(seg.clearFrom ?? 0, seg.length - Math.max(34, this.p.speed * 2.3));
  }

  // Bij een bocht wordt een schuine veeg eerder als links/rechts gelezen.
  inTurnZone() {
    const p = this.p;
    return this.state === 'playing' && p.dist >= this.turnZoneStart(p.seg) - 4;
  }

  jump() {
    const p = this.p;
    if (p.air) return;
    const perk = p.horse.perk?.jump || 0;
    const T = JUMP_TIME * (1 + perk);
    const H = JUMP_HEIGHT * (1 + perk * 0.6);
    p.g = (8 * H) / (T * T);
    p.vy = (4 * H) / T;
    p.air = true;
    p.duckT = 0;
    this.sound.jump();
  }

  duck() {
    const p = this.p;
    if (p.air) {
      p.vy = Math.min(p.vy, -16);
      p.duckQueued = true;
    } else {
      p.duckT = DUCK_TIME;
      this.sound.duck();
    }
  }

  doTurn(t) {
    const p = this.p;
    const w = this.world;
    const oldVisual = p.pos.clone();
    const oldYaw = p.yaw + p.yawCorr + p.antic;
    const overshoot = Math.max(0, p.dist - p.seg.length);
    const wasQueued = p.queuedTurn === t;
    const next = w.takeTurn(p.seg, t);
    p.seg = next;
    p.dist = overshoot;
    p.queuedTurn = null;
    // zachte overgang van positie en kijkrichting (inclusief het alvast indraaien)
    const logical = next.toWorld(p.dist, p.latX, 0);
    p.corr.copy(oldVisual).setY(0).sub(logical);
    p.yaw = yawOf(next.dir);
    p.antic = 0;
    p.lastSide = null;
    p.yawCorr = angleDiff(oldYaw, p.yaw);
    w.ensureAhead(next, p.dist);
    p.stats.turns++;
    if (!wasQueued) this.sound.turn();
  }

  giveShield(silent = false) {
    this.p.shield = true;
    this.p.shieldT = powerDuration('shield', this.save.upgrades.shield, this.p.horse);
    if (!silent) this.sound.powerup();
  }

  activatePowerup(type) {
    const p = this.p;
    const lvl = this.save.upgrades[type] || 0;
    if (type === 'shield') this.giveShield();
    else {
      p[type] = powerDuration(type, lvl, p.horse);
      this.sound.powerup();
    }
    p.stats.powerups++;
    this.ui.toast(POWERUPS[type].name + '!', POWERUPS[type].color);
  }

  // ---------- struikelen ----------
  stumble(kind) {
    const p = this.p;
    if (p.stumbleT > 0 || GOD) return;
    p.stumbleT = 0.6;
    p.stats.stumbles++;
    p.cleanStart = p.meters;
    this.shake = Math.max(this.shake, 0.25);
    this.sound.stumble();
    if (kind === 'mud') {
      this.sound.squelch();
      this.mudSplash(16);
    } else this.dustBurst(12);
    this.ui.toast(kind === 'mud' ? 'Vast in de modder!' : kind === 'rail' ? 'Balk geraakt!' : 'Struikel!', '#b5651d');
    if (this.chase.active) {
      // eerste keer: de stier zit je op de hielen; struikel je dan nóg een keer, dan ben je gepakt
      const c = this.chase;
      c.intro = 0;
      this.sound.bellow();
      if (c.gap < 2.5) this.caught();
      else c.gap = Math.max(1.3, c.gap - 4.6);
    }
  }

  caught() {
    if (GOD) {
      this.chase.gap = 8;
      return;
    }
    const p = this.p;
    if (p.shield) {
      p.shield = false;
      p.shieldT = 0;
      p.invuln = 1.2;
      this.chase.gap = 11;
      this.sound.shieldBreak();
      this.burst(p.pos, 0x6ab8ff, 30);
      this.ui.toast('De bodyprotector hield de stier tegen!', '#3a8fe0');
      return;
    }
    this.crash('caught');
  }

  // ---------- botsing / weigering ----------
  crash(reason, obstacle) {
    const p = this.p;
    if (GOD) {
      if (reason === 'turn') this.doTurn(p.seg.turn === 'T' ? 'L' : p.seg.turn);
      return;
    }
    if (p.shield && reason !== 'caught') {
      p.shield = false;
      p.shieldT = 0;
      p.invuln = 1.2;
      if (obstacle) {
        obstacle.alive = false;
        obstacle.mesh.visible = false;
      }
      if (reason === 'turn') this.doTurn(p.seg.turn === 'T' ? 'L' : p.seg.turn);
      this.sound.shieldBreak();
      this.burst(this.p.pos, 0x6ab8ff, 30);
      this.ui.toast('Bodyprotector beschermde je!', '#3a8fe0');
      return;
    }
    this.state = 'crashed';
    p.crashT = 0;
    p.crashReason = reason;
    p.crashObstacle = obstacle;
    p.air = false;
    p.y = 0;
    this.shake = 0.6;
    this.sound.crash();
    if (reason === 'caught') this.sound.bellow();
    this.ui.hideTurnHint();
    setTimeout(() => {
      if (this.state === 'crashed') this.gameOver();
    }, 1300);
  }

  continueCost() {
    return CONTINUE_BASE_COST * Math.pow(2, this.p.continues);
  }

  continueRun() {
    const cost = this.continueCost();
    if (this.save.coins < cost) return false;
    this.save.coins -= cost;
    save();
    const p = this.p;
    p.continues++;
    if (p.crashReason === 'turn') this.doTurn(p.seg.turn === 'T' ? 'L' : p.seg.turn);
    // ruim hindernissen vlak voor de speler op
    for (const o of p.seg.obstacles) {
      if (o.s > p.dist - 4 && o.s < p.dist + 40 && o.mesh) {
        o.alive = false;
        o.mesh.visible = false;
      }
    }
    if (this.chase.active) {
      this.chase.gap = 16;
      this.chase.intro = 0;
    }
    p.crashT = -1;
    p.invuln = 2.5;
    p.duckT = 0;
    p.stumbleT = 0;
    this.state = 'playing';
    this.last = performance.now();
    this.ui.showHud();
    this.ui.toast('Ga door!', '#2f6b3c');
    this.sound.powerup();
    return true;
  }

  gameOver() {
    const p = this.p;
    this.state = 'over';
    const s = this.save;
    const horseBonus = p.horse.perk?.coinBonus || 0;
    const earned = Math.round(p.coins * this.totalMult * (1 + horseBonus));
    const delta = earned - p.banked;
    p.banked = earned;
    s.coins += delta;
    s.lifetimeCoins += delta;
    s.stats.distance += Math.round(p.meters - (p.statsBanked.meters || 0));
    s.stats.jumps += p.stats.jumps - (p.statsBanked.jumps || 0);
    // opdrachten: laatste stand meenemen en totalen bijwerken
    this.updateStats(0);
    for (const m of this.missions.check(p.stats)) this.ui.toast(`Opdracht voltooid! +${m.reward}`, '#1d4fa0');
    const runDelta = {};
    for (const k of TOTAL_KEYS) {
      runDelta[k] = (p.stats[k] || 0) - (p.statsBanked[k] || 0);
      p.statsBanked[k] = p.stats[k] || 0;
    }
    const levelBefore = this.missions.level;
    const leveled = this.missions.bank(runDelta);
    const score = Math.floor(p.score);
    const prev = s.best[this.diff.id] || { score: 0, dist: 0 };
    const newBest = score > prev.score;
    s.best[this.diff.id] = { score: Math.max(prev.score, score), dist: Math.max(prev.dist, Math.floor(p.meters)) };
    // nieuwe moeilijkheid vrijspelen?
    const unlocked = [];
    for (const d of DIFFICULTIES) {
      if (!d.unlock || s.unlockedDifficulties.includes(d.id)) continue;
      const best = s.best[d.unlock.from]?.dist || 0;
      if (best >= d.unlock.dist) {
        s.unlockedDifficulties.push(d.id);
        unlocked.push(d);
      }
    }
    if (p.meters > 250) s.tutorialDone = true;
    save();
    this.ui.showGameOver({
      score, meters: Math.floor(p.meters), coins: p.coins, mult: this.totalMult, horseBonus, earned,
      newBest: newBest && score > 0, best: s.best[this.diff.id].score, unlocked,
      continueCost: this.continueCost(), canContinue: s.coins >= this.continueCost() && p.continues < 3,
      leveled, level: this.missions.level, levelBefore,
    });
  }

  // ---------- per frame ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    this.trackPerformance(dt);
    dt = Math.min(dt, 0.05);
    this.time += dt;

    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'crashed') {
      this.p.crashT += dt;
      this.p.speed *= Math.exp(-6 * dt);
      this.p.dist += this.p.speed * dt * 0.3;
    }

    this.updatePlayerTransform(dt);
    if (this.state === 'playing') this.updatePickups(dt);
    this.updateChaseVisual(dt);
    this.updateCamera(dt);
    this.updateSun();
    this.world.update(dt, this.time, this.p.pos, this.camera);
    this.distractions.update(dt, { playing: this.state === 'playing', meters: this.p.meters, playerPos: this.p.pos, yaw: this.p.yaw });
    this.dust.update(dt);
    this.splash.update(dt);
    this.sparkle.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // Automatisch de resolutie verlagen als het spel niet soepel loopt.
  trackPerformance(rawDt) {
    if (this.state !== 'playing' || rawDt > 0.25) return;
    const pf = this.perf;
    pf.acc += rawDt;
    pf.n++;
    if (pf.acc < 2) return;
    const avg = pf.acc / pf.n;
    pf.acc = 0;
    pf.n = 0;
    if (avg > 1 / 42 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      pf.good = 0;
    } else if (avg > 1 / 36 && this.quality !== 'laag') {
      // resolutie is al minimaal: dan schaduwen en detail omlaag (alleen voor deze sessie)
      const keepDpr = this.dpr;
      this.applyQuality(this.quality === 'hoog' ? 'normaal' : 'laag');
      this.dpr = Math.min(this.dpr, keepDpr);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      pf.good = 0;
    } else if (avg < 1 / 57 && this.dpr < this.maxDpr) {
      if (++pf.good >= 4) {
        this.dpr = Math.min(this.maxDpr, this.dpr + 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.resize();
        pf.good = 0;
      }
    } else pf.good = 0;
  }

  updateSun() {
    const p = this.p;
    const yaw = p.yaw + p.yawCorr;
    const texel = 64 / this.sun.shadow.mapSize.x;
    const cx = Math.round((p.pos.x - Math.sin(yaw) * 12) / texel) * texel;
    const cz = Math.round((p.pos.z - Math.cos(yaw) * 12) / texel) * texel;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + SUN_DIR.x * 90, SUN_DIR.y * 90, cz + SUN_DIR.z * 90);
  }

  updatePlaying(dt) {
    const p = this.p;
    const d = this.diff;
    p.time += dt;

    // snelheid
    const base = d.startSpeed + (d.maxSpeed - d.startSpeed) * (1 - Math.exp(-p.time / d.accelTime));
    const target = base * (p.inWater ? 0.82 : 1) * (p.spurt > 0 ? 1.4 : 1) * (p.stumbleT > 0 ? 0.72 : 1);
    p.speed += (target - p.speed) * (1 - Math.exp(-3 * dt));
    this.world.speedRef = p.speed;
    p.stumbleT = Math.max(0, p.stumbleT - dt);

    const step = p.speed * dt;
    p.dist += step;
    p.meters += step;
    p.score += step * this.totalMult;

    // mijlpalen verhogen de bonus-vermenigvuldiger
    if (p.meters >= p.nextMilestone) {
      p.nextMilestone += 500;
      if (p.bonus < 2) {
        p.bonus = Math.min(2, p.bonus + 0.25);
        this.ui.toast(`${Math.floor(p.meters / 100) * 100} m! Bonus ×${this.totalMult.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}`, '#f2b705');
        this.sound.powerup();
      }
    }

    // timers
    p.invuln = Math.max(0, p.invuln - dt);
    p.magnet = Math.max(0, p.magnet - dt);
    p.double = Math.max(0, p.double - dt);
    if (p.spurt > 0) {
      p.spurt = Math.max(0, p.spurt - dt);
      if (p.spurt === 0) p.invuln = Math.max(p.invuln, 1.5);
    }
    if (p.shield) {
      p.shieldT -= dt;
      if (p.shieldT <= 0) p.shield = false;
    }
    p.streakT -= dt;
    if (p.streakT <= 0) p.streak = 0;

    // bochten
    const seg = p.seg;
    if (!p.queuedTurn && p.lastSide && p.time - p.lastSide.time < 0.8 && seg.allows(p.lastSide.t) && p.dist >= this.turnZoneStart(seg)) {
      p.queuedTurn = p.lastSide.t;
      p.lastSide = null;
      this.sound.turn();
    }
    if (p.dist >= seg.length) {
      if (p.queuedTurn) this.doTurn(p.queuedTurn);
      else if (p.spurt > 0 || GOD) this.doTurn(seg.turn === 'T' ? (Math.random() < 0.5 ? 'L' : 'R') : seg.turn);
      else if (p.dist >= seg.length + CORNER / 2 + OVERRUN - 1.2) {
        this.crash('turn');
        return;
      }
    }
    const hintTurn = p.seg === seg && p.dist > this.turnZoneStart(seg) && (this.diff.hints || !this.save.tutorialDone);
    if (hintTurn) this.ui.showTurnHint(seg.turn, p.queuedTurn);
    else this.ui.hideTurnHint();

    const cur = p.seg;
    // segmenten achter ons opruimen en baan vooruit aanvullen
    if (p.dist > 30 && this.world.first !== p.seg) this.world.releaseBefore(p.seg);
    this.world.ensureAhead(p.seg, p.dist);

    // zijwaarts
    const targetLat = p.lane * LANE_WIDTH;
    p.latX += (targetLat - p.latX) * (1 - Math.exp(-13 * dt));
    if (Math.abs(targetLat - p.latX) < 0.15) p.fromLane = p.lane;

    // springen
    if (p.air) {
      p.vy -= p.g * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.air = false;
        this.sound.land();
        this.dustBurst(10);
        if (p.duckQueued) {
          p.duckQueued = false;
          p.duckT = DUCK_TIME;
          this.sound.duck();
        }
      }
    }
    p.duckT = Math.max(0, p.duckT - dt);

    // galopritme en hoefslagen
    p.prevPhase = p.phase;
    if (!p.air) {
      p.phase = (p.phase + dt * p.speed / 6.2) % 1;
      for (const b of HOOF_BEATS) {
        const crossed = p.prevPhase < b ? (p.phase >= b || p.phase < p.prevPhase) : (p.phase < p.prevPhase && p.phase >= b);
        if (crossed) {
          this.sound.hoof(0.5);
          if (!p.inWater) this.dustPuff();
        }
      }
    }

    // water
    const wasIn = p.inWater;
    p.inWater = !p.air && cur.waters.some(([a, b]) => p.dist > a && p.dist < b);
    if (p.inWater) {
      if (!wasIn) {
        this.sound.splash();
        this.splashBurst(18, 5);
        p.stats.splashes++;
      }
      p.splashT -= dt;
      if (p.splashT <= 0) {
        p.splashT = 0.06;
        this.splashBurst(2, 3);
      }
    }

    // spurt: automatisch springen/bukken/uitwijken
    if (p.spurt > 0) this.autoPilot();

    // botsingen en geslaagde sprongen
    for (const o of cur.obstacles) {
      if (!o.alive) continue;
      if (o.s - o.depth / 2 > p.dist + 1.3) break;
      if (o.s + o.depth / 2 < p.dist - 1.0) {
        if (!o.counted) this.obstacleCleared(o);
        continue;
      }
      if (p.latX + 0.36 < o.lat0 || p.latX - 0.36 > o.lat1) continue;
      o.inLane = true;
      if (o.hit || p.invuln > 0 || p.spurt > 0) continue;
      if (o.kind === 'jump') {
        // tijdens het wisselen van baan langs een hooibaal schampen = struikelen
        const narrow = o.lat1 - o.lat0 < LANE_WIDTH + 0.1;
        const oLat = (o.lat0 + o.lat1) / 2;
        if (narrow && p.y < o.height - 0.2 && Math.abs(targetLat - p.latX) > 0.3 && Math.abs(p.latX - oLat) > 0.6) {
          o.hit = true;
          const oLane = Math.round(oLat / LANE_WIDTH);
          p.lane = Math.max(-1, Math.min(1, p.latX < oLat ? oLane - 1 : oLane + 1));
          p.fromLane = p.lane;
          this.stumble('side');
          continue;
        }
        if (p.y < o.height - 0.7) return this.crash('obstacle', o);
        if (p.y < o.height - 0.2) {
          o.hit = true;
          this.stumble('rail');
        }
      } else if (o.kind === 'duck') {
        if (p.duckT <= 0 || p.y > 0.35) return this.crash('obstacle', o);
      } else if (o.kind === 'block') {
        // al wisselend van baan langs de zijkant schuren: terugstuiteren en struikelen
        const oLat = (o.lat0 + o.lat1) / 2;
        const sideHit = Math.abs(targetLat - p.latX) > 0.3 && Math.abs(p.latX - oLat) > 0.6;
        if (sideHit) {
          o.hit = true;
          const oLane = Math.round(oLat / LANE_WIDTH);
          p.lane = Math.max(-1, Math.min(1, p.latX < oLat ? oLane - 1 : oLane + 1));
          p.fromLane = p.lane;
          this.stumble('side');
        } else return this.crash('obstacle', o);
      } else if (o.kind === 'ditch') {
        const inner = o.depth / 2 - 0.35;
        if (p.y < 0.1 && p.dist + 0.4 > o.s - inner && p.dist - 0.4 < o.s + inner) return this.crash('obstacle', o);
      } else if (o.kind === 'mud') {
        if (p.y < 0.15 && Math.abs(p.dist - o.s) < o.depth / 2) {
          o.hit = true;
          this.stumble('mud');
        }
      }
    }

    // publiek juicht als je voorbij komt
    for (const c of cur.crowds) {
      if (!c.passed && Math.abs(c.s - p.dist) < 6) {
        c.passed = true;
        this.world.cheer = Math.max(this.world.cheer, 0.7);
        this.sound.cheer(0.6);
      }
    }

    this.updateChase(dt);
    this.updateStats(dt);

    // tutorial-hints
    if (!this.save.tutorialDone || this.diff.hints) {
      const next = cur.obstacles.find((o) => o.alive && o.s > p.dist && o.s - p.dist < 22);
      if (next && !p.hintShown[next.s]) {
        p.hintShown[next.s] = true;
        const inLane = p.latX + 0.36 > next.lat0 && p.latX - 0.36 < next.lat1;
        if (next.kind === 'jump' || next.kind === 'ditch' || next.kind === 'mud') this.ui.hint(inLane ? 'up' : null);
        else if (next.kind === 'duck') this.ui.hint('down');
        else if (next.kind === 'block' && inLane) this.ui.hint('side');
      }
    }

    this.ui.updateHud(this);
  }

  obstacleCleared(o) {
    const p = this.p;
    o.counted = true;
    if (!o.inLane || o.hit) return;
    if (o.kind === 'jump' || o.kind === 'ditch') {
      p.stats.jumps++;
      if (o.crowd) {
        p.stats.crowdJumps++;
        this.world.cheer = 1;
        this.sound.cheer(1);
      }
    } else if (o.kind === 'duck') p.stats.ducks++;
  }

  updateStats(dt) {
    const p = this.p;
    const st = p.stats;
    st.meters = p.meters;
    st.coins = p.coins;
    st.score = Math.floor(p.score);
    if (p.coins === 0) st.noCoinMeters = p.meters;
    st.cleanMeters = Math.max(st.cleanMeters, p.meters - p.cleanStart);
    if (this.chase.active) st.chaseMeters = p.meters - this.chase.startMeters;
    p.missionT -= dt;
    if (p.missionT <= 0) {
      p.missionT = 0.3;
      const done = this.missions.check(st);
      for (const m of done) {
        this.ui.toast(`Opdracht voltooid! +${m.reward}`, '#1d4fa0');
        this.sound.buy();
      }
      if (done.length && this.missions.allDone) setTimeout(() => this.ui.toast('Alle opdrachten klaar!', '#1d4fa0'), 900);
    }
  }

  // ---------- de stier ----------
  updateChase(dt) {
    const p = this.p;
    const c = this.chase;
    // pad bijhouden zodat de stier precies jouw spoor volgt
    const last = this.hist[this.hist.length - 1];
    if (!last || p.meters - last.m > 0.25) {
      this.hist.push({ m: p.meters, x: p.pos.x, z: p.pos.z, y: p.y, yaw: p.yaw + p.yawCorr, water: p.inWater });
      if (this.hist.length > 260) this.hist.shift();
    }
    if (!c.active) {
      if (p.meters >= c.start && !GOD) {
        c.active = true;
        c.startMeters = p.meters;
        c.gap = 9;
        c.intro = 2.6;
        this.sound.bellow();
        this.ui.toast('Pas op! Brutus de stier zit achter je aan!', '#d6362e');
      }
      return;
    }
    const m = p.meters - c.startMeters;
    // hoe verder je komt, hoe dichter de stier standaard achter je zit en hoe trager je uitloopt
    let baseGap = Math.max(3.3, 7.5 - m / 500);
    const recover = Math.max(0.3, 1.4 - m / 2500);
    const approach = 0.6 + m / 2000;
    // af en toe een uitval naar voren
    c.surgeT = (c.surgeT ?? 14) - dt;
    if (c.surgeT <= 0) {
      c.surgeT = Math.max(9, 24 - m / 300) + Math.random() * 6;
      c.surge = 3.2;
      this.sound.bellow();
    }
    if (c.surge > 0) {
      c.surge -= dt;
      baseGap = Math.max(2.8, baseGap - 3.2);
    }
    if (c.intro > 0) {
      c.intro -= dt;
      c.gap += (3.0 - c.gap) * (1 - Math.exp(-1.6 * dt));
    } else if (c.gap < baseGap) c.gap = Math.min(baseGap, c.gap + recover * dt);
    else c.gap = Math.max(baseGap, c.gap - approach * dt);
    if (p.inWater) c.gap = Math.max(1.3, c.gap - p.speed * 0.08 * dt);
    if (p.spurt > 0) c.gap = Math.min(16, c.gap + 7 * dt);
    if (c.gap < 3) c.close = true;
    if (c.close && c.gap > 8.5) {
      c.close = false;
      p.stats.escapes++;
    }
    // snuiven als hij dichtbij is
    c.snortT -= dt;
    if (c.gap < 4.5 && c.snortT <= 0) {
      c.snortT = 0.9 + Math.random() * 0.8;
      this.sound.snort();
    }
  }

  updateChaseVisual(dt) {
    const c = this.chase;
    const p = this.p;
    const bull = this.bull;
    const show = c.active && (this.state === 'playing' || this.state === 'crashed' || this.state === 'paused' || this.state === 'over');
    if (!show) {
      bull.root.visible = false;
      this.ui.setDanger?.(0);
      return;
    }
    if (this.state === 'crashed' && p.crashReason === 'caught') c.gap = Math.max(0.2, c.gap - dt * 4);
    const bm = p.meters - (c.gap + 1.0);
    const h = this.hist;
    if (!h.length || bm < h[0].m) {
      bull.root.visible = false;
      return;
    }
    let i = h.length - 1;
    while (i > 0 && h[i - 1].m > bm) i--;
    const a = h[Math.max(0, i - 1)], b = h[i];
    const t = b.m > a.m ? Math.min(1, Math.max(0, (bm - a.m) / (b.m - a.m))) : 1;
    bull.root.visible = c.gap < 14;
    bull.root.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    bull.root.rotation.y = a.yaw + angleDiff(b.yaw, a.yaw) * t;
    if (this.state === 'playing' || this.state === 'crashed') c.phase = (c.phase + dt * Math.max(4, p.speed) / 5.2) % 1;
    bull.update(dt, c.phase, 1);
    // stoom uit de neus en spetters
    c.steamT -= dt;
    if (bull.root.visible && c.steamT <= 0) {
      c.steamT = 0.12;
      bull.nose.getWorldPosition(tmpV2);
      const back = new THREE.Vector3(Math.sin(bull.root.rotation.y), 0.3, Math.cos(bull.root.rotation.y));
      this.dust.emit(tmpV2, back.multiplyScalar(2), { life: 0.5, size: 0.3, grow: 2, color: 0xf2f2f2, drag: 3 });
      if (b.water) this.splashAt(bull.root.position, 2, 3);
    }
    const danger = Math.max(0, Math.min(1, (5 - c.gap) / 3.5));
    this.ui.setDanger?.(this.state === 'playing' ? danger : 0);
  }

  autoPilot() {
    const p = this.p;
    const look = 4 + p.speed * 0.28;
    for (const o of p.seg.obstacles) {
      if (!o.alive || o.s < p.dist) continue;
      if (o.s - p.dist > look) break;
      const inLane = p.latX + 0.5 > o.lat0 && p.latX - 0.5 < o.lat1;
      if (!inLane) continue;
      if ((o.kind === 'jump' || o.kind === 'ditch' || o.kind === 'mud') && !p.air && o.s - p.dist < look * 0.7) this.jump();
      else if (o.kind === 'duck' && p.duckT <= 0) {
        p.duckT = DUCK_TIME;
      } else if (o.kind === 'block') {
        const blocked = new Set(p.seg.obstacles.filter((b) => b.alive && Math.abs(b.s - o.s) < 2 && b.kind === 'block').map((b) => Math.round((b.lat0 + b.lat1) / 2 / LANE_WIDTH)));
        const free = [-1, 0, 1].filter((l) => !blocked.has(l)).sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane));
        if (free.length) {
          p.fromLane = p.lane;
          p.lane = free[0];
        }
      }
    }
  }

  updatePickups(dt) {
    const p = this.p;
    const center = tmpV.copy(p.pos).setY(p.y + 1.3);
    const a = p.prevPos;
    const b = p.pos;
    const magR2 = p.magnet > 0 ? 13 * 13 : 0;
    for (const c of this.world.coins) {
      if (c.dead) continue;
      const dx = c.x - center.x;
      const dz = c.z - center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 400) continue;
      if (!c.mag && magR2 && d2 < magR2) c.mag = true;
      if (c.mag) {
        const dy = c.y - center.y;
        const len = Math.sqrt(d2 + dy * dy);
        const stepLen = Math.max(24, len * 9) * dt;
        if (len <= stepLen + 0.4) this.collectCoin(c);
        else {
          c.x -= (dx / len) * stepLen;
          c.y -= (dy / len) * stepLen;
          c.z -= (dz / len) * stepLen;
          c.scale = Math.max(0.5, Math.min(1, len / 4));
        }
        continue;
      }
      if (Math.abs(c.y - center.y) > 1.35) continue;
      if (distPointSeg2D(c.x, c.z, a.x, a.z, b.x, b.z) < 1.05) this.collectCoin(c);
    }
    for (const pu of this.world.powerups) {
      if (pu.dead) continue;
      if (Math.abs(pu.y - center.y) > 1.6) continue;
      if (distPointSeg2D(pu.x, pu.z, a.x, a.z, b.x, b.z) < 1.2) {
        pu.dead = true;
        this.scene.remove(pu.mesh);
        this.activatePowerup(pu.type);
        this.burst(tmpV2.set(pu.x, pu.y, pu.z), 0xffffff, 24);
      }
    }
  }

  collectCoin(c) {
    const p = this.p;
    c.dead = true;
    const v = p.double > 0 ? 2 : 1;
    p.coins += v;
    if (c.mag) p.stats.magnetCoins += v;
    p.score += 10 * v * this.totalMult;
    p.streak++;
    p.streakT = 0.6;
    this.sound.coin(p.streak);
    const pos = tmpV2.set(c.x, c.y, c.z);
    for (let i = 0; i < 4; i++) {
      this.sparkle.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), { life: 0.4, size: 0.35, color: 0xffe066, grow: -0.6 });
    }
  }

  // ---------- effecten ----------
  dustPuff() {
    const p = this.p;
    if (p.y > 0.1) return;
    const back = tmpV2.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    for (let i = 0; i < 2; i++) {
      const pos = p.pos.clone().addScaledVector(back, 0.6 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.1, (Math.random() - 0.5) * 0.7));
      this.dust.emit(pos, back.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3(0, 0.6 + Math.random(), 0)), { life: 0.7, size: 0.5, grow: 2.2, color: 0xc9a46c, drag: 2 });
    }
  }

  dustBurst(n) {
    for (let i = 0; i < n; i++) {
      const pos = this.p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.1, (Math.random() - 0.5) * 1.8));
      this.dust.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 4), { life: 0.8, size: 0.6, grow: 2, color: 0xc29a62 });
    }
  }

  mudSplash(n) {
    for (let i = 0; i < n; i++) {
      const pos = this.p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.15, (Math.random() - 0.5) * 2));
      this.splash.emit(pos, new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 3), { life: 0.6, size: 0.22, grow: 0.3, color: Math.random() < 0.5 ? 0x5a3d26 : 0x7a5434, drag: 0.5 });
    }
  }

  splashBurst(n, power) {
    this.splashAt(this.p.pos, n, power);
  }

  splashAt(at, n, power) {
    for (let i = 0; i < n; i++) {
      const pos = at.clone().setY(0).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.15, (Math.random() - 0.5) * 2));
      this.splash.emit(pos, new THREE.Vector3((Math.random() - 0.5) * power, 2 + Math.random() * power, (Math.random() - 0.5) * power * 0.6), {
        life: 0.5 + Math.random() * 0.3, size: 0.18 + Math.random() * 0.14, grow: 0.4, color: Math.random() < 0.5 ? 0xffffff : 0xbfe6ff, drag: 0.5,
      });
    }
  }

  burst(pos, color, n) {
    for (let i = 0; i < n; i++) {
      this.sparkle.emit(pos.clone().setY(pos.y + 1), new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 6, (Math.random() - 0.5) * 7), { life: 0.7, size: 0.45, color, grow: -0.5, drag: 2 });
    }
  }

  // ---------- positie en camera ----------
  updatePlayerTransform(dt) {
    const p = this.p;
    p.prevPos.copy(p.pos);
    p.corr.multiplyScalar(Math.exp(-9 * dt));
    p.yawCorr *= Math.exp(-7.5 * dt);
    p.seg.toWorld(p.dist, p.latX, 0, p.pos).add(p.corr);
    if (dt === 0) p.prevPos.copy(p.pos);

    // na een goede veeg alvast de bocht in draaien, zodat je direct reactie ziet
    let anticTarget = 0;
    if (p.queuedTurn && this.state === 'playing') {
      const toGo = p.seg.length - p.dist;
      anticTarget = (p.queuedTurn === 'L' ? 1 : -1) * 0.5 * Math.max(0.25, Math.min(1, 1 - toGo / 10));
    }
    p.antic += (anticTarget - p.antic) * (1 - Math.exp(-9 * dt));
    const yaw = p.yaw + p.yawCorr + p.antic;
    const lean = (p.lane * LANE_WIDTH - p.latX) / LANE_WIDTH;
    const h = this.horse;
    h.root.position.copy(p.pos).setY(p.y);
    h.root.rotation.y = yaw - lean * 0.18;

    const idle = this.state === 'menu' || this.state === 'showroom';
    h.update({
      dt, phase: p.phase, speed: p.speed, vy: p.vy, air: p.air, duck: p.duckT > 0, idle, stumble: p.stumbleT > 0.25,
      lean, crash: this.state === 'crashed' || (this.state === 'over' && p.crashT >= 0) ? p.crashT : -1,
    });
    if (this.state === 'over') p.crashT += dt;

    const sh = this.blob;
    sh.position.set(p.pos.x, 0.03, p.pos.z);
    sh.rotation.y = yaw;
    const sc = 1 / (1 + p.y * 0.35);
    sh.scale.set(1.5 * sc, 1, 3.0 * sc);
    sh.material.opacity = sc;

    this.bubble.visible = p.shield && this.state === 'playing';
    if (this.bubble.visible) {
      this.bubble.position.set(p.pos.x, p.y + 1.45, p.pos.z);
      this.bubble.rotation.y = yaw;
      this.bubble.material.opacity = 0.14 + Math.sin(this.time * 6) * 0.05 + (p.shieldT < 2 ? Math.max(0, Math.sin(this.time * 20)) * 0.1 : 0);
    }
    if (p.spurt > 0 && this.state === 'playing' && Math.random() < 0.7) {
      this.sparkle.emit(p.pos.clone().setY(p.y + 0.8 + Math.random() * 1.6).add(new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5))), new THREE.Vector3(0, 0.5, 0), { life: 0.5, size: 0.4, color: 0xb98cff, grow: -0.5 });
    }
    if (p.magnet > 0 && this.state === 'playing' && Math.random() < 0.25) {
      this.sparkle.emit(p.pos.clone().setY(p.y + 2.4), new THREE.Vector3((Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3), { life: 0.4, size: 0.3, color: 0xff7a6a, grow: -0.5 });
    }
  }

  updateCamera(dt) {
    const p = this.p;
    const yaw = p.yaw + p.yawCorr + p.antic;
    const fwd = tmpV.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (this.state === 'menu' || this.state === 'showroom') {
      const shop = this.state === 'showroom';
      const a = shop ? 0.95 + Math.sin(this.time * 0.25) * 0.35 : 0.6 + Math.sin(this.time * 0.18) * 0.5;
      const dist = shop ? 5.6 : 7.0;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      desiredPos.copy(p.pos)
        .addScaledVector(fwd, Math.cos(a) * dist)
        .addScaledVector(right, Math.sin(a) * dist)
        .setY(shop ? 2.1 : 2.5);
      desiredLook.copy(p.pos).setY(1.45);
      this.camK = Math.min(this.camK + dt * 2, 4);
    } else {
      const center = p.seg.toWorld(p.dist, p.latX * 0.55, 0, new THREE.Vector3()).add(p.corr);
      // als de stier dichtbij is, gaat de camera iets naar achteren zodat je hem ziet
      const danger = this.chase?.active ? Math.max(0, Math.min(1, (5.5 - this.chase.gap) / 3.5)) : 0;
      this.camDanger = (this.camDanger || 0) + (danger - (this.camDanger || 0)) * (1 - Math.exp(-3 * dt));
      const back = (this.portrait ? 7.4 : 6.6) + this.camDanger * 1.6;
      const up = (this.portrait ? 5.0 : 4.3) + this.camDanger * 0.3;
      desiredPos.copy(center).addScaledVector(fwd, -back).setY(up + p.y * 0.45);
      desiredLook.copy(center).addScaledVector(fwd, 9).setY(0.9 + p.y * 0.35);
      if (this.state === 'crashed' || this.state === 'over') desiredPos.addScaledVector(fwd, 1.2);
      this.camK = Math.min(this.camK + dt * 14, 40);
    }

    const k = 1 - Math.exp(-this.camK * dt);
    this.camPos.lerp(desiredPos, dt === 0 ? 1 : k);
    this.camLook.lerp(desiredLook, dt === 0 ? 1 : k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.35;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    this.camera.lookAt(this.camLook);
    this.applyViewShift(dt);
  }

  // Schuift het beeld omhoog/omlaag zodat het paard niet achter de menu's valt.
  applyViewShift(dt) {
    let target = 0;
    if (this.portrait && this.state === 'showroom') target = 0.2;
    else if (this.portrait && this.state === 'menu') target = -0.04;
    this.viewShift = (this.viewShift ?? target) + (target - (this.viewShift ?? target)) * (1 - Math.exp(-6 * dt));
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(this.viewShift) < 0.001) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, 0, this.viewShift * h, w, h);
  }

  get powerTimers() {
    const p = this.p;
    const out = [];
    const lv = this.save.upgrades;
    if (p.magnet > 0) out.push({ type: 'magnet', t: p.magnet, max: powerDuration('magnet', lv.magnet, p.horse) });
    if (p.double > 0) out.push({ type: 'double', t: p.double, max: powerDuration('double', lv.double, p.horse) });
    if (p.shield) out.push({ type: 'shield', t: p.shieldT, max: powerDuration('shield', lv.shield, p.horse) });
    if (p.spurt > 0) out.push({ type: 'spurt', t: p.spurt, max: powerDuration('spurt', lv.spurt, p.horse) });
    return out;
  }
}

function distPointSeg2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 1e-6 ? (apx * abx + apz * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - abx * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dz * dz);
}
