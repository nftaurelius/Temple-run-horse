// Voortgang opslaan in localStorage (blijft bewaard in de beginscherm-app).

import { DIFFICULTIES } from './config.js';

const KEY = 'galop.save.v1';

function defaults() {
  return {
    coins: 0,
    lifetimeCoins: 0,
    selectedHorse: 'bruintje',
    selectedRider: 'sam',
    selectedDifficulty: 'pony',
    horses: ['bruintje'],
    riders: ['sam'],
    upgrades: { magnet: 0, double: 0, shield: 0, spurt: 0 },
    best: {}, // per moeilijkheid: { score, dist }
    unlockedDifficulties: DIFFICULTIES.filter((d) => !d.unlock).map((d) => d.id),
    settings: { sound: true, music: true, quality: 'hoog' },
    stats: { runs: 0, distance: 0, jumps: 0 },
    tutorialDone: false,
  };
}

let data = load();

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      ...base,
      ...parsed,
      upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
    };
  } catch {
    return base;
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // opslag niet beschikbaar (bijv. privémodus); spel werkt gewoon verder
  }
}

export function getSave() {
  return data;
}

export function resetSave() {
  data = defaults();
  save();
  return data;
}
