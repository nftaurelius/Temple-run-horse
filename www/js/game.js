// Spellogica: de ruiter besturen, botsingen, munten, power-ups, camera en de spelstatus.

import * as THREE from './lib/three.module.min.js';
import {
  LANE_WIDTH, CORNER, JUMP_HEIGHT, JUMP_TIME, DUCK_TIME, DIFFICULTIES, POWERUPS,
  CONTINUE_BASE_COST, powerDuration, difficultyById, horseById, riderById,
} from './config.js';
import { World, yawOf } from './world.js';
import { HorseRider, HOOF_BEATS } from './horse.js';
import { Particles } from './effects.js';
import { getSave, save } from './save.js';
import { shadowTexture } from './textures.js';

const params = new URLSearchParams(location.search);
const GOD = params.has('god');

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

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

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd4e9f0, 50, 175);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);

    const hemi = new THREE.HemisphereLight(0xe2f1ff, 0x55703a, 1.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
    sun.position.set(0.45, 1, 0.35);
    this.scene.add(sun);

    this.world = new World(this.scene);
    this.horse = new HorseRider(horseById(this.save.selectedHorse), riderById(this.save.selectedRider));
    this.scene.add(this.horse.root);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.renderOrder = 1;
    this.shadow = shadow;
    this.scene.add(shadow);

    const bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x6ab8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    bubble.scale.set(1.25, 1.6, 1.9);
    bubble.visible = false;
    this.bubble = bubble;
    this.scene.add(bubble);

    this.dust = new Particles(this.scene, { count: 220, gravity: 1.2 });
    this.splash = new Particles(this.scene, { count: 260, gravity: -14 });
    this.sparkle = new Particles(this.scene, { count: 160, additive: true, gravity: 2 });

    this.state = 'menu';
    this.camPos = new THREE.Vector3(6, 3, 6);
    this.camLook = new THREE.Vector3(0, 1.3, 0);
    this.camK = 4;
    this.shake = 0;
    this.time = 0;
    this.last = performance.now();
    this.showroom = null; // 'stable' | 'riders' | null

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

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // in portret iets breder kijken zodat alle drie de banen in beeld zijn
    this.camera.fov = w < h ? 70 : 58;
    this.camera.updateProjectionMatrix();
    const px = h * this.renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    for (const p of [this.dust, this.splash, this.sparkle]) p.setScale(px);
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
      seg, dist: 0, lane: 0, latX: 0, y: 0, vy: 0, air: false, duckT: 0, duckQueued: false,
      speed: this.diff.startSpeed, time: 0, meters: 0, phase: 0, prevPhase: 0,
      coins: 0, score: 0, bonus: 0, nextMilestone: 500, streak: 0, streakT: 0,
      queuedTurn: null, inWater: false, invuln: 0, crashT: -1, crashReason: null, crashObstacle: null,
      magnet: 0, double: 0, shield: false, shieldT: 0, spurt: 0,
      continues: 0, banked: 0, bestBefore: this.save.best[this.diff.id]?.score || 0,
      corr: new THREE.Vector3(), yawCorr: 0, yaw: yawOf(seg.dir),
      pos: new THREE.Vector3(), prevPos: new THREE.Vector3(),
      horse: horseCfg, jumps: 0, splashT: 0, hintShown: {},
    };
    if (horseCfg.perk?.startShield) this.giveShield(true);
    if (horseCfg.perk?.startMagnet) this.p.magnet = powerDuration('magnet', this.save.upgrades.magnet, horseCfg);
    this.dust.clear();
    this.splash.clear();
    this.sparkle.clear();
    this.updatePlayerTransform(0);
  }

  get totalMult() {
    return this.diff.mult * (1 + this.p.bonus);
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
    this.ui.showPause();
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
      const window = 13 + p.speed * 0.4;
      if (p.seg.allows(t) && p.dist > p.seg.length - window) {
        if (p.dist >= p.seg.length) this.doTurn(t);
        else p.queuedTurn = t;
        this.ui.hideTurnHint();
        return;
      }
      const nl = Math.max(-1, Math.min(1, p.lane + (t === 'L' ? -1 : 1)));
      if (nl !== p.lane) {
        p.lane = nl;
        this.sound.lane();
      }
    } else if (action === 'up') {
      this.jump();
    } else if (action === 'down') {
      this.duck();
    }
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
    p.jumps++;
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
    const oldYaw = p.yaw + p.yawCorr;
    const overshoot = Math.max(0, p.dist - p.seg.length);
    const next = w.takeTurn(p.seg, t);
    p.seg = next;
    p.dist = overshoot;
    p.queuedTurn = null;
    // zachte overgang van positie en kijkrichting
    const logical = next.toWorld(p.dist, p.latX, 0);
    p.corr.copy(oldVisual).setY(0).sub(logical);
    p.yaw = yawOf(next.dir);
    p.yawCorr = angleDiff(oldYaw, p.yaw);
    w.ensureAhead(next, p.dist);
    this.sound.turn();
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
    this.ui.toast(POWERUPS[type].name + '!', POWERUPS[type].color);
  }

  // ---------- botsing / weigering ----------
  crash(reason, obstacle) {
    const p = this.p;
    if (GOD) {
      if (reason === 'turn') this.doTurn(p.seg.turn === 'T' ? 'L' : p.seg.turn);
      return;
    }
    if (p.shield) {
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
      if (o.s > p.dist - 4 && o.s < p.dist + 40) {
        o.alive = false;
        o.mesh.visible = false;
      }
    }
    p.crashT = -1;
    p.invuln = 2.5;
    p.duckT = 0;
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
    s.stats.distance += Math.round(p.meters - (p.metersBanked || 0));
    p.metersBanked = p.meters;
    s.stats.jumps += p.jumps - (p.jumpsBanked || 0);
    p.jumpsBanked = p.jumps;
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
    });
  }

  // ---------- per frame ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
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
    this.updateCamera(dt);
    this.world.update(dt, this.time, this.p.pos, this.camera);
    this.dust.update(dt);
    this.splash.update(dt);
    this.sparkle.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updatePlaying(dt) {
    const p = this.p;
    const d = this.diff;
    p.time += dt;

    // snelheid
    const base = d.startSpeed + (d.maxSpeed - d.startSpeed) * (1 - Math.exp(-p.time / d.accelTime));
    const target = base * (p.inWater ? 0.82 : 1) * (p.spurt > 0 ? 1.4 : 1);
    p.speed += (target - p.speed) * (1 - Math.exp(-3 * dt));
    this.world.speedRef = p.speed;

    const step = p.speed * dt;
    p.dist += step;
    p.meters += step;
    p.score += step * this.totalMult;

    // mijlpalen verhogen de bonus-vermenigvuldiger
    if (p.meters >= p.nextMilestone) {
      p.nextMilestone += 500;
      if (p.bonus < 2) {
        p.bonus = Math.min(2, p.bonus + 0.25);
        this.ui.toast(`${Math.floor(p.meters / 100) * 100} m! Bonus ×${this.totalMult.toFixed(2).replace(/\.?0+$/, '')}`, '#f2b705');
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
    const window = 13 + p.speed * 0.4;
    if (p.dist >= seg.length) {
      if (p.queuedTurn) this.doTurn(p.queuedTurn);
      else if (p.spurt > 0 || GOD) this.doTurn(seg.turn === 'T' ? (Math.random() < 0.5 ? 'L' : 'R') : seg.turn);
      else if (p.dist >= seg.length + CORNER / 2 - 1.1) {
        this.crash('turn');
        return;
      }
    }
    const hintTurn = p.seg === seg && p.dist > seg.length - window && !p.queuedTurn && (this.diff.hints || !this.save.tutorialDone);
    if (hintTurn) this.ui.showTurnHint(seg.turn);
    else this.ui.hideTurnHint();

    const cur = p.seg;
    // segmenten achter ons opruimen en baan vooruit aanvullen
    if (p.dist > 30 && this.world.first !== p.seg) this.world.releaseBefore(p.seg);
    this.world.ensureAhead(p.seg, p.dist);

    // zijwaarts
    const targetLat = p.lane * LANE_WIDTH;
    p.latX += (targetLat - p.latX) * (1 - Math.exp(-13 * dt));

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
      }
      p.splashT -= dt;
      if (p.splashT <= 0) {
        p.splashT = 0.06;
        this.splashBurst(2, 3);
      }
    }

    // spurt: automatisch springen/bukken/uitwijken
    if (p.spurt > 0) this.autoPilot();

    // botsingen
    if (p.invuln <= 0 && p.spurt <= 0) {
      for (const o of cur.obstacles) {
        if (!o.alive) continue;
        if (o.s - o.depth / 2 > p.dist + 1.3) break;
        if (o.s + o.depth / 2 < p.dist - 1.0) continue;
        if (p.latX + 0.36 < o.lat0 || p.latX - 0.36 > o.lat1) continue;
        let hit = false;
        if (o.kind === 'jump') hit = p.y < o.height - 0.25;
        else if (o.kind === 'duck') hit = p.duckT <= 0 || p.y > 0.35;
        else if (o.kind === 'block') hit = true;
        else if (o.kind === 'ditch') {
          const inner = o.depth / 2 - 0.35;
          hit = p.y < 0.1 && p.dist + 0.4 > o.s - inner && p.dist - 0.4 < o.s + inner;
        }
        if (hit) {
          this.crash('obstacle', o);
          return;
        }
      }
    }

    // tutorial-hints
    if (!this.save.tutorialDone || this.diff.hints) {
      const next = cur.obstacles.find((o) => o.alive && o.s > p.dist && o.s - p.dist < 22);
      if (next && !p.hintShown[next.s]) {
        p.hintShown[next.s] = true;
        const inLane = p.latX + 0.36 > next.lat0 && p.latX - 0.36 < next.lat1;
        if (next.kind === 'jump' || next.kind === 'ditch') this.ui.hint(inLane ? 'up' : null);
        else if (next.kind === 'duck') this.ui.hint('down');
        else if (next.kind === 'block' && inLane) this.ui.hint('side');
      }
    }

    this.ui.updateHud(this);
  }

  autoPilot() {
    const p = this.p;
    const look = 4 + p.speed * 0.28;
    for (const o of p.seg.obstacles) {
      if (!o.alive || o.s < p.dist) continue;
      if (o.s - p.dist > look) break;
      const inLane = p.latX + 0.5 > o.lat0 && p.latX - 0.5 < o.lat1;
      if (!inLane) continue;
      if ((o.kind === 'jump' || o.kind === 'ditch') && !p.air && o.s - p.dist < look * 0.7) this.jump();
      else if (o.kind === 'duck' && p.duckT <= 0) {
        p.duckT = DUCK_TIME;
      } else if (o.kind === 'block') {
        const blocked = new Set(p.seg.obstacles.filter((b) => b.alive && Math.abs(b.s - o.s) < 2 && b.kind === 'block').map((b) => Math.round((b.lat0 + b.lat1) / 2 / LANE_WIDTH)));
        const free = [-1, 0, 1].filter((l) => !blocked.has(l)).sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane));
        if (free.length) p.lane = free[0];
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

  splashBurst(n, power) {
    for (let i = 0; i < n; i++) {
      const pos = this.p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.15, (Math.random() - 0.5) * 2));
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

    const yaw = p.yaw + p.yawCorr;
    const lean = (p.lane * LANE_WIDTH - p.latX) / LANE_WIDTH;
    const h = this.horse;
    h.root.position.copy(p.pos).setY(p.y);
    h.root.rotation.y = yaw - lean * 0.18;

    const idle = this.state === 'menu' || this.state === 'showroom';
    h.update({
      dt, phase: p.phase, speed: p.speed, vy: p.vy, air: p.air, duck: p.duckT > 0, idle,
      lean, crash: this.state === 'crashed' || (this.state === 'over' && p.crashT >= 0) ? p.crashT : -1,
    });
    if (this.state === 'over') p.crashT += dt;

    const sh = this.shadow;
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
    const yaw = p.yaw + p.yawCorr;
    const fwd = tmpV.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (this.state === 'menu' || this.state === 'showroom') {
      const shop = this.state === 'showroom';
      const a = shop ? 0.95 + Math.sin(this.time * 0.25) * 0.35 : 0.6 + Math.sin(this.time * 0.18) * 0.5;
      const dist = shop ? 5.6 : 6.4;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      desiredPos.copy(p.pos)
        .addScaledVector(fwd, Math.cos(a) * dist)
        .addScaledVector(right, Math.sin(a) * dist)
        .setY(shop ? 2.1 : 2.5);
      desiredLook.copy(p.pos).setY(1.45);
      this.camK = Math.min(this.camK + dt * 2, 4);
    } else {
      const center = p.seg.toWorld(p.dist, p.latX * 0.55, 0, new THREE.Vector3()).add(p.corr);
      const back = this.portrait ? 7.4 : 6.6;
      const up = this.portrait ? 5.0 : 4.3;
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

  // Positie van de bochtwaarschuwing, beschikbaar voor de HUD.
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
