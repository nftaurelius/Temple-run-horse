// Spelinstellingen, paarden, ruiters, moeilijkheden en upgrades.

export const LANE_WIDTH = 2.1;
export const LANES = [-1, 0, 1];
export const TRACK_HALF = LANE_WIDTH * 1.5 + 0.35; // halve breedte van het pad
export const CORNER = TRACK_HALF * 2; // breedte van een bochtvak
export const OVERRUN = 2.6; // extra uitloop voorbij de bocht voordat de haag komt

export const JUMP_HEIGHT = 2.0;
export const JUMP_TIME = 0.78;
export const DUCK_TIME = 0.75;

// Moeilijkheden: hoger = sneller en meer hindernissen, maar een hogere vermenigvuldiger.
export const DIFFICULTIES = [
  {
    id: 'pony', name: 'Pony', label: 'Makkelijk', mult: 1,
    startSpeed: 13, maxSpeed: 22, accelTime: 110, gap: [1.9, 1.35], density: 0.55,
    hints: true, unlock: null,
  },
  {
    id: 'ruiter', name: 'Ruiter', label: 'Normaal', mult: 1.5,
    startSpeed: 15, maxSpeed: 26, accelTime: 100, gap: [1.65, 1.1], density: 0.7,
    hints: false, unlock: null,
  },
  {
    id: 'eventing', name: 'Eventing', label: 'Moeilijk', mult: 2,
    startSpeed: 17, maxSpeed: 30, accelTime: 90, gap: [1.45, 0.95], density: 0.82,
    hints: false, unlock: { from: 'ruiter', dist: 1000 },
  },
  {
    id: 'olympisch', name: 'Olympisch', label: 'Expert', mult: 3,
    startSpeed: 19, maxSpeed: 34, accelTime: 80, gap: [1.3, 0.85], density: 0.9,
    hints: false, unlock: { from: 'eventing', dist: 1500 },
  },
  {
    id: 'kampioen', name: 'Kampioen', label: 'Legendarisch', mult: 5,
    startSpeed: 21, maxSpeed: 38, accelTime: 70, gap: [1.15, 0.78], density: 1,
    hints: false, unlock: { from: 'olympisch', dist: 2000 },
  },
];

// Paarden. Kleuren zijn hex; `perk` geeft een klein voordeel.
export const HORSES = [
  {
    id: 'bruintje', name: 'Bruintje', breed: 'Bruin', price: 0,
    coat: 0x7a4524, mane: 0x1d1410, legs: 0x1d1410, muzzle: 0x2a1c16, hoof: 0x2b2420,
    perk: null, perkText: 'Betrouwbare allrounder',
  },
  {
    id: 'vos', name: 'Vonk', breed: 'Vos', price: 750,
    coat: 0xb4582a, mane: 0x8e3c18, legs: 0xf4efe6, muzzle: 0x8a4a2c, hoof: 0x3a3029, blaze: 0xf4efe6,
    perk: { coinBonus: 0.1 }, perkText: '+10% munten',
  },
  {
    id: 'parel', name: 'Zwarte Parel', breed: 'Fries', price: 2000,
    coat: 0x16151a, mane: 0x0c0b0e, legs: 0x16151a, muzzle: 0x26242a, hoof: 0x101012, longMane: true, feathers: true,
    perk: { jump: 0.15 }, perkText: 'Springt hoger en langer',
  },
  {
    id: 'schimmel', name: 'Zilver', breed: 'Schimmel', price: 4000,
    coat: 0xd9d6d0, mane: 0xf3f1ec, legs: 0x9a9690, muzzle: 0x6d6a66, hoof: 0x55524e, dapples: true,
    perk: { magnet: 3 }, perkText: 'Magneet duurt 3 sec langer',
  },
  {
    id: 'palomino', name: 'Goudvos', breed: 'Palomino', price: 7500,
    coat: 0xd9a74e, mane: 0xfaf3df, legs: 0xd9a74e, muzzle: 0x9c6f35, hoof: 0x4a3d2e, blaze: 0xfaf3df,
    perk: { coinBonus: 0.25 }, perkText: '+25% munten',
  },
  {
    id: 'appaloosa', name: 'Spikkel', breed: 'Appaloosa', price: 12000,
    coat: 0xeeeae2, mane: 0x2a2420, legs: 0x3b322b, muzzle: 0x55463a, hoof: 0x2b2420, spots: 0x2f2620,
    perk: { startShield: true }, perkText: 'Start met een bodyprotector',
  },
  {
    id: 'eenhoorn', name: 'Regenboog', breed: 'Eenhoorn', price: 30000,
    coat: 0xfbf8ff, mane: 'rainbow', legs: 0xfbf8ff, muzzle: 0xe8d9f0, hoof: 0xd4af37, horn: true, longMane: true,
    perk: { coinBonus: 0.5, startMagnet: true }, perkText: '+50% munten en start met magneet',
  },
];

