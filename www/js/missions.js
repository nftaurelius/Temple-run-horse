// Opdrachten: per niveau drie opdrachten. Alles af = niveau omhoog = hogere vermenigvuldiger.

import { getSave, save } from './save.js';

export const LEVEL_TITLES = [
  'Beginner', 'Manegeruiter', 'Buitenrijder', 'Wedstrijdruiter', 'Eventingruiter',
  'Gevorderde', 'Kampioen', 'Olympiër', 'Legende',
];

// scope 'run' = in één rit, 'total' = bij elkaar opgeteld over meerdere ritten.
const TYPES = {
  dist: { scope: 'run', stat: 'meters', text: (n) => `Rijd ${fmt(n)} m in één rit` },
  coins: { scope: 'run', stat: 'coins', text: (n) => `Verzamel ${fmt(n)} munten in één rit` },
  jumps: { scope: 'run', stat: 'jumps', text: (n) => `Spring over ${n} hindernissen in één rit` },
  ducks: { scope: 'run', stat: 'ducks', text: (n) => `Buk ${n} keer onder een tak in één rit` },
  turns: { scope: 'run', stat: 'turns', text: (n) => `Neem ${n} bochten in één rit` },
  noCoin: { scope: 'run', stat: 'noCoinMeters', text: (n) => `Rijd ${fmt(n)} m zonder één munt te pakken` },
  score: { scope: 'run', stat: 'score', text: (n) => `Haal ${fmt(n)} punten in één rit` },
  chase: { scope: 'run', stat: 'chaseMeters', text: (n) => `Blijf ${fmt(n)} m voor de stier uit` },
  clean: { scope: 'run', stat: 'cleanMeters', text: (n) => `Rijd ${fmt(n)} m zonder te struikelen` },
  magnetCoins: { scope: 'run', stat: 'magnetCoins', text: (n) => `Pak ${n} munten met de magneet in één rit` },
  totalDist: { scope: 'total', stat: 'meters', text: (n) => `Rijd in totaal ${fmt(n)} m` },
  totalCoins: { scope: 'total', stat: 'coins', text: (n) => `Verzamel in totaal ${fmt(n)} munten` },
  powerups: { scope: 'total', stat: 'powerups', text: (n) => `Pak ${n} power-ups` },
  splashes: { scope: 'total', stat: 'splashes', text: (n) => `Plons ${n} keer door het water` },
  crowdJumps: { scope: 'total', stat: 'crowdJumps', text: (n) => `Spring ${n} keer vlak bij het publiek` },
  escapes: { scope: 'total', stat: 'escapes', text: (n) => `Ontsnap ${n} keer aan de stier` },
};

const SETS = [
  [['dist', 400], ['coins', 40], ['jumps', 5]],
  [['turns', 5], ['ducks', 4], ['powerups', 2]],
  [['dist', 800], ['splashes', 3], ['noCoin', 250]],
  [['chase', 300], ['coins', 120], ['crowdJumps', 5]],
  [['score', 6000], ['clean', 600], ['magnetCoins', 30]],
  [['dist', 1500], ['totalCoins', 2000], ['escapes', 3]],
  [['chase', 800], ['jumps', 40], ['splashes', 10]],
  [['dist', 2500], ['clean', 1200], ['powerups', 15]],
];

const GENERATED = [
  ['dist', 2500, 500], ['coins', 250, 50], ['jumps', 45, 8], ['turns', 18, 3], ['chase', 1200, 250],
  ['clean', 1400, 250], ['score', 15000, 4000], ['totalDist', 15000, 5000], ['powerups', 15, 5],
  ['crowdJumps', 20, 5], ['escapes', 6, 2], ['noCoin', 600, 100],
];

const nf = new Intl.NumberFormat('nl-NL');
function fmt(n) {
  return nf.format(Math.floor(n));
}

export function levelTitle(level) {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, level - 1)];
}

export function levelMult(level) {
  return Math.min(3, 1 + 0.1 * (level - 1));
}

function setForLevel(level) {
  if (level <= SETS.length) return SETS[level - 1];
  // na de vaste sets: willekeurig, steeds iets zwaarder
  const k = level - SETS.length;
  const pool = [...GENERATED].sort(() => Math.random() - 0.5);
  return pool.slice(0, 3).map(([type, base, step]) => [type, base + step * k]);
}

export function rewardFor(level) {
  return 75 * level;
}

export class Missions {
  constructor() {
    this.ensure();
  }

  get data() {
    return getSave().missions;
  }

  ensure() {
    const s = getSave();
    if (!s.missions || !s.missions.set?.length) {
      s.missions = { level: s.missions?.level || 1, set: [], totals: s.missions?.totals || {} };
      this.assign();
    }
  }

  assign() {
    const m = getSave().missions;
    m.set = setForLevel(m.level).map(([type, target]) => ({
      type, target, done: false, base: TYPES[type].scope === 'total' ? (m.totals[TYPES[type].stat] || 0) : 0,
    }));
    save();
  }

  get level() {
    return this.data.level;
  }

  get active() {
    return this.data.set;
  }

  text(m) {
    return TYPES[m.type].text(m.target);
  }

  // Huidige stand; run = statistieken van de lopende rit (nog niet bij de totalen opgeteld).
  // banked = de rit is al bij de totalen opgeteld (na afloop).
  progress(m, run = {}, banked = false) {
    if (m.done) return m.target;
    const t = TYPES[m.type];
    if (t.scope === 'run') return Math.min(m.target, run[t.stat] || 0);
    const total = (this.data.totals[t.stat] || 0) + (banked ? 0 : (run[t.stat] || 0)) - m.base;
    return Math.min(m.target, Math.max(0, total));
  }

  // Controleer tijdens een rit; geeft net voltooide opdrachten terug (en schrijft de beloning bij).
  check(run) {
    const done = [];
    for (const m of this.active) {
      if (m.done) continue;
      if (this.progress(m, run) >= m.target) {
        m.done = true;
        const reward = rewardFor(this.level);
        getSave().coins += reward;
        done.push({ text: this.text(m), reward });
      }
    }
    if (done.length) save();
    return done;
  }

  get allDone() {
    return this.active.every((m) => m.done);
  }

  // Aan het eind van een rit: totalen bijwerken en eventueel een niveau omhoog.
  bank(runDelta) {
    const t = this.data.totals;
    for (const [k, v] of Object.entries(runDelta)) t[k] = (t[k] || 0) + v;
    let leveled = false;
    if (this.allDone) {
      this.data.level++;
      this.assign();
      leveled = true;
    }
    save();
    return leveled;
  }
}
