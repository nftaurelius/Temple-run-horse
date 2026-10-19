// Besturing: vegen op touchscreen, pijltjes/WASD op toetsenbord.

const SWIPE_MIN = 26; // pixels

export class Input {
  constructor(target) {
    this.handlers = [];
    this.start = null;
    this.fired = false;

    const isUi = (e) => e.target.closest && e.target.closest('button, a, input, .ui-block');

    target.addEventListener('touchstart', (e) => {
      if (isUi(e)) return;
      const t = e.changedTouches[0];
      this.start = { x: t.clientX, y: t.clientY, id: t.identifier };
      this.fired = false;
    }, { passive: true });

    target.addEventListener('touchmove', (e) => {
      if (isUi(e)) return;
      e.preventDefault();
      if (!this.start || this.fired) return;
      const t = [...e.changedTouches].find((c) => c.identifier === this.start.id);
      if (!t) return;
      this.trySwipe(t.clientX - this.start.x, t.clientY - this.start.y);
    }, { passive: false });

    target.addEventListener('touchend', () => {
      this.start = null;
    }, { passive: true });

    // Muis-vegen voor testen op een computer.
    target.addEventListener('mousedown', (e) => {
      if (isUi(e)) return;
      this.start = { x: e.clientX, y: e.clientY, mouse: true };
      this.fired = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.start?.mouse || this.fired) return;
      this.trySwipe(e.clientX - this.start.x, e.clientY - this.start.y);
    });
    window.addEventListener('mouseup', () => { this.start = null; });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const map = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'up', KeyW: 'up', Space: 'up',
        ArrowDown: 'down', KeyS: 'down',
        Escape: 'pause', KeyP: 'pause',
      };
      const action = map[e.code];
      if (action) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        this.emit(action);
      }
    });
  }

  trySwipe(dx, dy) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    this.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) this.emit(dx > 0 ? 'right' : 'left');
    else this.emit(dy > 0 ? 'down' : 'up');
  }

  on(fn) {
    this.handlers.push(fn);
  }

  emit(action) {
    for (const fn of this.handlers) fn(action);
  }
}