// Ruiters (avatars). Puur cosmetisch.
export const RIDERS = [
  { id: 'sam', name: 'Sam', style: 'Klassiek', price: 0,
    jacket: 0x1f2f5c, vest: 0x1a1a1a, helmet: 0x1a1a1a, cover: 0x1f2f5c, breeches: 0xf2efe8, skin: 0xf0c8a0, hair: 0x5a3a22, pad: 0xf5f5f0 },
  { id: 'noor', name: 'Noor', style: 'Roze Sterren', price: 500,
    jacket: 0xe86fa8, vest: 0x5b2a7a, helmet: 0x5b2a7a, cover: 0xf7a8cd, breeches: 0xfaf5f8, skin: 0xf5d2b5, hair: 0xd9a95b, pad: 0xf7a8cd },
  { id: 'jesse', name: 'Jesse', style: 'Bosgroen', price: 1500,
    jacket: 0x2f6b3c, vest: 0x1e3d25, helmet: 0x1e3d25, cover: 0xe8c547, breeches: 0xf0ede4, skin: 0xc68b5e, hair: 0x2a1a10, pad: 0x2f6b3c },
  { id: 'oranje', name: 'Lotte', style: 'Team Oranje', price: 3000,
    jacket: 0xff7a00, vest: 0x1d2b5e, helmet: 0x1d2b5e, cover: 0xff7a00, breeches: 0xffffff, skin: 0xf3cfae, hair: 0xb5562a, pad: 0xff7a00 },
  { id: 'goud', name: 'Max', style: 'Gouden Kampioen', price: 8000,
    jacket: 0xd4af37, vest: 0x222222, helmet: 0xd4af37, cover: 0x222222, breeches: 0xffffff, skin: 0x8d5a3b, hair: 0x111111, pad: 0xd4af37 },
  { id: 'ridder', name: 'Sir Galop', style: 'Ridder', price: 20000, knight: true,
    jacket: 0x9aa3ad, vest: 0x6c7580, helmet: 0xc7ccd3, cover: 0xb3202a, breeches: 0x6c7580, skin: 0xf0c8a0, hair: 0x6b4a2a, pad: 0xb3202a },
];

// Power-ups en hun upgrade-niveaus.
export const POWERUPS = {
  magnet: { name: 'Hoefijzer-magneet', short: 'Magneet', color: '#e0423a', base: 7, perLevel: 2 },
  double: { name: 'Dubbele munten', short: '2× munten', color: '#f2b705', base: 8, perLevel: 2.5 },
  shield: { name: 'Bodyprotector', short: 'Schild', color: '#3a8fe0', base: 12, perLevel: 4 },
  spurt: { name: 'Galop-spurt', short: 'Spurt', color: '#8a4fd8', base: 4, perLevel: 1.2 },
};

export const UPGRADE_COSTS = [300, 900, 2200, 5000, 10000];
export const MAX_UPGRADE = UPGRADE_COSTS.length;

export const CONTINUE_BASE_COST = 150;

// Na zoveel meter breekt de stier los (per moeilijkheid).
export const CHASE_START = [350, 300, 250, 200, 160];

export function powerDuration(type, level, horse) {
  const p = POWERUPS[type];
  let d = p.base + p.perLevel * level;
  if (type === 'magnet' && horse?.perk?.magnet) d += horse.perk.magnet;
  return d;
}

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}
export function horseById(id) {
  return HORSES.find((h) => h.id === id) || HORSES[0];
}
export function riderById(id) {
  return RIDERS.find((r) => r.id === id) || RIDERS[0];
}
