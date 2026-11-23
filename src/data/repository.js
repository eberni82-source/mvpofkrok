import { seed } from './seed.js';

// Адаптер — единственная точка чтения/записи состояния.
// Позже заменяется ApiRepository без изменения бизнес-действий интерфейса.
const KEY = 'krok-lpr-mvp-v1';
const clone = (value) => structuredClone(value);

export class MockRepository {
  load() {
    try {
      const value = localStorage.getItem(KEY);
      if (!value) return clone(seed);
      const parsed = JSON.parse(value);
      return parsed && Array.isArray(parsed.people) && Array.isArray(parsed.relations) ? parsed : clone(seed);
    } catch { return clone(seed); }
  }
  save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  reset() { localStorage.removeItem(KEY); return clone(seed); }
}

export const initialData = () => clone(seed);
