// The design store: one immutable design, undo/redo history and change listeners.
// Edits that arrive in a burst (typing in a field, dragging the window) share one history
// step through a coalesce key.
import { setIn } from './design.js';

export class Store {
  constructor(design, { limit = 200 } = {}) {
    this.design = design;
    this.past = [];
    this.future = [];
    this.limit = limit;
    this.coalesceKey = null;
    this.listeners = new Set();
  }

  get() {
    return this.design;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason) {
    for (const fn of this.listeners) fn(this.design, reason);
  }

  commit(next, { coalesce = null, reason = 'edit' } = {}) {
    if (next === this.design) return;
    if (!coalesce || coalesce !== this.coalesceKey) {
      this.past.push(this.design);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.coalesceKey = coalesce;
    this.future = [];
    this.design = next;
    this.emit(reason);
  }

  set(path, value, opts) {
    this.commit(setIn(this.design, path, value), opts);
  }

  update(fn, opts) {
    this.commit(fn(this.design), opts);
  }

  // Ends a burst, so the next edit starts a new undo step.
  settle() {
    this.coalesceKey = null;
  }

  // Same design, but something the drawing depends on changed (a font file): listeners redraw, no undo step.
  refresh() {
    this.design = { ...this.design };
    this.emit('refresh');
  }

  // A different project: history starts over.
  replace(design) {
    this.design = design;
    this.past = [];
    this.future = [];
    this.coalesceKey = null;
    this.emit('replace');
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }

  undo() {
    if (!this.past.length) return;
    this.future.push(this.design);
    this.design = this.past.pop();
    this.coalesceKey = null;
    this.emit('undo');
  }

  redo() {
    if (!this.future.length) return;
    this.past.push(this.design);
    this.design = this.future.pop();
    this.coalesceKey = null;
    this.emit('redo');
  }
}
