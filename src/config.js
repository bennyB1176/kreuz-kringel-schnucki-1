/* Spielbalance, Definitionen für Ressourcen, Gebäude und Einheiten. */

export const TILE_W = 64;
export const TILE_H = 32;

export const MAP_W = 56;
export const MAP_H = 56;

export const SAVE_KEY = 'siedler-der-insel/save-v1';
export const AUTOSAVE_INTERVAL = 20; // Sekunden

export const TERRAIN = { WATER: 0, SAND: 1, GRASS: 2, DIRT: 3, ROCKGROUND: 4 };

export const RESOURCES = [
  { id: 'holz', name: 'Holz', icon: '🪵' },
  { id: 'stein', name: 'Stein', icon: '🪨' },
  { id: 'bretter', name: 'Bretter', icon: '🪚' },
  { id: 'quader', name: 'Quader', icon: '🧱' },
  { id: 'werkzeug', name: 'Werkzeug', icon: '🔨' },
  { id: 'nahrung', name: 'Nahrung', icon: '🍞' },
];
export const RES_ICON = Object.fromEntries(RESOURCES.map((r) => [r.id, r.icon]));
export const RES_NAME = Object.fromEntries(RESOURCES.map((r) => [r.id, r.name]));

export const START_RESOURCES = { holz: 120, stein: 60, bretter: 0, quader: 0, werkzeug: 4, nahrung: 60 };

export const BASE_POP_CAP = 4;
export const BASE_STORAGE = 250;

/* ---------------------------------------------------------------
   Gebäude
   job:       'holz' | 'stein' | 'nahrung' | 'produce' | null
   produce:   { in: {...}, out: {...}, time: Sekunden }  (pro Arbeiter)
   --------------------------------------------------------------- */
export const BUILDINGS = {
  lager: {
    id: 'lager', name: 'Lagerhaus', icon: '🏚️', size: 2, hp: 400, buildTime: 8,
    cost: { holz: 40, stein: 10 }, storage: 250, maxWorkers: 0, job: null,
    trains: ['siedler'],
    desc: 'Abgabestelle für Sammler, Lagerlimit +250, bildet Siedler aus.',
    color: '#8a6b3f', roof: '#5c3f22',
  },
  holzfaeller: {
    id: 'holzfaeller', name: 'Holzfällerhütte', icon: '🪓', size: 1, hp: 160, buildTime: 6,
    cost: { holz: 30 }, maxWorkers: 3, job: 'holz', workRadius: 12,
    desc: 'Arbeiter fällen Bäume in der Umgebung.',
    color: '#7d5c34', roof: '#4a6b2d',
  },
  steinbruch: {
    id: 'steinbruch', name: 'Steinbruch', icon: '⛏️', size: 1, hp: 180, buildTime: 8,
    cost: { holz: 35, stein: 10 }, maxWorkers: 3, job: 'stein', workRadius: 12,
    desc: 'Arbeiter bauen Felsen in der Umgebung ab.',
    color: '#7b7b74', roof: '#565651',
  },
  bauernhof: {
    id: 'bauernhof', name: 'Bauernhof', icon: '🌾', size: 2, hp: 200, buildTime: 10,
    cost: { holz: 45 }, maxWorkers: 2, job: 'produce',
    produce: { in: {}, out: { nahrung: 4 }, time: 6 },
    desc: 'Erzeugt Nahrung – nötig für neue Siedler und Soldaten.',
    color: '#9a7d43', roof: '#c8a83f',
  },
  haus: {
    id: 'haus', name: 'Wohnhaus', icon: '🏠', size: 1, hp: 150, buildTime: 8,
    cost: { holz: 40, stein: 15 }, popCap: 4, maxWorkers: 0, job: null,
    desc: 'Platz für 4 weitere Bewohner.',
    color: '#a8734a', roof: '#8d3f2e',
  },
  saegewerk: {
    id: 'saegewerk', name: 'Sägewerk', icon: '🪚', size: 2, hp: 220, buildTime: 12,
    cost: { holz: 60, stein: 25 }, maxWorkers: 2, job: 'produce',
    produce: { in: { holz: 2 }, out: { bretter: 1 }, time: 4 },
    desc: 'Veredelt Holz zu Brettern.',
    color: '#8b6a3c', roof: '#5f4a2a',
  },
  steinmetz: {
    id: 'steinmetz', name: 'Steinmetz', icon: '🧱', size: 2, hp: 240, buildTime: 12,
    cost: { holz: 40, stein: 45 }, maxWorkers: 2, job: 'produce',
    produce: { in: { stein: 2 }, out: { quader: 1 }, time: 5 },
    desc: 'Veredelt Stein zu Quadern.',
    color: '#83837b', roof: '#5d5d57',
  },
  schmiede: {
    id: 'schmiede', name: 'Schmiede', icon: '🔨', size: 1, hp: 260, buildTime: 14,
    cost: { bretter: 25, quader: 25 }, maxWorkers: 2, job: 'produce',
    produce: { in: { bretter: 1, quader: 1 }, out: { werkzeug: 1 }, time: 7 },
    desc: 'Fertigt Werkzeug für Handwerk und Waffen.',
    color: '#6c6157', roof: '#3d3630',
  },
  kaserne: {
    id: 'kaserne', name: 'Kaserne', icon: '🛡️', size: 2, hp: 400, buildTime: 16,
    cost: { bretter: 40, quader: 35, werkzeug: 5 }, maxWorkers: 0, job: null,
    trains: ['ritter'],
    desc: 'Bildet Ritter aus.',
    color: '#6f5b46', roof: '#7a3b32',
  },
  bogenstand: {
    id: 'bogenstand', name: 'Bogenschützenstand', icon: '🏹', size: 2, hp: 320, buildTime: 14,
    cost: { bretter: 35, quader: 20, werkzeug: 4 }, maxWorkers: 0, job: null,
    trains: ['bogen'],
    desc: 'Bildet Bogenschützen aus.',
    color: '#6a6b45', roof: '#3f5a2f',
  },
  turm: {
    id: 'turm', name: 'Wachturm', icon: '🗼', size: 1, hp: 500, buildTime: 12,
    cost: { bretter: 15, quader: 35 }, maxWorkers: 0, job: null,
    tower: { range: 7, damage: 9, rate: 1.2 },
    desc: 'Beschießt Feinde in der Umgebung automatisch.',
    color: '#8e8e86', roof: '#4d4d48',
  },
  mauer: {
    id: 'mauer', name: 'Mauer', icon: '🧱', size: 1, hp: 350, buildTime: 3,
    cost: { quader: 6 }, maxWorkers: 0, job: null, wall: true,
    desc: 'Blockiert den Weg von Angreifern.',
    color: '#9a9a90', roof: '#6d6d66',
  },
};

