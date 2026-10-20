// Alle schermen en knoppen (DOM). Praat met Game via eenvoudige methodes.

import { DIFFICULTIES, HORSES, RIDERS, POWERUPS, UPGRADE_COSTS, MAX_UPGRADE, powerDuration, horseById } from './config.js';
import { getSave, save, resetSave } from './save.js';
import { levelTitle, levelMult, rewardFor } from './missions.js';

const nf = new Intl.NumberFormat('nl-NL');
const fmt = (n) => nf.format(Math.floor(n));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const multText = (m) => '×' + (Math.round(m * 100) / 100).toString().replace('.', ',');

const ICONS = {
  magnet: '<svg viewBox="0 0 24 24"><path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0V3Z" /><path d="M5 3h4v3H5zM15 3h4v3h-4z" fill="#fff" opacity=".85"/></svg>',
  double: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="14" fill="currentColor">2×</text></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Z"/></svg>',
  spurt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
};
const ARROW_UP = '<svg viewBox="0 0 24 24"><path d="M12 20V5M6 11l6-6 6 6"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></svg>';
const ARROW_SIDE = '<svg viewBox="0 0 24 24"><path d="M4 12h16M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>';

export class UI {
  constructor(root) {
    this.root = root;
    this.screens = {};
    for (const s of root.querySelectorAll('.screen')) this.screens[s.id] = s;
    this.hud = {};
    this.shopKind = 'horses';
    this.shopSel = null;
    this.diffIndex = 0;
    this.toastTimer = 0;
  }

  $(name) {
    this.cache ??= {};
    return (this.cache[name] ??= [...this.root.querySelectorAll(`[data-bind="${name}"]`)]);
  }

  set(name, text) {
    for (const el of this.$(name)) if (el.textContent !== String(text)) el.textContent = text;
  }

