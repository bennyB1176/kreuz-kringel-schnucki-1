/* Benutzeroberfläche: Ressourcenleiste, Panels, Auswahl, Menü. */

import { BUILDINGS, UNITS, RES_ICON, RES_NAME, RESOURCES, WAVE } from './config.js';
import { clearSave, saveInfo } from './save.js';

const CATEGORIES = [
  { name: 'Wirtschaft', ids: ['lager', 'holzfaeller', 'steinbruch', 'bauernhof', 'haus'] },
  { name: 'Veredelung', ids: ['saegewerk', 'steinmetz', 'schmiede'] },
  { name: 'Militär & Verteidigung', ids: ['kaserne', 'bogenstand', 'turm', 'mauer'] },
];

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.appendChild(c);
  return n;
}

export class UI {
  constructor(app) {
    this.app = app;              // { game, renderer, ... } aus main.js
    this.activePanel = null;
    this.refreshTimer = 0;
    this.dom = {
      topbar: document.getElementById('topbar'),
      panel: document.getElementById('panel'),
      panelTitle: document.getElementById('panel-title'),
      panelBody: document.getElementById('panel-body'),
      selection: document.getElementById('selection'),
      selTitle: document.getElementById('sel-title'),
      selBody: document.getElementById('sel-body'),
      toast: document.getElementById('toast'),
      wavebar: document.getElementById('wavebar'),
      waveText: document.getElementById('wave-text'),
      buildbar: document.getElementById('buildbar'),
      buildbarText: document.getElementById('buildbar-text'),
      modal: document.getElementById('modal'),
      modalBody: document.getElementById('modal-body'),
    };
    this.bind();
  }

  get game() { return this.app.game; }