/* ---------------------------------------------------------------
   Einheiten
   --------------------------------------------------------------- */
export const UNITS = {
  /* Nahkampfreichweiten liegen über √2, damit auch diagonal angrenzende
     Ziele – etwa die Ecke eines mehrfeldrigen Gebäudes – erreichbar sind. */
  held: {
    id: 'held', name: 'Held', icon: '🦸', hp: 140, speed: 3.4, damage: 12, range: 1.5,
    attackRate: 0.9, gatherRate: 1.6, carry: 12, color: '#4a90e2', pop: 0,
  },
  siedler: {
    id: 'siedler', name: 'Siedler', icon: '🧍', hp: 60, speed: 2.4, damage: 3, range: 1.5,
    attackRate: 1.4, gatherRate: 1.0, carry: 8, color: '#d9b382', pop: 1,
    cost: { holz: 10, nahrung: 20 }, trainTime: 6,
  },
  ritter: {
    id: 'ritter', name: 'Ritter', icon: '⚔️', hp: 180, speed: 2.3, damage: 16, range: 1.5,
    attackRate: 1.0, color: '#c3ccd6', pop: 1,
    cost: { quader: 10, werkzeug: 4, nahrung: 30 }, trainTime: 12,
  },
  bogen: {
    id: 'bogen', name: 'Bogenschütze', icon: '🏹', hp: 90, speed: 2.6, damage: 11, range: 6,
    attackRate: 1.3, color: '#7fae56', pop: 1,
    cost: { bretter: 10, werkzeug: 3, nahrung: 25 }, trainTime: 10,
  },
  raeuber: {
    id: 'raeuber', name: 'Räuber', icon: '🪖', hp: 70, speed: 2.2, damage: 8, range: 1.5,
    attackRate: 1.1, color: '#a5504a', pop: 0, enemy: true,
  },
  raeuberboss: {
    id: 'raeuberboss', name: 'Räuberhauptmann', icon: '💀', hp: 220, speed: 2.0, damage: 18, range: 1.6,
    attackRate: 1.0, color: '#7e2f2f', pop: 0, enemy: true,
  },
};

/* Rohstoffvorkommen in der Welt */
export const NODE_TYPES = {
  baum: { id: 'baum', res: 'holz', amount: 40, name: 'Baum' },
  fels: { id: 'fels', res: 'stein', amount: 50, name: 'Felsen' },
};

/* Angriffswellen */
export const WAVE = {
  firstAt: 240,     // Sekunden bis zur ersten Welle
  interval: 210,    // Abstand zwischen Wellen
  baseCount: 2,
  growth: 1.35,
};