  attach(game, sound) {
    this.game = game;
    this.sound = sound;
    this.save = getSave();
    this.diffIndex = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === this.save.selectedDifficulty));
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      this.sound.unlock();
      this.action(btn.dataset.action, btn);
    });
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    let framed = false;
    try { framed = window.self !== window.top; } catch { framed = true; }
    for (const el of this.$('installHint')) el.hidden = !(ios && !standalone && !framed);
    this.refreshToggles();
  }

  action(a, btn) {
    const g = this.game;
    switch (a) {
      case 'play': {
        const d = DIFFICULTIES[this.diffIndex];
        if (!this.save.unlockedDifficulties.includes(d.id)) {
          this.toast('Nog op slot', '#d6362e');
          return;
        }
        this.sound.click();
        g.startRun();
        break;
      }
      case 'diff-prev':
      case 'diff-next':
        this.diffIndex = Math.max(0, Math.min(DIFFICULTIES.length - 1, this.diffIndex + (a === 'diff-next' ? 1 : -1)));
        this.sound.click();
        this.applyDifficulty();
        break;
      case 'pause': g.pause(); break;
      case 'resume': this.sound.click(); g.resume(); break;
      case 'quit':
      case 'menu': this.sound.click(); g.toMenu(); break;
      case 'retry': this.sound.click(); g.startRun(); break;
      case 'continue':
        if (!g.continueRun()) this.toast('Niet genoeg munten', '#d6362e');
        break;
      case 'stable': this.openShop('horses'); break;
      case 'riders': this.openShop('riders'); break;
      case 'upgrades': this.openUpgrades(); break;
      case 'missions': this.openMissions(); break;
      case 'settings': this.openSettings(); break;
      case 'toggle-quality': {
        const order = ['hoog', 'normaal', 'laag'];
        const cur = this.save.settings.quality || 'hoog';
        this.save.settings.quality = order[(order.indexOf(cur) + 1) % order.length];
        save();
        g.applyQuality(this.save.settings.quality);
        this.refreshToggles();
        this.sound.click();
        break;
      }
      case 'back':
        this.sound.click();
        g.setAppearance();
        g.state = 'menu';
        this.showMenu();
        break;
      case 'shop-buy': this.shopBuy(); break;
      case 'shop-pick':
        this.shopSel = btn.dataset.id;
        this.sound.click();
        this.renderShop();
        break;
      case 'upgrade': this.buyUpgrade(btn.dataset.type); break;
      case 'toggle-sound':
        this.save.settings.sound = !this.save.settings.sound;
        this.sound.setSfx(this.save.settings.sound);
        save();
        this.refreshToggles();
        this.sound.click();
        break;
      case 'toggle-music':
        this.save.settings.music = !this.save.settings.music;
        this.sound.setMusic(this.save.settings.music);
        if (this.save.settings.music) this.sound.startMusic();
        save();
        this.refreshToggles();
        break;
      case 'reset':
        if (btn.dataset.armed) {
          this.save = resetSave();
          this.game.save = this.save;
          this.game.missions.ensure();
          this.game.setAppearance();
          this.diffIndex = 0;
          this.applyDifficulty();
          btn.textContent = 'Voortgang gewist';
          delete btn.dataset.armed;
          this.renderSettings();
        } else {
          btn.dataset.armed = '1';
          btn.textContent = 'Zeker weten? Tik nog een keer';
          setTimeout(() => {
            delete btn.dataset.armed;
            btn.textContent = 'Voortgang wissen';
          }, 3500);
        }
        break;
      default:
    }
  }

  only(...ids) {
    for (const [id, el] of Object.entries(this.screens)) el.hidden = !ids.includes(id);
  }

  // ---------- menu ----------
  showMenu() {
    this.only('menu');
    this.refreshCoins();
    this.applyDifficulty(false);
    this.refreshMissionStrip();
  }

  refreshMissionStrip() {
    const ms = this.game.missions;
    const done = ms.active.filter((m) => m.done).length;
    this.set('lvlNum', ms.level);
    this.set('lvlTitle', `Niveau ${ms.level} · ${levelTitle(ms.level)}`);
    this.set('lvlMult', multText(levelMult(ms.level)));
    this.set('msSummary', done === 3 ? 'Alles klaar! Rij een rit om omhoog te gaan' : `${done} van 3 opdrachten · tik voor details`);
    this.$('msDots')[0].innerHTML = ms.active.map((m) => `<i class="${m.done ? 'on' : ''}"></i>`).join('');
  }

  // Lijst met opdrachten; run = statistieken van de huidige rit (optioneel).
  renderMissions(el, run = null, compact = false, banked = false) {
    const ms = this.game.missions;
    el.innerHTML = ms.active.map((m) => {
      const prog = ms.progress(m, run || {}, banked);
      const pct = Math.round((prog / m.target) * 100);
      return `<div class="mission ${m.done ? 'done' : ''}">
        <span class="check">${m.done ? '✓' : ''}</span>
        <span class="mt"><span>${ms.text(m)}</span>
          <span class="bar"><i style="width:${pct}%"></i></span>
          ${compact ? '' : `<small>${fmt(prog)} / ${fmt(m.target)} · beloning <i class="coin-ico"></i> ${fmt(rewardFor(ms.level))}</small>`}
        </span>
      </div>`;
    }).join('');
  }

  openMissions() {
    this.sound.click();
    this.only('missions');
    this.refreshCoins();
    this.refreshMissionStrip();
    this.renderMissions(this.$('missionList')[0]);
  }

  setDanger(v) {
    const el = this.$('danger')[0];
    if (!el) return;
    const q = Math.round(v * 20) / 20;
    if (this.dangerV === q) return;
    this.dangerV = q;
    el.style.opacity = q;
    el.classList.toggle('pulse', q > 0.6);
  }

  applyDifficulty(store = true) {
    const d = DIFFICULTIES[this.diffIndex];
    const unlocked = this.save.unlockedDifficulties.includes(d.id);
    this.set('diffName', d.name);
    this.set('diffMult', multText(d.mult));
    const best = this.save.best[d.id];
    let sub = d.label + (best ? ` · beste ${fmt(best.score)}` : '');
    if (!unlocked) {
      const from = DIFFICULTIES.find((x) => x.id === d.unlock.from);
      sub = `Op slot: rijd ${fmt(d.unlock.dist)} m op ${from.name}`;
    }
    this.set('diffSub', sub);
    for (const el of this.$('diffSub')) el.classList.toggle('locked', !unlocked);
    const box = this.root.querySelector('.difficulty');
    box.classList.toggle('locked', !unlocked);
    this.root.querySelector('[data-action="diff-prev"]').disabled = this.diffIndex === 0;
    this.root.querySelector('[data-action="diff-next"]').disabled = this.diffIndex === DIFFICULTIES.length - 1;
    const play = this.root.querySelector('[data-action="play"] span');
    play.textContent = unlocked ? 'Start rit' : 'Op slot';
    if (unlocked && store) {
      this.save.selectedDifficulty = d.id;
      save();
    }
    if (unlocked) {
      this.game.setDifficulty(d.id);
      if (this.game.state === 'menu') this.game.resetRun();
    }
  }

  refreshCoins() {
    this.set('coins', fmt(this.save.coins));
  }

  refreshToggles() {
    const s = this.save.settings;
    for (const el of this.$('soundToggle')) {
      el.textContent = `Geluid: ${s.sound ? 'aan' : 'uit'}`;
      el.classList.toggle('off', !s.sound);
    }
    for (const el of this.$('musicToggle')) {
      el.textContent = `Muziek: ${s.music ? 'aan' : 'uit'}`;
      el.classList.toggle('off', !s.music);
    }
    for (const el of this.$('qualityToggle')) el.textContent = `Graphics: ${s.quality || 'hoog'}`;
  }

  // ---------- HUD ----------
  showHud() {
    this.only('hud');
    this.hud = {};
    this.hideTurnHint();
  }

  showTutorial(on) {
    if (on) setTimeout(() => this.hint('start'), 600);
  }

  updateHud(game) {
    const p = game.p;
    const h = this.hud;
    const score = Math.floor(p.score);
    if (h.score !== score) this.set('score', fmt((h.score = score)));
    const m = Math.floor(p.meters);
    if (h.m !== m) this.set('meters', `${fmt((h.m = m))} m`);
    if (h.coins !== p.coins) this.set('runCoins', fmt((h.coins = p.coins)));
    const mult = game.totalMult;
    if (h.mult !== mult) this.set('mult', multText((h.mult = mult)));

    const timers = game.powerTimers;
    const key = timers.map((t) => t.type).join(',');
    const box = this.$('powerups')[0];
    if (h.puKey !== key) {
      h.puKey = key;
      box.innerHTML = timers.map((t) => `<div class="pu" data-type="${t.type}" style="--c:${POWERUPS[t.type].color}"><span>${ICONS[t.type]}</span></div>`).join('');
    }
    for (const t of timers) {
      const el = box.querySelector(`[data-type="${t.type}"]`);
      if (el) el.style.setProperty('--p', Math.max(0, t.t / t.max).toFixed(3));
    }
  }

  toast(text, color = '#3f8f3a') {
    const box = this.$('toasts')[0];
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 1900);
  }

  showTurnHint(turn, chosen = null) {
    const el = this.$('turnHint')[0];
    const text = chosen
      ? (chosen === 'L' ? '◀ Bocht links ✓' : 'Bocht rechts ▶ ✓')
      : turn === 'L' ? '◀ Bocht links' : turn === 'R' ? 'Bocht rechts ▶' : '◀ Kies een kant ▶';
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('ok', !!chosen);
    el.hidden = false;
  }

  hideTurnHint() {
    const el = this.$('turnHint')[0];
    if (el && !el.hidden) el.hidden = true;
  }

  hint(kind) {
    const el = this.$('tutHint')[0];
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const map = {
      start: [ARROW_SIDE, touch ? 'Veeg links of rechts om te sturen' : 'Pijltjes links/rechts om te sturen', 'side'],
      up: [ARROW_UP, touch ? 'Veeg omhoog om te springen' : 'Pijltje omhoog om te springen', 'up'],
      down: [ARROW_DOWN, touch ? 'Veeg omlaag om te bukken' : 'Pijltje omlaag om te bukken', 'down'],
      side: [ARROW_SIDE, 'Wissel van baan!', 'side'],
    };
    if (!kind || !map[kind]) return;
    const [icon, text, cls] = map[kind];
    el.innerHTML = `${icon}<span>${text}</span>`;
    el.className = 'tut-hint ' + cls;
    el.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { el.hidden = true; }, kind === 'start' ? 2600 : 1700);
  }

  // ---------- pauze / einde ----------
  showPause(game) {
    this.refreshToggles();
    this.renderMissions(this.$('pauseMissions')[0], game?.p.stats, true);
    this.only('hud', 'pause');
  }

  showGameOver(r) {
    this.only('hud', 'over');
    this.hideTurnHint();
    this.$('tutHint')[0].hidden = true;
    const reason = this.game.p.crashReason;
    const kind = this.game.p.crashObstacle?.kind;
    const titles = { jump: 'Weigering!', duck: 'Au, een tak!', block: 'Botsing!', ditch: 'In de sloot!' };
    this.set('overTitle', reason === 'turn' ? 'Bocht gemist!' : reason === 'caught' ? 'Gepakt door de stier!' : titles[kind] || 'Gevallen!');
    this.setDanger(0);
    const lv = this.$('oLevel')[0];
    lv.hidden = !r.leveled;
    if (r.leveled) lv.textContent = `Niveau ${r.level} behaald: ${levelTitle(r.level)}! Nieuwe opdrachten wachten.`;
    this.renderMissions(this.$('overMissions')[0], r.leveled ? null : this.game.p.stats, true, true);
    this.set('oMeters', `${fmt(r.meters)} m`);
    this.set('oScore', fmt(r.score));
    this.set('oBest', fmt(r.best));
    this.set('oCoins', fmt(r.coins));
    this.set('oMult', multText(r.mult));
    this.$('oHorseRow')[0].hidden = !r.horseBonus;
    this.set('oHorse', `+${Math.round(r.horseBonus * 100)}%`);
    this.set('oEarned', fmt(r.earned));
    this.$('rosette')[0].hidden = !r.newBest;
    const um = this.$('oUnlock')[0];
    um.hidden = !r.unlocked.length;
    if (r.unlocked.length) um.textContent = `Vrijgespeeld: ${r.unlocked.map((d) => `${d.name} ${multText(d.mult)}`).join(', ')}!`;
    const cont = this.$('oContinue')[0];
    cont.hidden = !r.canContinue;
    cont.innerHTML = `Doorgaan <i class="coin-ico"></i> ${fmt(r.continueCost)}`;
    if (r.unlocked.length) {
      this.diffIndex = DIFFICULTIES.findIndex((d) => d.id === r.unlocked[r.unlocked.length - 1].id);
    }
    this.refreshCoins();
  }

  // ---------- stal en ruiters ----------
  openShop(kind) {
    this.sound.click();
    this.shopKind = kind;
    this.shopSel = kind === 'horses' ? this.save.selectedHorse : this.save.selectedRider;
    this.game.state = 'showroom';
    this.set('shopTitle', kind === 'horses' ? 'Stal' : 'Ruiters');
    this.only('shop');
    this.refreshCoins();
    this.renderShop(true);
  }

  renderShop(scroll = false) {
    const horses = this.shopKind === 'horses';
    const list = horses ? HORSES : RIDERS;
    const owned = horses ? this.save.horses : this.save.riders;
    const selected = horses ? this.save.selectedHorse : this.save.selectedRider;
    const row = this.$('shopList')[0];
    row.innerHTML = list.map((it) => {
      const isOwned = owned.includes(it.id);
      let bg = hex(horses ? it.coat : it.jacket);
      let mark = horses ? (it.mane === 'rainbow' ? 'conic-gradient(#ff4d6d,#ff9f1c,#ffe14d,#5ad66f,#4cc9f0,#9b5de5,#ff4d6d)' : hex(it.mane)) : hex(it.cover);
      if (horses && it.spots) bg = `radial-gradient(circle at 30% 40%, ${hex(it.spots)} 0 4px, transparent 5px), radial-gradient(circle at 65% 60%, ${hex(it.spots)} 0 5px, transparent 6px), radial-gradient(circle at 45% 75%, ${hex(it.spots)} 0 3px, transparent 4px), ${bg}`;
      const price = isOwned
        ? `<span class="pr owned">${it.id === selected ? 'Gekozen' : 'In bezit'}</span>`
        : `<span class="pr"><i class="coin-ico"></i>${fmt(it.price)}</span>`;
      return `<button class="pick ${it.id === this.shopSel ? 'active' : ''} ${isOwned ? '' : 'locked'}" data-action="shop-pick" data-id="${it.id}" role="option" aria-selected="${it.id === this.shopSel}">
        <span class="swatch" style="background:${bg};--m:${mark}"></span>
        <span class="nm">${it.name}</span>${price}</button>`;
    }).join('');
    if (scroll) {
      const active = row.querySelector('.active');
      if (active) row.scrollLeft = Math.max(0, active.offsetLeft - 16);
    }
    const it = list.find((x) => x.id === this.shopSel) || list[0];
    this.set('shopName', it.name);
    this.set('shopSub', horses ? it.breed : it.style);
    this.set('shopPerk', horses ? it.perkText : 'Eigen outfit, helm en zadeldek');
    const buy = this.$('shopBuy')[0];
    const isOwned = owned.includes(it.id);
    if (isOwned) {
      buy.textContent = it.id === selected ? 'Gekozen' : 'Kies';
      buy.disabled = it.id === selected;
    } else {
      buy.innerHTML = `<i class="coin-ico"></i> ${fmt(it.price)}`;
      buy.disabled = this.save.coins < it.price;
    }
    if (horses) this.game.previewAppearance(it.id, null);
    else this.game.previewAppearance(null, it.id);
  }

  shopBuy() {
    const horses = this.shopKind === 'horses';
    const list = horses ? HORSES : RIDERS;
    const owned = horses ? this.save.horses : this.save.riders;
    const it = list.find((x) => x.id === this.shopSel);
    if (!it) return;
    if (!owned.includes(it.id)) {
      if (this.save.coins < it.price) return;
      this.save.coins -= it.price;
      owned.push(it.id);
      this.sound.buy();
      this.toast(`${it.name} is van jou!`, '#f2b705');
    } else this.sound.click();
    if (horses) this.save.selectedHorse = it.id;
    else this.save.selectedRider = it.id;
    save();
    this.refreshCoins();
    this.renderShop();
    this.game.setAppearance();
  }

  // ---------- upgrades ----------
  openUpgrades() {
    this.sound.click();
    this.only('upgrades');
    this.refreshCoins();
    this.renderUpgrades();
  }

  renderUpgrades() {
    const list = this.$('upgradeList')[0];
    const horse = horseById(this.save.selectedHorse);
    list.innerHTML = Object.entries(POWERUPS).map(([type, pu]) => {
      const lvl = this.save.upgrades[type] || 0;
      const now = powerDuration(type, lvl, horse);
      const maxed = lvl >= MAX_UPGRADE;
      const next = maxed ? null : powerDuration(type, lvl + 1, horse);
      const cost = maxed ? 0 : UPGRADE_COSTS[lvl];
      const desc = type === 'shield'
        ? `Beschermt je ${Math.round(now)} sec tegen één botsing`
        : `Duurt ${String(Math.round(now * 10) / 10).replace('.', ',')} sec`;
      const pips = Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const btn = maxed
        ? '<button class="btn btn-gold" disabled>Max</button>'
        : `<button class="btn btn-gold" data-action="upgrade" data-type="${type}" ${this.save.coins < cost ? 'disabled' : ''}><i class="coin-ico"></i> ${fmt(cost)}</button>`;
      return `<div class="upg" style="--c:${pu.color}">
        <div class="ico">${ICONS[type]}</div>
        <h3>${pu.name}</h3>
        <p>${desc}${next ? ` → ${String(Math.round(next * 10) / 10).replace('.', ',')}` : ''}</p>
        <div class="row"><div class="pips">${pips}</div>${btn}</div>
      </div>`;
    }).join('');
  }

  buyUpgrade(type) {
    const lvl = this.save.upgrades[type] || 0;
    if (lvl >= MAX_UPGRADE) return;
    const cost = UPGRADE_COSTS[lvl];
    if (this.save.coins < cost) return;
    this.save.coins -= cost;
    this.save.upgrades[type] = lvl + 1;
    save();
    this.sound.buy();
    this.refreshCoins();
    this.renderUpgrades();
  }

  // ---------- instellingen ----------
  openSettings() {
    this.sound.click();
    this.only('settings');
    this.refreshToggles();
    this.renderSettings();
  }

  renderSettings() {
    const s = this.save;
    const el = this.$('statsSmall')[0];
    el.innerHTML = `Ritten: ${fmt(s.stats.runs)}<br>Totale afstand: ${fmt(s.stats.distance)} m<br>Sprongen: ${fmt(s.stats.jumps)}<br>Munten ooit verdiend: ${fmt(s.lifetimeCoins)}`;
  }
}