  bind() {
    document.querySelectorAll('.tab-btn[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => this.togglePanel(btn.dataset.panel));
    });
    document.getElementById('btn-center').addEventListener('click', () => this.app.centerOnHero());
    document.getElementById('panel-close').addEventListener('click', () => this.closePanel());
    document.getElementById('sel-close').addEventListener('click', () => { this.game.selection = null; this.renderSelection(); });
    document.getElementById('btn-menu').addEventListener('click', () => this.openMenu());
    document.getElementById('buildbar-cancel').addEventListener('click', () => this.app.cancelBuildMode());
    this.dom.modal.addEventListener('click', (e) => { if (e.target === this.dom.modal) this.closeModal(); });
  }

  /* ---------------------------------------------------------- */
  /* Ressourcenleiste                                            */
  /* ---------------------------------------------------------- */
  updateResources() {
    const g = this.game;
    for (const r of RESOURCES) {
      const node = document.querySelector(`#res-${r.id} .val`);
      if (node) node.textContent = Math.floor(g.resources[r.id] || 0);
    }
    const pop = document.querySelector('#res-pop .val');
    if (pop) pop.textContent = `${g.popUsed}/${g.popCap}`;
  }

  updateWaveBar() {
    const g = this.game;
    const left = Math.max(0, g.nextWaveAt - g.time);
    if (left > 90 && g.waveNumber === 0) { this.dom.wavebar.classList.add('hidden'); return; }
    this.dom.wavebar.classList.remove('hidden');
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    this.dom.waveText.textContent = `⚔️ Welle ${g.waveNumber + 1} in ${m}:${String(s).padStart(2, '0')}`;
  }

  toast(msg) {
    const t = this.dom.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------------------------------------------------------- */
  /* Panels                                                      */
  /* ---------------------------------------------------------- */
  togglePanel(name) {
    if (this.activePanel === name) { this.closePanel(); return; }
    this.activePanel = name;
    this.dom.panel.classList.remove('hidden');
    document.querySelectorAll('.tab-btn[data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
    this.renderPanel();
  }

  closePanel() {
    this.activePanel = null;
    this.dom.panel.classList.add('hidden');
    document.querySelectorAll('.tab-btn[data-panel]').forEach((b) => b.classList.remove('active'));
  }

  renderPanel() {
    if (!this.activePanel) return;
    const body = this.dom.panelBody;
    const scroll = body.scrollTop;
    body.innerHTML = '';
    if (this.activePanel === 'build') { this.dom.panelTitle.textContent = 'Bauen'; this.renderBuildPanel(body); }
    else if (this.activePanel === 'units') { this.dom.panelTitle.textContent = 'Leute & Arbeit'; this.renderUnitsPanel(body); }
    else if (this.activePanel === 'army') { this.dom.panelTitle.textContent = 'Armee'; this.renderArmyPanel(body); }
    body.scrollTop = scroll;
  }

  costText(cost) {
    const g = this.game;
    return Object.entries(cost || {}).map(([res, amt]) => {
      const lack = (g.resources[res] || 0) < amt;
      return `<span class="${lack ? 'lack' : ''}">${RES_ICON[res]}${amt}</span>`;
    }).join(' ');
  }

  renderBuildPanel(body) {
    const g = this.game;
    for (const cat of CATEGORIES) {
      body.appendChild(el('div', { class: 'hint', text: cat.name }));
      const grid = el('div', { class: 'grid' });
      for (const id of cat.ids) {
        const def = BUILDINGS[id];
        const afford = g.canAfford(def.cost);
        const card = el('button', {
          class: 'card' + (afford ? '' : ' disabled'),
          onclick: () => this.app.startBuildMode(id),
        }, [
          el('div', { class: 'card-title', html: `${def.icon} ${def.name}` }),
          el('div', { class: 'card-cost', html: this.costText(def.cost) }),
          el('div', { class: 'card-desc', text: def.desc }),
        ]);
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }
    body.appendChild(el('div', { class: 'hint', text: 'Tippe auf eine Karte und dann auf die Karte der Welt, um zu bauen. Mauern bleiben im Baumodus.' }));
  }

  renderUnitsPanel(body) {
    const g = this.game;
    const workers = g.units.filter((u) => u.alive && u.isWorker);
    const idle = workers.filter((u) => !u.workplace);

    body.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'grow', html: `<b>🧍 Siedler: ${workers.length}</b><div class="sub">${idle.length} ohne Arbeit · Bevölkerung ${g.popUsed}/${g.popCap}</div>` }),
    ]));

    // Siedler ausbilden
    const lager = g.buildings.filter((b) => b.done && BUILDINGS[b.type].trains?.includes('siedler'));
    if (lager.length) {
      const def = UNITS.siedler;
      body.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'grow', html: `Neuer Siedler <div class="sub">${this.costText(def.cost)} · ${def.trainTime}s</div>` }),
        el('button', {
          class: 'small', text: '+ Ausbilden',
          onclick: () => { g.queueUnit(lager[0], 'siedler'); this.renderPanel(); },
        }),
      ]));
      const q = lager[0].trainQueue.filter((j) => j.unit === 'siedler').length;
      if (q) body.appendChild(el('div', { class: 'hint', text: `${q} Siedler in Ausbildung …` }));
    } else {
      body.appendChild(el('div', { class: 'hint', text: 'Ein Lagerhaus wird benötigt, um Siedler auszubilden.' }));
    }

    // Arbeitsstellen
    body.appendChild(el('div', { class: 'hint', text: 'Arbeitsstellen' }));
    const jobs = g.buildings.filter((b) => b.done && b.maxWorkers > 0);
    if (!jobs.length) body.appendChild(el('div', { class: 'hint', text: 'Noch keine Arbeitsstellen gebaut.' }));

    for (const b of jobs) {
      const def = BUILDINGS[b.type];
      const row = el('div', { class: 'row' }, [
        el('div', {
          class: 'grow',
          html: `${def.icon} ${def.name} <div class="sub">${b.workers.length}/${b.maxWorkers} Arbeiter${def.job === 'produce' ? ' · ' + this.produceText(def) : ''}</div>`,
        }),
        el('button', { class: 'small ghost', text: '−', onclick: () => { g.removeWorker(b); this.renderPanel(); } }),
        el('button', { class: 'small', text: '+', onclick: () => { g.assignWorker(b); this.renderPanel(); } }),
        el('button', { class: 'small ghost', text: '🎯', onclick: () => { this.app.centerOn(b.cx, b.cy); this.app.select('building', b.id); } }),
      ]);
      body.appendChild(row);
    }
  }

  produceText(def) {
    const ins = Object.entries(def.produce.in).map(([r, a]) => `${RES_ICON[r]}${a}`).join(' ');
    const outs = Object.entries(def.produce.out).map(([r, a]) => `${RES_ICON[r]}${a}`).join(' ');
    return `${ins ? ins + ' → ' : ''}${outs} je ${def.produce.time}s`;
  }

  renderArmyPanel(body) {
    const g = this.game;
    const soldiers = g.units.filter((u) => u.alive && u.isSoldier);
    const knights = soldiers.filter((u) => u.type === 'ritter').length;
    const archers = soldiers.filter((u) => u.type === 'bogen').length;
    const foes = g.units.filter((u) => u.alive && u.enemy).length;

    body.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'grow', html: `<b>⚔️ ${knights} Ritter · 🏹 ${archers} Bogenschützen</b><div class="sub">${foes} Feinde auf der Karte · Welle ${g.waveNumber}</div>` }),
    ]));

    body.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'small', text: '🚩 Zum Helden sammeln', onclick: () => this.app.rallyToHero() }),
      el('button', { class: 'small danger', text: '⚔️ Angriff', onclick: () => this.app.attackNearest() }),
    ]));

    const trainers = g.buildings.filter((b) => b.done && BUILDINGS[b.type].trains && !BUILDINGS[b.type].trains.includes('siedler'));
    if (!trainers.length) {
      body.appendChild(el('div', { class: 'hint', text: 'Baue eine Kaserne oder einen Bogenschützenstand, um Soldaten auszubilden.' }));
    }
    for (const b of trainers) {
      const def = BUILDINGS[b.type];
      body.appendChild(el('div', { class: 'hint', text: `${def.icon} ${def.name}` }));
      for (const unitId of def.trains) {
        const u = UNITS[unitId];
        body.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'grow', html: `${u.icon} ${u.name} <div class="sub">${this.costText(u.cost)} · ${u.trainTime}s · ❤${u.hp} ⚔${u.damage}</div>` }),
          el('button', { class: 'small', text: '+', onclick: () => { g.queueUnit(b, unitId); this.renderPanel(); } }),
        ]));
      }
      if (b.trainQueue.length) {
        const first = b.trainQueue[0];
        const bar = el('div', { class: 'bar' }, [el('i')]);
        bar.firstChild.style.width = `${(1 - first.left / UNITS[first.unit].trainTime) * 100}%`;
        body.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'grow', html: `In Ausbildung: ${b.trainQueue.map((j) => UNITS[j.unit].icon).join(' ')}` }),
        ]));
        body.appendChild(bar);
      }
    }

    body.appendChild(el('div', { class: 'hint', text: 'Soldaten verteidigen automatisch. Tippe einen Soldaten an und danach auf ein Ziel, um ihn gezielt zu schicken.' }));
  }

  /* ---------------------------------------------------------- */
  /* Auswahl-Panel                                               */
  /* ---------------------------------------------------------- */
  renderSelection() {
    const g = this.game;
    const sel = g.selection;
    if (!sel) { this.dom.selection.classList.add('hidden'); return; }
    const body = this.dom.selBody;
    const scroll = body.scrollTop;
    body.innerHTML = '';
    this.dom.selection.classList.remove('hidden');
    queueMicrotask(() => { body.scrollTop = scroll; });

    if (sel.kind === 'building') {
      const b = g.getBuilding(sel.id);
      if (!b) { g.selection = null; this.dom.selection.classList.add('hidden'); return; }
      this.renderBuildingSelection(b, body);
    } else {
      const u = g.getUnit(sel.id);
      if (!u) { g.selection = null; this.dom.selection.classList.add('hidden'); return; }
      this.renderUnitSelection(u, body);
    }
  }

  renderBuildingSelection(b, body) {
    const g = this.game;
    const def = BUILDINGS[b.type];
    this.dom.selTitle.textContent = `${def.icon} ${def.name}`;

    const hp = el('div', { class: 'bar hp' }, [el('i')]);
    hp.firstChild.style.width = `${(b.hp / b.maxHp) * 100}%`;
    body.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'grow', html: `Zustand ${Math.ceil(b.hp)}/${b.maxHp}` }),
    ]));
    body.appendChild(hp);

    if (!b.done) {
      const p = el('div', { class: 'bar' }, [el('i')]);
      p.firstChild.style.width = `${b.progressRatio() * 100}%`;
      body.appendChild(el('div', { class: 'hint', text: `Im Bau … ${Math.ceil(b.buildTime - b.buildProgress)}s` }));
      body.appendChild(p);
    }

    if (b.maxWorkers > 0) {
      body.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'grow', html: `👷 Arbeiter ${b.workers.length}/${b.maxWorkers}<div class="sub">${def.job === 'produce' ? this.produceText(def) : 'Sammelt im Umkreis von ' + def.workRadius + ' Feldern'}</div>` }),
        el('button', { class: 'small ghost', text: '−', onclick: () => { g.removeWorker(b); this.renderSelection(); } }),
        el('button', { class: 'small', text: '+', onclick: () => { g.assignWorker(b); this.renderSelection(); } }),
      ]));
    }

    if (def.storage) body.appendChild(el('div', { class: 'hint', text: `Lagerlimit gesamt: ${g.storageCap}` }));
    if (def.popCap) body.appendChild(el('div', { class: 'hint', text: `Wohnraum: +${def.popCap}` }));
    if (def.tower) body.appendChild(el('div', { class: 'hint', text: `Reichweite ${def.tower.range} · Schaden ${def.tower.damage}` }));

    if (def.trains && b.done) {
      for (const unitId of def.trains) {
        const u = UNITS[unitId];
        body.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'grow', html: `${u.icon} ${u.name} <div class="sub">${this.costText(u.cost)} · ${u.trainTime}s</div>` }),
          el('button', { class: 'small', text: '+ Ausbilden', onclick: () => { g.queueUnit(b, unitId); this.renderSelection(); } }),
        ]));
      }
      b.trainQueue.forEach((job, i) => {
        const bar = el('div', { class: 'bar' }, [el('i')]);
        bar.firstChild.style.width = `${(1 - job.left / UNITS[job.unit].trainTime) * 100}%`;
        body.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'grow', html: `${UNITS[job.unit].icon} ${UNITS[job.unit].name} · ${Math.ceil(job.left)}s` }),
          el('button', { class: 'small ghost', text: '✕', onclick: () => { g.cancelTraining(b, i); this.renderSelection(); } }),
        ]));
        if (i === 0) body.appendChild(bar);
      });
    }

    body.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'small ghost', text: '🎯 Ansehen', onclick: () => this.app.centerOn(b.cx, b.cy) }),
      el('button', {
        class: 'small danger', text: '💥 Abreißen',
        onclick: () => { if (confirm(`${def.name} abreißen? Du erhältst die Hälfte der Kosten zurück.`)) { g.demolish(b); this.renderSelection(); this.renderPanel(); } },
      }),
    ]));
  }

  renderUnitSelection(u, body) {
    const g = this.game;
    const def = UNITS[u.type];
    this.dom.selTitle.textContent = `${def.icon} ${def.name}`;

    const hp = el('div', { class: 'bar hp' }, [el('i')]);
    hp.firstChild.style.width = `${(u.hp / u.maxHp) * 100}%`;
    body.appendChild(el('div', { class: 'row' }, [el('div', { class: 'grow', html: `Leben ${Math.ceil(u.hp)}/${u.maxHp} · ⚔ ${def.damage}` })]));
    body.appendChild(hp);

    if (u.carrying?.amount >= 1) {
      body.appendChild(el('div', { class: 'hint', html: `Trägt ${RES_ICON[u.carrying.res]} ${Math.floor(u.carrying.amount)} ${RES_NAME[u.carrying.res]}` }));
    }

    if (u.isWorker) {
      const b = u.workplace ? g.getBuilding(u.workplace) : null;
      body.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'grow', html: b ? `Arbeitet: ${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name}` : 'Ohne Arbeit' }),
        b ? el('button', { class: 'small ghost', text: 'Freistellen', onclick: () => { g.removeWorkerById(b, u.id); this.renderSelection(); } }) : null,
      ]));
      if (!b) {
        const jobs = g.buildings.filter((x) => x.done && x.maxWorkers > x.workers.length);
        for (const j of jobs) {
          const jd = BUILDINGS[j.type];
          body.appendChild(el('div', { class: 'row' }, [
            el('div', { class: 'grow', html: `${jd.icon} ${jd.name} <div class="sub">${j.workers.length}/${j.maxWorkers}</div>` }),
            el('button', { class: 'small', text: 'Zuweisen', onclick: () => { g.assignSpecificWorker(j, u); this.renderSelection(); } }),
          ]));
        }
      }
    }

    if (u.isHero) {
      body.appendChild(el('div', { class: 'hint', text: 'Tippe auf einen Baum oder Felsen, damit dein Held dort sammelt. Tippe auf freies Gelände, um zu laufen.' }));
    }
    if (u.isSoldier) {
      body.appendChild(el('div', { class: 'hint', text: 'Tippe auf ein Ziel, um diesen Soldaten dorthin zu schicken.' }));
    }
    body.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'small ghost', text: '🎯 Folgen', onclick: () => this.app.centerOn(u.x, u.y) }),
      el('button', { class: 'small ghost', text: 'Auswahl aufheben', onclick: () => { g.selection = null; this.renderSelection(); } }),
    ]));
  }

  /* ---------------------------------------------------------- */
  /* Baumodus-Leiste                                             */
  /* ---------------------------------------------------------- */
  updateBuildBar() {
    const g = this.game;
    if (!g.buildMode) { this.dom.buildbar.classList.add('hidden'); return; }
    const def = BUILDINGS[g.buildMode];
    this.dom.buildbar.classList.remove('hidden');
    this.dom.buildbarText.innerHTML = `${def.icon} ${def.name} platzieren`;
  }

  /* ---------------------------------------------------------- */
  /* Menü                                                        */
  /* ---------------------------------------------------------- */
  openMenu() {
    const body = this.dom.modalBody;
    body.innerHTML = '';
    const info = saveInfo();

    body.appendChild(el('button', {
      class: 'wide', html: '💾 Spiel speichern',
      onclick: () => { this.app.save(true); this.closeModal(); },
    }));
    body.appendChild(el('button', {
      class: 'wide', html: `📂 Spiel laden${info ? ` <span style="opacity:.6">(${new Date(info.savedAt).toLocaleString('de-DE')})</span>` : ' <span style="opacity:.6">(kein Spielstand)</span>'}`,
      onclick: () => { if (info) this.app.load(); this.closeModal(); },
    }));
    body.appendChild(el('button', {
      class: 'wide', html: '🆕 Neues Spiel',
      onclick: () => {
        if (confirm('Neues Spiel starten? Der aktuelle Fortschritt geht verloren, sofern nicht gespeichert.')) {
          this.app.newGame(); this.closeModal();
        }
      },
    }));
    if (info) {
      body.appendChild(el('button', {
        class: 'wide', html: '🗑️ Spielstand löschen',
        onclick: () => { if (confirm('Gespeicherten Spielstand wirklich löschen?')) { clearSave(); this.toast('Spielstand gelöscht'); this.closeModal(); } },
      }));
    }
    body.appendChild(el('button', {
      class: 'wide', html: document.fullscreenElement ? '🗗 Vollbild beenden' : '🗖 Vollbild',
      onclick: () => { this.toggleFullscreen(); this.closeModal(); },
    }));
    body.appendChild(el('button', { class: 'wide', html: '❔ Anleitung', onclick: () => this.showHelp() }));
    body.appendChild(el('button', { class: 'wide', html: '✕ Schließen', onclick: () => this.closeModal() }));

    const g = this.game;
    const mins = Math.floor(g.time / 60);
    body.appendChild(el('div', { class: 'hint', html: `Spielzeit ${mins} min · Gebäude ${g.buildings.length} · Einheiten ${g.units.filter((u) => !u.enemy && u.alive).length} · Wellen überstanden ${g.waveNumber}` }));

    this.dom.modal.classList.remove('hidden');
  }

  showHelp() {
    const body = this.dom.modalBody;
    body.innerHTML = `
      <h3>Steuerung</h3>
      <ul>
        <li><b>Ziehen</b> = Karte bewegen, <b>zwei Finger</b> = Zoom (Mausrad am PC, WASD zum Scrollen).</li>
        <li><b>Tippen auf freies Gelände</b> = Held läuft dorthin.</li>
        <li><b>Tippen auf Baum/Felsen</b> = Held sammelt dort und bringt die Ladung ins Lager.</li>
        <li><b>Tippen auf Einheit/Gebäude</b> = auswählen und Details öffnen.</li>
      </ul>
      <h3>Aufbau</h3>
      <ul>
        <li>Über <b>🏗️ Bauen</b> ein Gebäude wählen, dann auf die Karte tippen.</li>
        <li><b>Holzfällerhütte</b> und <b>Steinbruch</b> brauchen Arbeiter – Siedler im Lagerhaus ausbilden und unter <b>🧍 Leute</b> zuweisen.</li>
        <li><b>Sägewerk</b>, <b>Steinmetz</b> und <b>Schmiede</b> veredeln Rohstoffe zu Brettern, Quadern und Werkzeug.</li>
        <li><b>Wohnhäuser</b> erhöhen die Bevölkerungsgrenze, <b>Lagerhäuser</b> das Lagerlimit.</li>
      </ul>
      <h3>Verteidigung</h3>
      <ul>
        <li>Ab Minute ${Math.round(WAVE.firstAt / 60)} greifen Räuber an – regelmäßig und immer stärker.</li>
        <li><b>Wachtürme</b> und <b>Mauern</b> schützen die Siedlung, <b>Kaserne</b> und <b>Bogenschützenstand</b> bilden Soldaten aus.</li>
        <li>Soldaten verteidigen automatisch; über <b>⚔️ Armee</b> lassen sie sich sammeln oder losschicken.</li>
      </ul>
      <h3>Speichern</h3>
      <p>Das Spiel speichert automatisch alle 20 Sekunden lokal im Browser. Über das Menü kannst du jederzeit manuell speichern, laden oder neu starten.</p>
    `;
    body.appendChild(el('button', { class: 'wide', html: '← Zurück', onclick: () => this.openMenu() }));
  }

  closeModal() { this.dom.modal.classList.add('hidden'); }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  /* ---------------------------------------------------------- */
  update(dt) {
    this.updateResources();
    this.updateWaveBar();
    this.updateBuildBar();
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 0.5;
      if (this.activePanel) this.renderPanel();
      if (this.game.selection) this.renderSelection();
      else this.dom.selection.classList.add('hidden');
    }
  }
}
