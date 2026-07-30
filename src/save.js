/* Lokales Speichern im localStorage. */

import { SAVE_KEY } from './config.js';
import { Game } from './game.js';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame(game) {
  try {
    const data = game.serialize();
    data.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Speichern fehlgeschlagen', err);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return Game.deserialize(JSON.parse(raw));
  } catch (err) {
    console.warn('Laden fehlgeschlagen', err);
    return null;
  }
}

export function saveInfo() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      savedAt: d.savedAt,
      time: d.time || 0,
      buildings: (d.buildings || []).length,
      units: (d.units || []).length,
      wave: d.waveNumber || 0,
    };
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
