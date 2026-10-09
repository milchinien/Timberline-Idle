import { setIconText, renderIcons } from './icons.js';
// 3D-Welt: Wiese, Nebel, Truhe, Bäume, Deko, Partikel und Holz-Items.
// Alles sind 2D-Pixel-Art-Sprites in einer isometrischen 3D-Szene.
import * as THREE from 'three';
import * as T from './textures.js';
import * as sfx from './sfx.js';
import { chestUsed, formatNumber, SOIL_DEFS, soilPrice, ITEM_DEFS, autoSellNow, recomputeStats } from './state.js';
import { PLOT_SIZE, START_PLOTS, TREE_SLOTS_PER_ROW, landBounds, buyRow } from './land.js';
import { emit, on } from './events.js';
import { traitLevel, STAT_INFO } from './workers.js';
import {
  DEFAULT_SPECIES, speciesOf, SAPLING_BONUS_CHANCE, SQUIRREL_DELAY, saplingBuyPrice, pickSaplingFor, totalSaplings,
} from './species.js';
import { BUILDING_DEFS, wateredCells, sawmillLevel } from './buildings.js';
import { itemCanvas, itemUiCanvas, sawmillArt, irrigationArt, irrigationDecal, wetTileArt } from './itemArt.js';
import { createFellas } from './fellas.js';
import { createVisitors } from './visitors.js';
import { trackIdle } from './offline.js';

const PX = 1 / 24; // Weltgröße eines Sprite-Pixels
// ---- Grid: die Wiese besteht aus Feldern, Start 3x3 Plots à 3x3 Felder = 9x9. Ein Feld = ein Baum. ----
// Gekaufte Plot-Reihen erweitern das Land in alle Richtungen (siehe land.js), die Truhe bleibt im Ursprung.
const START_TILES = PLOT_SIZE * START_PLOTS;
const GRID_OFFSET = (START_TILES - 1) / 2; // Feld (i, j) liegt bei Welt (i - OFFSET, j - OFFSET)
const cellKey = (i, j) => `${i},${j}`;
const cellX = (i) => i - GRID_OFFSET;
const CHEST_CELL = [GRID_OFFSET, GRID_OFFSET]; // die Truhe steht außerhalb des Grid-Systems mittig
// Startfeld des ersten Baums (nicht direkt vor der Truhe)
const AUTO_TREE_CELLS = [[-2, 1], [2, -2], [-2, -2], [3, 0], [0, 3], [0, -3]].map(([x, z]) => [x + GRID_OFFSET, z + GRID_OFFSET]);
const CHEST_TOP = new THREE.Vector3(0, 0.55, 0);
const SCREEN_RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // Bildschirm-rechts in Weltkoordinaten
const TO_CAMERA = new THREE.Vector3(1, 0, 1).normalize();
const CAM_BASE = new THREE.Vector3(12, 11, 12);
const CAM_LOOK = new THREE.Vector3(0, 0.8, 0);
const VIEW_DIR = CAM_BASE.clone().sub(CAM_LOOK).normalize(); // zeigt zur Kamera

// Tageslicht-Keyframes: [Stunde, Tönung, Hintergrund/Nebel]
const LIGHT_KEYS = [
  [0, 0x4a5a8c, 0x121a30],
  [5, 0x4a5a8c, 0x121a30],
  [7, 0xffcf9a, 0xd9c2a8],
  [9, 0xffffff, 0xc3d6b8],
  [17, 0xffffff, 0xc3d6b8],
  [19, 0xffb27a, 0xcfa98a],
  [21, 0x4a5a8c, 0x121a30],
  [24, 0x4a5a8c, 0x121a30],
];

function sampleLight(hour, tint, bg) {
  for (let i = 0; i < LIGHT_KEYS.length - 1; i++) {
    const [h0, t0, b0] = LIGHT_KEYS[i];
    const [h1, t1, b1] = LIGHT_KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const f = (hour - h0) / (h1 - h0);
      tint.set(t0).lerp(new THREE.Color(t1), f);
      bg.set(b0).lerp(new THREE.Color(b1), f);
      return;
    }
  }
}

// 0 = Tag, 1 = tiefe Nacht
function nightAmount(hour) {
  if (hour >= 21 || hour < 5) return 1;
  if (hour >= 19) return (hour - 19) / 2;
  if (hour < 7) return 1 - (hour - 5) / 2;
  return 0;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const rand = Math.random;
const randRange = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// saved = gespeicherter Welt-Zustand (Bäume, Items) oder null für ein neues Spiel
export function createWorld(container, floaterLayer, state, saved = null) {
  // ---- Land: Feld-Grenzen und Weltmaße (wächst mit gekauften Plot-Reihen) ----
  let bounds = landBounds(state);
  const boxOf = (b) => {
    const minX = cellX(b.minI) - 0.5;
    const maxX = cellX(b.maxI) + 0.5;
    const minZ = cellX(b.minJ) - 0.5;
    const maxZ = cellX(b.maxJ) + 0.5;
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2 };
  };
  let box = boxOf(bounds);
  // Nebel: Abstand zum Landrand, ab dem er beginnt bzw. ganz dicht ist
  const FOG_IN = -0.45;
  const FOG_OUT = 3.15;
  const FOG_MARGIN = 16; // so weit reicht die Nebelfläche über das Land hinaus
  const fogAt = (x, z) => {
    const d = T.roundedRectDist(x - box.cx, z - box.cz, box.hx, box.hz);
    const t = Math.min(1, Math.max(0, (d - FOG_IN) / (FOG_OUT - FOG_IN)));
    return t * t * (3 - 2 * t);
  };

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  // Zwei Szenen: zuerst Boden (inkl. Schatten + Nebelring), dann alle Sprites darüber.
  // Sprites bekommen ihren Nebel über die Einfärbung, damit hohe Objekte nicht falsch vernebelt werden.
  const groundScene = new THREE.Scene();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.copy(CAM_BASE);
  camera.lookAt(CAM_LOOK);
  let shake = 0;

  let viewHeight = 8.5;
  const VIEW_MIN = 6;
  const viewMax = () => Math.max(16, box.hx + box.hz + 7); // größeres Land: weiter herauszoomen
  let viewW = 1;
  let viewH = 1;
  // Kamera-Verschiebung (Ziehen mit der Maus); panTarget gleitet nach einem Landkauf zur neuen Mitte
  const camPan = new THREE.Vector3(box.cx, 0, box.cz);
  const panTarget = camPan.clone();

  // ---- Tageslicht/Nebel-Färbung ----
  const tinted = new Set(); // { mat, fog }
  const tint = (mat, fog = 0) => {
    const e = { mat, fog };
    tinted.add(e);
    return e;
  };
  const curTint = new THREE.Color(1, 1, 1);
  const curBg = new THREE.Color(0xc3d6b8);
  const fogColorSRGB = new THREE.Color(); // Nebelfarbe im Ausgabe-Farbraum (für den Shader)

  // Mischt die Nebelfarbe in den Shader (nicht nur multiplizieren), damit Objekte wirklich im Dunst verschwinden
  function addFog(mat, amount) {
    const fogMix = { value: amount };
    const fogColor = { value: fogColorSRGB };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFogMix = fogMix;
      shader.uniforms.uFogColor = fogColor;
      shader.fragmentShader = 'uniform float uFogMix;\nuniform vec3 uFogColor;\n' + shader.fragmentShader.replace(
        '#include <fog_fragment>',
        '#include <fog_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, uFogMix);',
      );
    };
    mat.customProgramCacheKey = () => 'fogmix';
  }

  // ---- Boden ----
  const WILD_SIZE = 160;
  const wildTex = T.wildGrassTexture();
  wildTex.repeat.set(WILD_SIZE / 2, WILD_SIZE / 2);
  const wildMat = new THREE.MeshBasicMaterial({ map: wildTex });
  tint(wildMat);
  const wild = new THREE.Mesh(new THREE.PlaneGeometry(WILD_SIZE, WILD_SIZE), wildMat);
  wild.rotation.x = -Math.PI / 2;
  groundScene.add(wild);

  // Wiese, Nebel und Platzier-Gitter sind 1x1-Flächen, die auf die Landgröße skaliert werden
  const meadowMat = new THREE.MeshBasicMaterial();
  tint(meadowMat);
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), meadowMat);
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = 0.003;
  groundScene.add(meadow);

  const shadowTex = T.shadowTexture();
  function makeShadow(x, z, w, d = w * 0.6) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 4; // Ellipse quer zur Blickrichtung
    m.scale.set(w, d, 1);
    m.position.set(x, 0.01, z);
    m.renderOrder = 2;
    groundScene.add(m);
    return m;
  }

  const fogMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const fogPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fogMat);
  fogPlane.rotation.x = -Math.PI / 2;
  fogPlane.position.y = 0.05;
  fogPlane.renderOrder = 10;
  groundScene.add(fogPlane);
  // Nebel um ein (evtl. gerade wachsendes) Land legen
  function setFog(b) {
    fogMat.map?.dispose();
    fogMat.map = T.fogRectTexture(b.hx, b.hz, FOG_MARGIN, FOG_IN, FOG_OUT);
    fogMat.needsUpdate = true;
    fogPlane.scale.set((b.hx + FOG_MARGIN) * 2, (b.hz + FOG_MARGIN) * 2, 1);
    fogPlane.position.set(b.cx, 0.05, b.cz);
  }
  function setMeadow() {
    meadowMat.map?.dispose();
    meadowMat.map = T.meadowTexture(bounds.maxI - bounds.minI + 1, bounds.maxJ - bounds.minJ + 1, PLOT_SIZE, bounds.minI, bounds.minJ);
    meadowMat.needsUpdate = true;
    meadow.scale.set(box.hx * 2, box.hz * 2, 1);
    meadow.position.set(box.cx, 0.003, box.cz);
  }
  setMeadow();
  setFog(box);

  // ---- Sprite-Helfer ----
  function makeSprite(tex, w, h, { fog = 0, center = [0.5, 0], scale = 1 } = {}) {
    const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false });
    const entry = tint(mat);
    if (fog > 0) addFog(mat, fog);
    const s = new THREE.Sprite(mat);
    s.center.set(center[0], center[1]);
    s.scale.set(w * PX * scale, h * PX * scale, 1);
    s.userData.tintEntry = entry;
    scene.add(s);
    return s;
  }
  function removeSprite(s) {
    scene.remove(s);
    tinted.delete(s.userData.tintEntry);
    s.material.dispose();
  }

  // ---- Truhe ----
  const chestClosed = T.chestTexture(false);
  const chestOpen = T.chestTexture(true);
  const chest = makeSprite(chestClosed, 24, 20, { scale: 1.1 });
  const chestBase = chest.scale.clone();
  makeShadow(0, 0.05, 1.5);
  let chestOpenTimer = 0;
  let chestBounce = 0;

  // ---- Bäume ----
  // Texturen je Baumart und Variante (werden beim ersten Gebrauch erzeugt)
  const LEAF_COLORS = {
    oak: T.LEAF_PALETTES,
    birch: [{ light: '#a8cf52', mid: '#7fa832', hi: '#c8e270' }, { light: '#c4c04a', mid: '#a0a02c', hi: '#dcd868' }],
    pine: [{ light: '#2e7a48', mid: '#1f5a38', hi: '#45995c' }, { light: '#2e7068', mid: '#215454', hi: '#448c80' }],
  };
  const treeTexCache = new Map();
  function texFor(species, variant) {
    const sp = speciesOf(species);
    const v = sp.variants.includes(variant) ? variant : sp.variants[variant % sp.variants.length];
    const key = `${sp.id}:${v}`;
    if (!treeTexCache.has(key)) {
      const mature = T.treeCanvas('mature', v, sp.style);
      treeTexCache.set(key, {
        mature: T.canvasTexture(mature),
        young: T.canvasTexture(T.treeCanvas('young', v, sp.style)),
        sapling: T.canvasTexture(T.treeCanvas('sapling', v, sp.style)),
        stump: T.canvasTexture(T.treeCanvas('stump', 0, sp.style)),
        flash: T.canvasTexture(T.silhouetteCanvas(mature)),
        alpha: mature.getContext('2d').getImageData(0, 0, T.TREE_W, T.TREE_H),
        pal: LEAF_COLORS[sp.id][v % LEAF_COLORS[sp.id].length],
      });
    }
    return treeTexCache.get(key);
  }
  const texOf = (tree) => texFor(tree.species, tree.variant);
  const TREE_SW = T.TREE_W * PX;
  const TREE_SH = T.TREE_H * PX;

  const trees = [];
  const treeAt = new Map(); // 'i,j' -> Baum
  const isChestCell = (i, j) => i === CHEST_CELL[0] && j === CHEST_CELL[1];
  const inGrid = (i, j) => i >= bounds.minI && j >= bounds.minJ && i <= bounds.maxI && j <= bounds.maxJ;
  const seeds = new Map(); // 'i,j' -> gesetzter Setzling, den ein Worker noch pflanzen muss
  const buildingAt = new Map(); // 'i,j' -> Gebäude (jedes belegte Feld)
  const isFree = (i, j) => inGrid(i, j) && !isChestCell(i, j) && !treeAt.has(cellKey(i, j)) && !seeds.has(cellKey(i, j)) && !buildingAt.has(cellKey(i, j));

  function addTree(i, j, variant, { growing = false, auto = true, species = DEFAULT_SPECIES } = {}) {
    const x = cellX(i);
    const z = cellX(j);
    const sp = speciesOf(species);
    if (!sp.variants.includes(variant)) variant = sp.variants[variant % sp.variants.length];
    const tex = texFor(sp.id, variant);
    const sprite = makeSprite(growing ? tex.sapling : tex.mature, T.TREE_W, T.TREE_H);
    sprite.position.set(x, 0, z);
    const flashMat = new THREE.SpriteMaterial({
      map: tex.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    });
    const flash = new THREE.Sprite(flashMat);
    flash.center.set(0.5, 0);
    flash.position.copy(sprite.position);
    flash.renderOrder = 3;
    flash.visible = false;
    scene.add(flash);
    const tree = {
      sprite, flash, x, z, variant, cell: [i, j], auto, species: sp.id,
      phase: growing ? 'growing' : 'grown', // grown | falling | stump | growing
      hp: sp.hp,
      autoRegrow: false, // nur der Tutorial-Baum wächst einmal von selbst nach
      reservedBy: null,
      growth: 0,
      hitT: 0,
      flashT: 0,
      fall: 0,
      fallDir: 1,
      stumpTimer: 0,
      swayPhase: rand() * 10,
      hpEl: null,
      hpTimer: 0,
    };
    sprite.userData.tree = tree;
    makeShadow(x, z, 1.9);
    trees.push(tree);
    treeAt.set(cellKey(i, j), tree);
    return tree;
  }
  if (saved?.trees?.length) {
    for (const d of saved.trees) {
      if (!inGrid(...d.cell) || treeAt.has(cellKey(...d.cell))) continue;
      const phase = d.phase === 'falling' ? 'grown' : d.phase;
      const t = addTree(...d.cell, d.variant ?? 0, { growing: phase !== 'grown', auto: d.auto !== false, species: d.species });
      t.phase = phase;
      t.growth = d.growth ?? 0;
      t.hp = phase === 'grown' ? (d.hp ?? speciesOf(t.species).hp) : speciesOf(t.species).hp;
      t.autoRegrow = !!d.autoRegrow;
      t.stumpTimer = d.stumpTimer ?? 0;
      if (phase === 'stump') t.sprite.material.map = texOf(t).stump;
      else if (phase === 'growing') t.sprite.material.map = t.growth >= 0.4 ? texOf(t).young : texOf(t).sapling;
    }
  } else {
    addTree(...AUTO_TREE_CELLS[0], 0); // Start: ein einziger Baum
  }

  // Belegte Baumplätze: alle Bäume (auch Stümpfe) + markierte Felder
  const treesUsed = () => trees.length + seeds.size;

  // ---- Deko auf der Wiese ----
  const decoRand = rng(4242);
  const blocked = [[0, 0, 1.3], ...trees.map((t) => [t.x, t.z, 0.8])];
  const decor = []; // { sprite, shadow, x, z }
  // Deko auf einem Feld ausblenden (wenn dort ein Baum oder Boden platziert wird)
  function clearDecor(i, j) {
    const cx = cellX(i);
    const cz = cellX(j);
    for (const d of decor) {
      if (Math.abs(d.x - cx) < 0.6 && Math.abs(d.z - cz) < 0.6) {
        d.sprite.visible = false;
        if (d.shadow) d.shadow.visible = false;
      }
    }
  }
  const decoSpots = [];
  function freeSpot(minX, maxX, minZ, maxZ, gap) {
    for (let tries = 0; tries < 40; tries++) {
      const x = minX + decoRand() * (maxX - minX);
      const z = minZ + decoRand() * (maxZ - minZ);
      if (blocked.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r)) continue;
      if (decoSpots.some(([dx, dz]) => Math.hypot(x - dx, z - dz) < gap)) continue;
      decoSpots.push([x, z]);
      return [x, z];
    }
    return null;
  }
  const tuftTex = [0, 1, 2].map((v) => T.canvasTexture(T.tuftCanvas(v)));
  const flowerTex = ['#f4e04d', '#ffffff', '#f08fb0', '#9ad0ff', '#e8603c'].map((c) => T.canvasTexture(T.flowerCanvas(c)));
  const mushroomTex = T.canvasTexture(T.mushroomCanvas());
  const rockTex = [0, 1].map((v) => T.canvasTexture(T.rockCanvas(v)));
  // Deko in einem Bereich der Wiese verteilen; Menge passend zur Fläche (Start-Wiese: 18 Büschel, 10 Blumen …)
  function decorate(minX, maxX, minZ, maxZ) {
    const r = [minX + 0.35, maxX - 0.35, minZ + 0.35, maxZ - 0.35];
    const k = ((maxX - minX) * (maxZ - minZ)) / (START_TILES * START_TILES);
    const place = (tex, w, h, count, gap, rock = false) => {
      for (let i = 0; i < Math.round(count * k); i++) {
        const p = freeSpot(...r, gap);
        if (!p) continue;
        const s = makeSprite(Array.isArray(tex) ? tex[Math.floor(decoRand() * tex.length)] : tex, w, h);
        s.position.set(p[0], 0, p[1]);
        decor.push({ sprite: s, shadow: rock ? makeShadow(p[0], p[1], 0.6) : null, x: p[0], z: p[1] });
      }
    };
    place(tuftTex, 9, 7, 18, 0.45);
    place(flowerTex, 7, 8, 10, 0.5);
    place(mushroomTex, 8, 7, 2, 0.8);
    place(rockTex, 14, 10, 2, 0.9, true);
  }
  decorate(box.minX, box.maxX, box.minZ, box.maxZ);

  // ---- Böden (ein Feld groß, liegen unter Bäumen) ----
  const soilTex = T.canvasTexture(T.soilCanvas());
  const soilMeshes = new Map(); // 'i,j' -> Mesh
  function setSoil(i, j, type) {
    const key = cellKey(i, j);
    state.soils[key] = type;
    if (soilMeshes.has(key)) return;
    const mat = new THREE.MeshBasicMaterial({ map: soilTex, transparent: true, alphaTest: 0.5 });
    tint(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cellX(i), 0.006, cellX(j));
    mesh.renderOrder = 1;
    groundScene.add(mesh);
    soilMeshes.set(key, mesh);
    clearDecor(i, j);
  }
  for (const [key, type] of Object.entries(state.soils)) setSoil(...key.split(',').map(Number), type);

  // ---- Baumbeete: Bäume wachsen nur in Beeten (sichtbare Erdflecken mit Steinrand) ----
  // Anzahl der Beete = state.treeCap. Neue Beete (Skills, Land) setzt der Spieler selbst; bis dahin sind sie "offen".
  const bedTex = T.canvasTexture(T.bedCanvas());
  const beds = new Map(); // 'i,j' -> Mesh
  function addBed(i, j) {
    const key = cellKey(i, j);
    if (beds.has(key)) return;
    const mat = new THREE.MeshBasicMaterial({ map: bedTex, transparent: true, alphaTest: 0.5 });
    tint(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cellX(i), 0.008, cellX(j));
    mesh.renderOrder = 1;
    groundScene.add(mesh);
    beds.set(key, mesh);
    if (!state.beds.includes(key)) state.beds.push(key);
    clearDecor(i, j);
  }
  const bedFree = (key) => beds.has(key) && !treeAt.has(key) && !seeds.has(key);
  const freeBeds = () => [...beds.keys()].filter(bedFree);
  const pendingBeds = () => Math.max(0, state.treeCap - beds.size);
  // Freies Feld für ein automatisch gesetztes Beet: erst die Startplätze, dann ringförmig um die Truhe
  // (gespeicherte Gebäude werden erst später geladen: ihre Felder hier schon freihalten)
  const savedBuildingCells = new Set((saved?.buildings ?? []).flatMap((b) => {
    const n = BUILDING_DEFS[b.type]?.size ?? 1;
    return Array.from({ length: n * n }, (_, k) => cellKey(b.cell[0] + (k % n), b.cell[1] + Math.floor(k / n)));
  }));
  function autoBedCell() {
    const ok = (i, j) => inGrid(i, j) && !isChestCell(i, j) && !beds.has(cellKey(i, j)) && !buildingAt.has(cellKey(i, j))
      && !savedBuildingCells.has(cellKey(i, j)) && !treeAt.has(cellKey(i, j));
    for (const [i, j] of AUTO_TREE_CELLS) if (ok(i, j)) return [i, j];
    for (let r = 2; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = CHEST_CELL[0] + di;
          const j = CHEST_CELL[1] + dj;
          if (ok(i, j)) return [i, j];
        }
      }
    }
    return null;
  }
  for (const key of state.beds) {
    const [i, j] = key.split(',').map(Number);
    if (inGrid(i, j)) addBed(i, j);
  }
  // Ältere Spielstände / neues Spiel: Beete unter alle Bäume und Markierungen, Rest automatisch
  if (!beds.size) {
    for (const t of trees) addBed(...t.cell);
    for (const d of saved?.seeds ?? []) addBed(...(Array.isArray(d) ? d : d.cell));
    while (pendingBeds() > 0) {
      const cell = autoBedCell();
      if (!cell) break;
      addBed(...cell);
    }
  }

  // ---- Waldrand im Nebel (nur Kulisse, wird neu gesetzt, wenn das Land wächst) ----
  const bushTex = [0, 1, 2].map((v) => T.canvasTexture(T.bushCanvas(v)));
  let ringSprites = [];
  function buildForestRing() {
    for (const s of ringSprites) removeSprite(s);
    ringSprites = [];
    const ringRand = rng(99);
    // Zufälliger Punkt mit Abstand dMin..dMax zum (abgerundeten) Landrand, passend zum Nebel
    const ringSpot = (dMin, dMax) => {
      for (let tries = 0; tries < 40; tries++) {
        const x = box.cx + (ringRand() * 2 - 1) * (box.hx + dMax);
        const z = box.cz + (ringRand() * 2 - 1) * (box.hz + dMax);
        const d = T.roundedRectDist(x - box.cx, z - box.cz, box.hx, box.hz);
        if (d >= dMin && d <= dMax) return [x, z];
      }
      return null;
    };
    const k = (box.hx + box.hz) / START_TILES; // längerer Rand = mehr Bäume
    for (let i = 0; i < Math.round(34 * k); i++) {
      const p = ringSpot(1.5, 4.5);
      if (!p) continue;
      const [x, z] = p;
      if (x - box.cx + (z - box.cz) > (box.hx + box.hz) * 0.3) continue; // vorne frei lassen, damit die Wiese sichtbar bleibt
      const v = Math.floor(ringRand() * 3);
      // Kräftig vernebelt, damit klar ist: das ist Kulisse, nicht klickbar
      const s = makeSprite(texFor('oak', v).mature, T.TREE_W, T.TREE_H, { fog: Math.min(0.88, 0.42 + fogAt(x, z) * 0.55), scale: 0.8 + ringRand() * 0.3 });
      s.position.set(x, 0, z);
      ringSprites.push(s);
    }
    for (let i = 0; i < Math.round(16 * k); i++) {
      const p = ringSpot(0.3, 2);
      if (!p) continue;
      const s = makeSprite(bushTex[i % 3], 22, 16, { fog: Math.min(0.85, 0.2 + fogAt(...p) * 0.7) });
      s.position.set(p[0], 0, p[1]);
      ringSprites.push(s);
    }
  }
  buildForestRing();

  // ---- Nebelschwaden ----
  const puffTex = T.softPuffTexture();
  const puffs = [];
  for (let i = 0; i < 18; i++) {
    const mat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.5, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.userData = { angle: (i / 18) * Math.PI * 2, r: 0.9 + (i % 3) * 0.5, speed: 0.04 + (i % 4) * 0.015, phase: i * 1.7 };
    const size = 4 + (i % 3);
    s.scale.set(size, size * 0.7, 1);
    s.renderOrder = 6;
    puffs.push(s);
    scene.add(s);
  }

  // ---- Partikel ----
  const texSquare = T.squareTexture();
  const texSparkle = T.sparkleTexture();
  const particles = [];
  const pool = [];
  function particle({
    tex = texSquare, pos, vel = new THREE.Vector3(), color = '#ffffff', size = 0.08, life = 1,
    gravity = 9, drag = 0, ground = true, sway = 0, additive = false, grow = 0, spin = 0, stretch = 1,
  }) {
    const s = pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    s.material.map = tex;
    s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.opacity = 1;
    s.material.rotation = stretch === 1 ? rand() * Math.PI : 0;
    s.material.needsUpdate = true;
    s.position.copy(pos);
    s.scale.set(size, size * stretch, 1);
    s.renderOrder = 4;
    scene.add(s);
    particles.push({
      s, vel: vel.clone(), base: new THREE.Color(color), size, life, max: life,
      gravity, drag, ground, sway, grow, spin, stretch, age: 0, phase: rand() * 6, resting: false,
    });
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.s);
        pool.push(p.s);
        particles.splice(i, 1);
        continue;
      }
      if (!p.resting) {
        p.vel.y -= p.gravity * dt;
        if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.s.position.addScaledVector(p.vel, dt);
        if (p.sway) p.s.position.addScaledVector(SCREEN_RIGHT, Math.sin(p.age * 4 + p.phase) * p.sway * dt);
        p.s.material.rotation += p.spin * dt;
        if (p.ground && p.s.position.y <= 0.03) {
          p.s.position.y = 0.03;
          p.resting = true;
        }
      }
      const fade = Math.min(1, p.life / Math.min(0.35, p.max * 0.5));
      p.s.material.opacity = fade;
      const sc = p.size * (1 + p.grow * p.age);
      p.s.scale.set(sc, sc * p.stretch, 1);
      p.s.material.color.copy(p.base).multiply(curTint);
    }
  }

  const WOOD_CHIPS = ['#e2b878', '#c4924f', '#a8743c', '#6e4220'];
  function burstChips(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      const v = SCREEN_RIGHT.clone().multiplyScalar(randRange(-2.2, 2.2))
        .addScaledVector(TO_CAMERA, randRange(0.3, 1.2));
      v.y = randRange(1.8, 3.8);
      particle({ pos, vel: v, color: pick(WOOD_CHIPS), size: randRange(0.06, 0.11), life: randRange(0.7, 1.1), gravity: 11, spin: randRange(-8, 8) });
    }
  }
  function dropLeaves(tree, n, spread = 1.4, from = 1.5) {
    const pal = texOf(tree).pal;
    for (let i = 0; i < n; i++) {
      const pos = new THREE.Vector3(tree.x, randRange(from, from + 1), tree.z)
        .addScaledVector(SCREEN_RIGHT, randRange(-spread, spread) / 2);
      const vel = new THREE.Vector3(randRange(-0.3, 0.3), randRange(0, 0.8), randRange(-0.3, 0.3));
      particle({
        pos, vel, color: pick([pal.light, pal.mid, pal.hi]), size: randRange(0.07, 0.1),
        life: randRange(1.6, 2.6), gravity: 1.3, drag: 1.5, sway: 1.6, spin: randRange(-3, 3),
      });
    }
  }
  function sparkles(pos, n, color = '#ffe27a', speed = 1.5) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(randRange(-1, 1), randRange(0.3, 1.2), randRange(-1, 1)).multiplyScalar(speed);
      particle({ tex: texSparkle, pos, vel: v, color, size: randRange(0.1, 0.16), life: randRange(0.35, 0.6), gravity: 1.5, ground: false, additive: true, grow: -1.2 });
    }
  }
  function dust(pos, n) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(randRange(-1.2, 1.2), randRange(0.2, 0.7), randRange(-1.2, 1.2));
      particle({ tex: puffTex, pos: pos.clone().add(new THREE.Vector3(randRange(-0.3, 0.3), 0.1, randRange(-0.3, 0.3))), vel: v, color: '#d8c8a8', size: randRange(0.4, 0.7), life: randRange(0.5, 0.8), gravity: 0, drag: 3, ground: false, grow: 1.5 });
    }
  }

  // ---- Items (Holzscheite, Goldholz, Setzlinge) ----
  // Grafik je Item (Schlüssel = Inventar-Schlüssel aus ITEM_DEFS). Neue Holzarten bekommen hier ihre Textur.
  const ITEM_TYPES = new Map();
  function itemType(key) {
    if (!ITEM_TYPES.has(key)) {
      const c = itemCanvas(key);
      ITEM_TYPES.set(key, { tex: T.canvasTexture(c), w: c.width, h: c.height });
    }
    return ITEM_TYPES.get(key);
  }
  const OLD_KINDS = { log: 'wood', gold: 'goldwood' }; // ältere Spielstände
  const ITEM_SCALE = 1.15;
  const items = [];
  let flyingCount = 0; // Items, die gerade zur Truhe fliegen (belegen schon einen Platz)

  // idle = stammt von einem Baum, den ein Worker oder der Specht gefällt hat (zählt für den Offline-Fortschritt)
  function spawnItem(pos, vel, kind = 'wood', idle = false) {
    kind = OLD_KINDS[kind] ?? kind;
    const type = itemType(kind);
    const sprite = makeSprite(type.tex, type.w, type.h, { center: [0.5, 0.5], scale: ITEM_SCALE });
    sprite.position.copy(pos);
    const base = sprite.scale.clone();
    const shadow = makeShadow(pos.x, pos.z, 0.55);
    items.push({
      sprite, shadow, base, vel, kind, idle, state: 'air', t: 0, from: null, mid: null,
      restY: (type.h * PX * ITEM_SCALE) / 2,
      spin: randRange(-9, 9), phase: rand() * 6, hover: 0, twinkle: randRange(0.5, 2), trail: 0, restTime: 0,
    });
  }

  // Jedes Item belegt einen Truhen-Platz
  let reservedSlots = 0; // Plätze, die Worker für getragene/angepeilte Scheite reserviert haben
  const hasRoom = () => chestUsed(state) + flyingCount + reservedSlots < state.woodCap;

  // Klick auf ein Item: es fliegt zur Truhe; mit „Weite Hand“ auch alle Items im Umkreis
  function collectAt(item) {
    if (!hasRoom()) runAutoSell();
    if (!hasRoom()) {
      sfx.deny();
      floater('Chest full!', item.sprite.position.clone().setY(0.9), 'floater-warn');
      emit('chestFull');
      item.state = 'air';
      item.vel.set(0, 2.2, 0);
      return;
    }
    sfx.pop();
    launchItem(item);
    if (state.pickupRadius > 0) {
      const center = item.sprite.position;
      for (const other of items) {
        if (other.state === 'fly' || other.state === 'carried' || other === item) continue;
        if (other.sprite.position.distanceTo(center) > state.pickupRadius) continue;
        if (hasRoom()) launchItem(other, randRange(0.03, 0.15));
      }
    }
  }

  function launchItem(item, delay = 0) {
    sparkles(item.sprite.position, 5, item.kind === 'goldwood' ? '#ffd76a' : '#fff3b0', 1.2);
    item.state = 'fly';
    item.t = -delay / 0.55;
    item.from = item.sprite.position.clone();
    const dist = item.from.distanceTo(CHEST_TOP);
    item.mid = item.from.clone().lerp(CHEST_TOP, 0.5).add(new THREE.Vector3(0, 1.6 + dist * 0.15, 0));
    flyingCount++;
  }

  function depositItem(item, idx) {
    removeSprite(item.sprite);
    groundScene.remove(item.shadow);
    items.splice(idx, 1);
    flyingCount--;
    chestOpenTimer = 0.5;
    chestBounce = 1;
    sfx.deposit();
    state.inventory[item.kind] = (state.inventory[item.kind] ?? 0) + 1;
    if (item.idle) trackIdle(state, item.kind);
    if (ITEM_DEFS[item.kind]?.type === 'sapling') {
      sparkles(CHEST_TOP.clone().setY(0.7), 6, '#b8ff8a');
      floater('+1 [[icon:sapling]]', new THREE.Vector3(0, 1.5, 0), 'floater-sapling');
    } else if (item.kind === 'goldwood') {
      sparkles(CHEST_TOP.clone().setY(0.7), 14);
      floater('+1 Gold', new THREE.Vector3(0, 1.5, 0), 'floater-gold');
    } else {
      sparkles(CHEST_TOP.clone().setY(0.7), 7);
      floater('+1', new THREE.Vector3(0, 1.5, 0), 'floater-wood');
    }
    emit('itemDeposited', { kind: item.kind });
    if (chestUsed(state) >= state.woodCap) emit('chestFull');
  }

  // Auto-Verkauf: sobald die Truhe voll ist (inkl. fliegender und von Workern reservierter Plätze),
  // wird nach den Regeln aus der Truhe verkauft (Item an/aus + Menge, die bleiben soll)
  const chestEffectivelyFull = () => chestUsed(state) + flyingCount + reservedSlots >= state.woodCap;
  let autoSellTimer = 0;
  function runAutoSell() {
    if (!state.autoSell) return 0;
    const earned = autoSellNow(state);
    if (earned > 0) {
      sfx.coin();
      sparkles(CHEST_TOP.clone().setY(0.9), 12, '#ffe27a', 2);
      floater(`+${formatNumber(earned)} [[icon:coin]]`, new THREE.Vector3(0, 2.1, 0), 'floater-gold');
      emit('sold', { earned, auto: true });
    }
    return earned;
  }
  function updateAutoSell(dt) {
    autoSellTimer -= dt;
    if (autoSellTimer > 0) return;
    autoSellTimer = 0.3;
    if (state.autoSell && chestEffectivelyFull()) runAutoSell();
  }

  // Liegende Items aus dem Spielstand wiederherstellen
  for (const d of saved?.items ?? []) {
    const type = itemType(OLD_KINDS[d.kind] ?? d.kind);
    spawnItem(new THREE.Vector3(d.x, (type.h * PX * ITEM_SCALE) / 2, d.z), new THREE.Vector3(), d.kind, !!d.idle);
  }

  function updateItems(dt, time) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.state === 'carried') continue; // trägt gerade ein Worker
      const s = it.sprite;
      if (it.state === 'air') {
        it.vel.y -= 14 * dt;
        s.position.addScaledVector(it.vel, dt);
        s.material.rotation += it.spin * dt;
        // am Landrand abprallen
        for (const [ax, lo, hi] of [['x', box.minX, box.maxX], ['z', box.minZ, box.maxZ]]) {
          const v = THREE.MathUtils.clamp(s.position[ax], lo + 0.35, hi - 0.35);
          if (v !== s.position[ax]) {
            s.position[ax] = v;
            it.vel[ax] *= -0.5;
          }
        }
        if (s.position.y <= it.restY) {
          s.position.y = it.restY;
          if (it.vel.y < -1.4) {
            sfx.thud(Math.min(0.14, -it.vel.y * 0.02));
            it.vel.y *= -0.38;
            it.vel.x *= 0.55;
            it.vel.z *= 0.55;
            it.spin *= 0.4;
          } else {
            it.state = 'rest';
            it.restTime = 0;
            it.vel.set(0, 0, 0);
            s.material.rotation = randRange(-0.25, 0.25);
          }
        }
      } else if (it.state === 'rest') {
        s.position.y = it.restY + Math.sin(time * 3 + it.phase) * 0.03;
        it.twinkle -= dt;
        if (it.twinkle <= 0) {
          const gold = it.kind === 'goldwood';
          it.twinkle = gold ? randRange(0.3, 0.7) : randRange(1.4, 3);
          particle({ tex: texSparkle, pos: s.position.clone().add(new THREE.Vector3(0, 0.15, 0)).addScaledVector(SCREEN_RIGHT, randRange(-0.25, 0.25)), color: gold ? '#ffe27a' : '#ffffff', size: 0.14, life: 0.35, gravity: 0, ground: false, additive: true, grow: -1.5 });
        }
        // Magnet-Truhe: nach 5 Sekunden fliegt das Item von selbst
        it.restTime += dt;
        if (state.magnet && it.restTime > state.magnetDelay && !it.reservedBy && hasRoom()) launchItem(it);
      } else if (it.state === 'fly') {
        it.t = Math.min(1, it.t + dt / 0.55);
        if (it.t < 0) continue; // gestaffelter Start (Weite Hand)
        const e = it.t * it.t * (3 - 2 * it.t);
        const a = (1 - e) * (1 - e);
        const b = 2 * (1 - e) * e;
        const c = e * e;
        s.position.set(
          a * it.from.x + b * it.mid.x + c * CHEST_TOP.x,
          a * it.from.y + b * it.mid.y + c * CHEST_TOP.y,
          a * it.from.z + b * it.mid.z + c * CHEST_TOP.z,
        );
        s.material.rotation += 11 * dt;
        it.trail -= dt;
        if (it.trail <= 0) {
          it.trail = 0.035;
          particle({ tex: texSparkle, pos: s.position, color: '#ffd76a', size: 0.11, life: 0.3, gravity: 0, ground: false, additive: true, grow: -2 });
        }
        if (it.t >= 1) {
          depositItem(it, i);
          continue;
        }
      }
      // Hover-Vergrößerung + Schrumpfen kurz vor der Truhe
      it.hover += ((it === hoverItem ? 1 : 0) - it.hover) * Math.min(1, dt * 14);
      const shrink = it.state === 'fly' ? 1 - Math.max(0, it.t - 0.75) * 1.6 : 1;
      const k = (1 + it.hover * 0.25) * shrink;
      s.scale.set(it.base.x * k, it.base.y * k, 1);
      it.shadow.position.set(s.position.x, 0.01, s.position.z);
      const hgt = Math.max(0, s.position.y - it.restY);
      const ss = Math.max(0.2, 1 - hgt * 0.35) * (it.state === 'fly' ? 0.7 : 1);
      it.shadow.scale.set(0.55 * ss, 0.33 * ss, 1);
    }
  }

  // ---- Schmetterlinge & Glühwürmchen ----
  const butterflies = ['#f4e04d', '#ffffff', '#f08fb0'].map((color, i) => {
    const frames = [T.butterflyTexture(true, color), T.butterflyTexture(false, color)];
    const s = makeSprite(frames[0], 7, 5, { center: [0.5, 0.5], scale: 1.4 });
    s.position.set(randRange(-3, 3), 1, randRange(-3, 3));
    return { s, frames, target: new THREE.Vector3(), flap: 0, retarget: 0, phase: i };
  });
  const fireflies = Array.from({ length: 14 }, () => {
    const mat = new THREE.SpriteMaterial({ map: texSquare, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd8ff7a });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.07, 0.07, 1);
    s.position.set(randRange(box.minX, box.maxX), randRange(0.3, 1.6), randRange(box.minZ, box.maxZ));
    scene.add(s);
    return { s, phase: rand() * 10, vel: new THREE.Vector3() };
  });

  function updateCritters(dt, time) {
    const night = nightAmount(state.hour);
    for (const b of butterflies) {
      b.s.visible = night < 0.5;
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.retarget = randRange(1.5, 3.5);
        b.target.set(randRange(box.minX + 0.6, box.maxX - 0.6), randRange(0.5, 1.5), randRange(box.minZ + 0.6, box.maxZ - 0.6));
      }
      const dir = b.target.clone().sub(b.s.position);
      const d = dir.length();
      if (d > 0.05) b.s.position.addScaledVector(dir.normalize(), Math.min(d, dt * 0.9));
      b.s.position.y += Math.sin(time * 6 + b.phase) * 0.006;
      b.flap += dt;
      b.s.material.map = Math.floor(b.flap * 9) % 2 ? b.frames[1] : b.frames[0];
    }
    for (const f of fireflies) {
      f.s.visible = night > 0.05;
      f.vel.add(new THREE.Vector3(randRange(-1, 1), randRange(-0.6, 0.6), randRange(-1, 1)).multiplyScalar(dt * 1.5));
      f.vel.multiplyScalar(0.98);
      f.s.position.addScaledVector(f.vel, dt);
      f.s.position.x = THREE.MathUtils.clamp(f.s.position.x, box.minX - 1, box.maxX + 1);
      f.s.position.z = THREE.MathUtils.clamp(f.s.position.z, box.minZ - 1, box.maxZ + 1);
      f.s.position.y = THREE.MathUtils.clamp(f.s.position.y, 0.2, 2);
      f.s.material.opacity = night * (0.35 + 0.65 * Math.max(0, Math.sin(time * 2.5 + f.phase)));
    }
  }

  // ---- Bildschirm-Helfer ----
  function worldToScreen(v) {
    camera.updateMatrixWorld();
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * viewW, y: (-p.y * 0.5 + 0.5) * viewH };
  }

  function floater(text, worldPos, cls = '') {
    const { x, y } = worldToScreen(worldPos);
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    setIconText(el, text);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    floaterLayer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ---- Axthieb: die Axt holt aus, schlägt unten in den Stamm, bleibt kurz stecken und federt zurück ----
  // Wie von einem unsichtbaren Holzfäller geführt: Drehpunkt ist der Griff, die Schneide trifft den Stamm.
  const SWING_SCALE = 3;
  const SWING_MS = 400;
  const IMPACT_AT = 0.4; // Anteil der Animation bis zum Einschlag
  const WINDUP_DEG = 105;
  const CUR = { default: 'var(--cur-default)', pointer: 'var(--cur-pointer)', axe: 'var(--cur-axe)' };
  const axeInfo = T.axeArt();
  const swingWrap = document.createElement('div');
  swingWrap.className = 'axe-swing-wrap';
  const swingAxe = document.createElement('div');
  swingAxe.className = 'axe-swing';
  const axeSize = axeInfo.canvas.width * SWING_SCALE;
  const [ex, ey] = axeInfo.edge.map((v) => v * SWING_SCALE);
  const [gx, gy] = axeInfo.grip.map((v) => v * SWING_SCALE);
  Object.assign(swingAxe.style, {
    width: axeSize + 'px',
    height: axeSize + 'px',
    left: -ex + 'px', // Schneide liegt im Ursprung des Wrappers (= Einschlagpunkt)
    top: -ey + 'px',
    transformOrigin: `${gx}px ${gy}px`,
    backgroundImage: `url("${T.axeCanvas(SWING_SCALE).toDataURL()}")`,
  });
  const sw = T.swooshCanvas(SWING_SCALE, WINDUP_DEG);
  const swoosh = document.createElement('div');
  swoosh.className = 'axe-swoosh';
  Object.assign(swoosh.style, {
    width: sw.size + 'px',
    height: sw.size + 'px',
    left: -ex + gx - sw.size / 2 + 'px',
    top: -ey + gy - sw.size / 2 + 'px',
    backgroundImage: `url("${sw.canvas.toDataURL()}")`,
  });
  swingWrap.append(swoosh, swingAxe);
  floaterLayer.appendChild(swingWrap);
  let swingAnims = [];
  let swingUntil = 0;
  let hoverCursor = CUR.default;

  function swingAt(x, y, fromLeft) {
    for (const a of swingAnims) a.cancel();
    swingWrap.style.display = 'block';
    swingWrap.style.left = x + 'px';
    swingWrap.style.top = y + 'px';
    swingWrap.style.transform = fromLeft ? 'scaleX(-1)' : 'none';
    swingAxe.classList.remove('crit');
    const axeAnim = swingAxe.animate([
      { transform: 'rotate(30deg)', opacity: 0, offset: 0, easing: 'ease-out' },
      { transform: `rotate(${WINDUP_DEG}deg)`, opacity: 1, offset: 0.24, easing: 'cubic-bezier(0.6, 0, 1, 0.5)' }, // ausholen
      { transform: 'rotate(-7deg)', offset: IMPACT_AT, easing: 'ease-out' }, // Einschlag, leicht hineingetrieben
      { transform: 'rotate(4deg)', offset: 0.5 }, // Rückprall
      { transform: 'rotate(0deg)', offset: 0.58 },
      { transform: 'rotate(0deg)', opacity: 1, offset: 0.8, easing: 'ease-in' }, // steckt kurz im Holz
      { transform: 'rotate(30deg)', opacity: 0, offset: 1 }, // herausziehen
    ], { duration: SWING_MS, fill: 'forwards' });
    const swooshAnim = swoosh.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.27 },
      { opacity: 1, offset: IMPACT_AT },
      { opacity: 0, offset: 0.62 },
    ], { duration: SWING_MS, fill: 'forwards' });
    swingAnims = [axeAnim, swooshAnim];
    swingUntil = performance.now() + SWING_MS;
    renderer.domElement.style.cursor = 'none'; // der echte Cursor verschwindet, solange die Axt schwingt
    axeAnim.onfinish = () => {
      if (performance.now() < swingUntil - 5) return; // inzwischen neuer Hieb
      swingWrap.style.display = 'none';
      renderer.domElement.style.cursor = hoverCursor;
    };
  }

  function impactBurst(x, y, crit) {
    const burst = document.createElement('div');
    burst.className = crit ? 'hit-burst crit' : 'hit-burst';
    burst.style.left = x + 'px';
    burst.style.top = y + 'px';
    floaterLayer.appendChild(burst);
    setTimeout(() => burst.remove(), 320);
    if (crit) swingAxe.classList.add('crit');
  }

  // Klick auf einen Baum: Hieb starten, Schaden + Effekte genau beim Einschlag
  function startChop(tree, clientX) {
    const trunk = new THREE.Vector3(tree.x, 0.5 + randRange(-0.06, 0.12), tree.z);
    const sp = worldToScreen(trunk);
    const rect = floaterLayer.getBoundingClientRect();
    swingAt(sp.x, sp.y, clientX - rect.left < sp.x);
    setTimeout(() => {
      if (tree.phase === 'grown') hitTree(tree, trunk, sp);
    }, SWING_MS * IMPACT_AT);
  }

  // Lebensbalken über dem Baum
  function showHp(tree) {
    if (!tree.hpEl) {
      tree.hpEl = document.createElement('div');
      tree.hpEl.className = 'hpbar';
      tree.hpEl.innerHTML = renderIcons('<div class="hpbar-fill"></div>');
      floaterLayer.appendChild(tree.hpEl);
    }
    tree.hpTimer = 2.5;
    const ratio = Math.max(0, tree.hp / speciesOf(tree.species).hp);
    const fill = tree.hpEl.firstChild;
    fill.style.width = ratio * 100 + '%';
    fill.style.background = ratio > 0.5 ? '#7fc95e' : ratio > 0.25 ? '#f0c84a' : '#e8603c';
    tree.hpEl.classList.remove('hit');
    void tree.hpEl.offsetWidth;
    tree.hpEl.classList.add('hit');
  }

  // ---- Eingabe ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverItem = null;

  function localPointer(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function pickItem(ev) {
    const { x, y } = localPointer(ev);
    const radius = Math.max(16, (viewH / viewHeight) * 0.42);
    let best = null;
    let bestD = radius;
    for (const it of items) {
      if (it.state === 'fly' || it.state === 'carried') continue;
      const p = worldToScreen(it.sprite.position);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  function pickTree(ev) {
    const { x, y } = localPointer(ev);
    ndc.set((x / viewW) * 2 - 1, -(y / viewH) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(trees.filter((t) => t.phase === 'grown').map((t) => t.sprite), false);
    for (const h of hits) {
      const tree = h.object.userData.tree;
      if (alphaHit(texOf(tree).alpha, h.uv)) return { tree, point: h.point };
    }
    return null;
  }

  // Nur echte Pixel des Baums zählen (mit 2 Pixeln Toleranz)
  function alphaHit(img, uv) {
    if (!uv) return true;
    const cx = Math.floor(uv.x * img.width);
    const cy = Math.floor((1 - uv.y) * img.height);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        if (img.data[(y * img.width + x) * 4 + 3] > 0) return true;
      }
    }
    return false;
  }

  // ---- Platzier-Modus (Setzlinge, Böden, später Gebäude) ----
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const gridOverlay = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
  );
  gridOverlay.rotation.x = -Math.PI / 2;
  gridOverlay.renderOrder = 3;
  gridOverlay.visible = false;
  groundScene.add(gridOverlay);
  function setGridOverlay() {
    const m = gridOverlay.material;
    m.map?.dispose();
    m.map = T.gridOverlayTexture(bounds.maxI - bounds.minI + 1, bounds.maxJ - bounds.minJ + 1);
    m.needsUpdate = true;
    gridOverlay.scale.set(box.hx * 2, box.hz * 2, 1);
    gridOverlay.position.set(box.cx, 0.012, box.cz);
  }
  setGridOverlay();

  const frameMat = new THREE.MeshBasicMaterial({ map: T.cellFrameTexture(), transparent: true, depthWrite: false });
  const cellFrame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMat);
  cellFrame.rotation.x = -Math.PI / 2;
  cellFrame.position.y = 0.014;
  cellFrame.renderOrder = 4;
  cellFrame.visible = false;
  groundScene.add(cellFrame);

  const ghostTree = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFor('oak', 0).sapling, transparent: true, opacity: 0.7, depthWrite: false }));
  ghostTree.center.set(0.5, 0);
  ghostTree.scale.set(TREE_SW, TREE_SH, 1);
  ghostTree.visible = false;
  scene.add(ghostTree);
  const ghostSoil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: soilTex, transparent: true, opacity: 0.75, depthWrite: false }));
  ghostSoil.rotation.x = -Math.PI / 2;
  ghostSoil.position.y = 0.01;
  ghostSoil.renderOrder = 3;
  ghostSoil.visible = false;
  groundScene.add(ghostSoil);

  const banner = document.createElement('div');
  banner.className = 'place-banner';
  banner.hidden = true;
  banner.innerHTML = renderIcons('<span class="place-text"></span><span class="place-hint">Right-click / ESC: done</span><button class="place-cancel">Done</button>');
  container.parentElement.appendChild(banner);
  const bannerText = banner.querySelector('.place-text');
  banner.querySelector('.place-cancel').addEventListener('click', () => endPlacement());

  let placement = null; // { ghost, isValid(i,j) -> true | 'Grund', place(i,j), keepGoing(), label() }
  let hoverCell = null;

  function startPlacement(opts) {
    endPlacement();
    placement = opts;
    gridOverlay.visible = true;
    banner.hidden = false;
    hoverCell = null;
    renderer.domElement.style.cursor = CUR.pointer;
    sfx.knock(1.3, 0.12);
  }

  function endPlacement() {
    if (!placement) return;
    placement = null;
    gridOverlay.visible = false;
    cellFrame.visible = false;
    ghostTree.visible = false;
    ghostSoil.visible = false;
    ghostBuilding.visible = false;
    ghostDecal.visible = false;
    banner.hidden = true;
    renderer.domElement.style.cursor = CUR.default;
  }

  // Punkt auf dem Boden unter dem Mauszeiger (Welt)
  function groundAtPointer(ev) {
    const { x, y } = localPointer(ev);
    ndc.set((x / viewW) * 2 - 1, -(y / viewH) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  }

  function cellAtPointer(ev) {
    const hit = groundAtPointer(ev);
    if (!hit) return null;
    const i = Math.round(hit.x + GRID_OFFSET);
    const j = Math.round(hit.z + GRID_OFFSET);
    return inGrid(i, j) ? [i, j] : null;
  }

  function updatePlacement(time) {
    if (!placement) return;
    setIconText(bannerText, placement.label());
    if (!hoverCell) {
      cellFrame.visible = ghostTree.visible = ghostSoil.visible = ghostBuilding.visible = ghostDecal.visible = false;
      return;
    }
    const [i, j] = hoverCell;
    const valid = placement.isValid(i, j) === true;
    const size = placement.size ?? 1;
    const off = (size - 1) / 2;
    cellFrame.visible = true;
    cellFrame.position.set(cellX(i) + off, 0.014, cellX(j) + off);
    frameMat.color.set(valid ? 0x8dff6a : 0xff5a4a);
    const pulse = 1 + Math.sin(time * 8) * 0.04;
    cellFrame.scale.set(size * pulse, size * pulse, 1);
    ghostBuilding.visible = placement.ghost === 'building';
    ghostDecal.visible = placement.ghost === 'building' && !!placement.decalTex;
    if (ghostBuilding.visible) {
      const isSaw = placement.type === 'sawmill';
      ghostBuilding.material.map = isSaw ? sawmillTex[0].idle : irrigationTex[placement.type];
      ghostBuilding.material.needsUpdate = true;
      ghostBuilding.scale.set((isSaw ? 52 * 0.95 : 16 * 1.1) * PX, (isSaw ? 48 * 0.95 : 20 * 1.1) * PX, 1);
      ghostBuilding.position.set(cellX(i) + off, 0, cellX(j) + off);
      ghostBuilding.material.color.set(valid ? 0xffffff : 0xff8a7a);
    }
    if (ghostDecal.visible) {
      ghostDecal.material.map = placement.decalTex;
      ghostDecal.material.needsUpdate = true;
      ghostDecal.position.set(cellX(i), 0.013, cellX(j));
    }
    ghostTree.visible = placement.ghost === 'sapling' && valid;
    ghostSoil.visible = (placement.ghost === 'soil' || placement.ghost === 'bed') && valid;
    ghostTree.position.set(cellX(i), 0, cellX(j));
    ghostSoil.position.set(cellX(i), 0.01, cellX(j));
  }

  function placeAt(i, j) {
    const ok = placement.isValid(i, j);
    if (ok !== true) {
      sfx.deny();
      floater(ok, new THREE.Vector3(cellX(i), 0.8, cellX(j)), 'floater-warn');
      return;
    }
    placement.place.call(placement, i, j);
    if (!placement.keepGoing()) endPlacement();
  }

  // Setzlinge aus der Truhe auf freie Felder pflanzen
  function beginPlanting(species = null) {
    // ohne Angabe: die erste Art, von der Setzlinge da sind
    const sp = speciesOf(species ?? pickSaplingFor(state.inventory, DEFAULT_SPECIES, 0) ?? DEFAULT_SPECIES);
    const key = sp.sapling;
    if ((state.inventory[key] ?? 0) <= 0) return;
    ghostTree.material.map = texFor(sp.id, sp.variants[0]).sapling;
    startPlacement({
      ghost: 'sapling',
      isValid: (i, j) => {
        if (isChestCell(i, j)) return 'Chest is here';
        const tree = treeAt.get(cellKey(i, j));
        if (tree) return tree.phase === 'stump' && !tree.autoRegrow ? true : 'This bed is taken';
        if (seeds.has(cellKey(i, j))) return 'This bed is taken';
        if (!beds.has(cellKey(i, j))) return freeBeds().length ? 'Trees only grow in tree beds' : 'All tree beds are full';
        return true;
      },
      place: (i, j) => {
        state.inventory[key] -= 1;
        const stump = treeAt.get(cellKey(i, j));
        if (stump) {
          plantOnStump(stump, sp.id); // direkt auf den Stumpf
          return;
        }
        if (state.workers.length) {
          addSeed(i, j, false, sp.id); // ein Worker kommt und pflanzt ihn
          return;
        }
        const t = addTree(i, j, pick(sp.variants), { growing: true, auto: false, species: sp.id });
        t.growth = state.headStart;
        clearDecor(i, j);
        sfx.pop();
        dust(new THREE.Vector3(t.x, 0, t.z), 3);
        sparkles(new THREE.Vector3(t.x, 0.4, t.z), 8, '#b8ff8a', 1.2);
        floater('Planted!', new THREE.Vector3(t.x, 1, t.z), 'floater-sapling');
      },
      keepGoing: () => (state.inventory[key] ?? 0) > 0,
      label: () => `${sp.icon} Plant ${sp.name} · ${state.inventory[key]} left · ${freeBeds().length} free tree bed${freeBeds().length === 1 ? '' : 's'} · [[icon:hand]] bed or stump`,
    });
  }

  // Neues Baumbeet setzen (nach einem neuen Baumplatz): Feld frei wählen
  function beginBedPlacement() {
    if (pendingBeds() <= 0) return false;
    ghostSoil.material.map = bedTex;
    ghostSoil.material.needsUpdate = true;
    startPlacement({
      ghost: 'bed',
      isValid: (i, j) => {
        const key = cellKey(i, j);
        if (isChestCell(i, j)) return 'Chest is here';
        if (beds.has(key)) return 'Already a tree bed';
        if (buildingAt.has(key)) return 'A building is here';
        if (treeAt.has(key) || seeds.has(key)) return 'Tile taken';
        return true;
      },
      place: (i, j) => {
        addBed(i, j);
        const pos = new THREE.Vector3(cellX(i), 0, cellX(j));
        sfx.thud(0.25);
        sfx.buy();
        dust(pos, 6);
        sparkles(pos.clone().setY(0.3), 18, '#b8ff8a', 1.8);
        floater('New tree bed!', pos.clone().setY(1), 'floater-level');
        emit('bedPlaced');
      },
      keepGoing: () => pendingBeds() > 0,
      label: () => `[[icon:oak]] New tree bed · ${pendingBeds()} to place · [[icon:hand]] pick any free tile`,
    });
    return true;
  }

  // Boden kaufen und auf ein Feld legen (bezahlt wird erst beim Platzieren)
  function beginSoil(type) {
    const def = SOIL_DEFS[type];
    ghostSoil.material.map = soilTex;
    ghostSoil.material.needsUpdate = true;
    const price = () => soilPrice(state, type);
    startPlacement({
      ghost: 'soil',
      isValid: (i, j) => {
        if (isChestCell(i, j)) return 'Chest is here';
        if (state.soils[cellKey(i, j)] === type) return 'Already here';
        if (state.money < price()) return 'Not enough coins';
        return true;
      },
      place: (i, j) => {
        state.money -= price();
        setSoil(i, j, type);
        sfx.thud(0.2);
        dust(new THREE.Vector3(cellX(i), 0, cellX(j)), 4);
        sparkles(new THREE.Vector3(cellX(i), 0.2, cellX(j)), 6, '#d8aa6a', 1);
      },
      keepGoing: () => state.money >= price(),
      label: () => `[[icon:planks]] ${def.name} · [[icon:coin]] ${formatNumber(price())} per tile · [[icon:hand]] tile`,
    });
  }

  renderer.domElement.addEventListener('contextmenu', (ev) => ev.preventDefault());
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') endPlacement();
  });

  // ---- Kamera verschieben: mit links auf freiem Boden ziehen oder mit der mittleren Maustaste ----
  let drag = null; // { sx, sy, grab: Bodenpunkt unter der Maus beim Start, moved }
  const clampPan = (v) => {
    v.x = THREE.MathUtils.clamp(v.x, box.minX, box.maxX);
    v.z = THREE.MathUtils.clamp(v.z, box.minZ, box.maxZ);
    return v;
  };
  const applyCamera = () => camera.position.copy(CAM_BASE).add(camPan);
  function startDrag(ev) {
    const grab = groundAtPointer(ev);
    if (grab) drag = { sx: ev.clientX, sy: ev.clientY, grab, moved: false };
  }
  function moveDrag(ev) {
    if (!drag.moved) {
      if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 5) return;
      drag.moved = true;
      renderer.domElement.setPointerCapture(ev.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    }
    applyCamera();
    const hit = groundAtPointer(ev);
    if (!hit) return;
    // Der gegriffene Bodenpunkt bleibt unter der Maus
    clampPan(camPan.add(drag.grab.clone().sub(hit)));
    panTarget.copy(camPan);
    applyCamera();
  }
  function endDrag() {
    if (drag?.moved) renderer.domElement.style.cursor = placement ? CUR.pointer : CUR.default;
    drag = null;
  }
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (ev.button === 1) {
      ev.preventDefault(); // kein Auto-Scroll
      startDrag(ev);
      return;
    }
    if (placement) {
      if (ev.button === 2) endPlacement();
      else if (ev.button === 0) {
        const cell = cellAtPointer(ev);
        if (cell) placeAt(...cell);
      }
      return;
    }
    if (ev.button !== 0) return;
    const item = pickItem(ev);
    if (item) {
      collectAt(item);
      return;
    }
    const hit = pickTree(ev);
    if (hit) {
      startChop(hit.tree, ev.clientX);
      return;
    }
    const stump = pickStump(ev);
    if (stump) {
      clickStump(stump);
      return;
    }
    const building = pickBuilding(ev);
    if (building) {
      building.bounce = 1;
      sfx.knock(1, 0.15);
      onBuildingClick?.(building);
      return;
    }
    const visitor = pickVisitor(ev);
    if (visitor) {
      visitor.hop = 1;
      sfx.knock(1.3, 0.15);
      onVisitorClick?.(visitor.order);
      return;
    }
    const bed = pickFreeBed(ev);
    if (bed) {
      clickBed(...bed);
      return;
    }
    startDrag(ev); // freier Boden: Kamera ziehen
  });
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (drag && !ev.buttons) endDrag(); // Maustaste außerhalb losgelassen
    if (drag) {
      moveDrag(ev);
      if (drag.moved) return;
    }
    if (placement) {
      hoverCell = cellAtPointer(ev);
      return;
    }
    hoverItem = pickItem(ev);
    hoverCursor = hoverItem ? CUR.pointer : pickTree(ev) ? CUR.axe : pickStump(ev) || pickBuilding(ev) || pickVisitor(ev) || pickFreeBed(ev) ? CUR.pointer : CUR.default;
    const cursor = performance.now() < swingUntil ? 'none' : hoverCursor;
    if (renderer.domElement.style.cursor !== cursor) renderer.domElement.style.cursor = cursor;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    hoverItem = null;
    hoverCell = null;
  });
  renderer.domElement.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    viewHeight = Math.min(viewMax(), Math.max(VIEW_MIN, viewHeight + Math.sign(ev.deltaY) * 0.8));
    resize();
  }, { passive: false });

  let combo = 0;
  let lastHit = -10;
  const fmtDmg = (d) => (Number.isInteger(d) ? String(d) : d.toFixed(1));

  // point = Einschlagpunkt am Stamm (Welt), screen = derselbe Punkt auf dem Bildschirm
  function hitTree(tree, point, screen) {
    tree.lastHitBy = null; // Spieler-Treffer
    // Holzfäller-Rhythmus: Treffer kurz hintereinander bauen eine Combo auf (+10 % je Treffer, bis comboMax)
    const now = performance.now() / 1000;
    combo = state.combo && now - lastHit < 0.8 ? Math.min(state.comboMax, combo + 1) : 0;
    lastHit = now;
    const critChance = state.critChance + (state.frenzy ? combo * 0.015 : 0);
    const isCrit = rand() < critChance;
    const dmg = state.clickPower * state.clickPowerMult * (isCrit ? state.critMult : 1) * (1 + combo * 0.1);
    tree.hp -= dmg;
    tree.hitT = 1;
    tree.flashT = 1;
    const chipPos = point.clone().addScaledVector(VIEW_DIR, 0.4);
    impactBurst(screen.x, screen.y, isCrit);
    dropLeaves(tree, isCrit ? 6 : 3);
    const numPos = point.clone().add(new THREE.Vector3(0, 0.35, 0));
    if (isCrit) {
      sfx.crit();
      shake = Math.max(shake, 0.1);
      burstChips(chipPos, 16);
      sparkles(chipPos, 8, '#ffb14a', 2.2);
      floater(`CRIT! -${fmtDmg(dmg)}`, numPos, 'floater-crit');
    } else {
      sfx.chop();
      shake = Math.max(shake, 0.035);
      burstChips(chipPos, 8);
      floater(`-${fmtDmg(dmg)}`, numPos, 'floater-dmg');
    }
    if (combo >= 2) {
      const mult = (1 + combo * 0.1).toFixed(1);
      floater(`Combo ×${mult}`, new THREE.Vector3(tree.x, TREE_SH + 0.5, tree.z), 'floater-combo');
    }
    if (rand() < state.splinterChance) {
      const vel = TO_CAMERA.clone().multiplyScalar(randRange(0.6, 1.4)).add(new THREE.Vector3(randRange(-0.6, 0.6), 3.8, randRange(-0.6, 0.6)));
      spawnItem(new THREE.Vector3(tree.x, 0.6, tree.z), vel, speciesOf(tree.species).log);
      floater('Splinter!', numPos.clone().setY(numPos.y + 0.3), 'floater-sapling');
    }
    showHp(tree);
    if (tree.hp <= 0) {
      tree.phase = 'falling';
      tree.fall = 0;
      tree.fallDir = rand() < 0.5 ? -1 : 1;
    }
  }

  // Baum schlägt auf: Staub, Blätter, Holzscheite springen heraus
  function treeImpact(tree) {
    sfx.crash();
    shake = 0.22;
    // Richtung, in die der Baum gefallen ist (Rotation +: nach links am Bildschirm)
    const dir = SCREEN_RIGHT.clone().multiplyScalar(-tree.fallDir);
    const base = new THREE.Vector3(tree.x, 0, tree.z);
    for (let i = 0; i < 5; i++) dust(base.clone().addScaledVector(dir, 0.4 + i * 0.4), 2);
    const leafTree = { ...tree, x: tree.x + dir.x * 1.4, z: tree.z + dir.z * 1.4 };
    dropLeaves(leafTree, 16, 1.6, 0.2);
    const sp = speciesOf(tree.species);
    const tutorialTree = state.tutorial === 'chop';
    const n = tutorialTree ? 1 : state.woodPerTree + sp.logBonus;
    const idle = !!tree.lastHitBy; // Worker oder Specht haben gefällt
    const golden = tree === goldenTree; // Ereignis: jeder Stamm wird Goldholz
    if (golden) {
      goldenTree = null;
      sparkles(base.clone().setY(1), 30, '#ffe27a', 3);
      floater('GOLD!', base.clone().setY(1.8), 'floater-gold');
      sfx.fanfare();
      emit('goldenTreeFelled');
    }
    emit('treeFelled');
    for (let i = 0; i < n; i++) {
      const pos = base.clone().addScaledVector(dir, 0.5 + (i / Math.max(1, n - 1)) * 1.3).setY(0.5);
      const vel = dir.clone().multiplyScalar(randRange(-0.4, 0.9))
        .addScaledVector(TO_CAMERA, randRange(-0.6, 0.9))
        .add(new THREE.Vector3(randRange(-0.5, 0.5), randRange(3.2, 4.8), randRange(-0.5, 0.5)));
      spawnItem(pos, vel, golden || rand() < state.goldenChance ? 'goldwood' : sp.log, idle);
    }
    // Glückspilz: Worker mit „Lucky“ findet manchmal zusätzlich Goldholz
    if (tree.lastHitBy && rand() < traitLevel(tree.lastHitBy, 'lucky') * 0.04) {
      spawnItem(base.clone().setY(0.6), new THREE.Vector3(randRange(-0.6, 0.6), 4.8, randRange(-0.6, 0.6)), 'goldwood', idle);
      floater('Lucky!', base.clone().setY(1.6), 'floater-gold');
    }
    // Pflanz-Kreislauf: jeder Baum gibt 1 Setzling garantiert, dazu Chance auf einen zweiten.
    // Der Tutorial-Baum wächst stattdessen einmal von selbst nach.
    if (!tutorialTree) {
      const saplings = 1 + (rand() < SAPLING_BONUS_CHANCE + state.saplingBonus ? 1 : 0);
      for (let i = 0; i < saplings; i++) {
        const vel = new THREE.Vector3(randRange(-0.8, 0.8), 4.5, randRange(-0.8, 0.8));
        spawnItem(base.clone().setY(0.5), vel, sp.sapling, idle);
      }
    }
    tree.phase = 'stump';
    tree.autoRegrow = tutorialTree;
    tree.stumpTimer = 2;
    tree.reservedBy = null;
    tree.sprite.material.rotation = 0;
    tree.sprite.material.map = texOf(tree).stump;
    tree.flash.visible = false;
    tree.hpTimer = 0;
  }

  // ===================== Wetter & Ereignisse (gesteuert von randomevents.js) =====================
  const weather = { rain: 0, rainTarget: 0, storm: false, flash: 0, dropAcc: 0 };
  const RAIN_TINT = new THREE.Color(0x8494a8);
  const STORM_TINT = new THREE.Color(0x5a6478);
  const RAIN_BG = new THREE.Color(0x8c98a0);
  const WHITE = new THREE.Color(0xffffff);
  const GOLD_TINT = new THREE.Color(1.35, 1.08, 0.42);
  let goldenTree = null;
  let goldenSparkT = 0;

  function setWeather({ rain = 0, storm = false }) {
    weather.rainTarget = rain;
    weather.storm = storm;
  }
  function updateWeather(dt) {
    weather.rain += (weather.rainTarget - weather.rain) * Math.min(1, dt * 0.7);
    weather.flash = Math.max(0, weather.flash - dt * 3.5);
    const r = weather.rain;
    if (r > 0.01) {
      // trüberes Licht, Sturm noch dunkler
      curTint.lerp(weather.storm ? STORM_TINT : RAIN_TINT, 0.45 * r);
      curBg.lerp(RAIN_BG, 0.5 * r);
      // Regentropfen als schräge Striche
      weather.dropAcc += dt * 60 * r * (weather.storm ? 9 : 5);
      const windX = weather.storm ? -2.4 : -0.7;
      while (weather.dropAcc >= 1) {
        weather.dropAcc -= 1;
        const pos = new THREE.Vector3(randRange(box.minX - 2, box.maxX + 3), randRange(3.2, 5), randRange(box.minZ - 2, box.maxZ + 3));
        particle({ pos, vel: new THREE.Vector3(windX, -10, windX * 0.3), color: '#b4d4ff', size: 0.035, stretch: 6, life: 0.48, gravity: 3, ground: false });
      }
    }
    if (weather.flash > 0) {
      curTint.lerp(WHITE, weather.flash * 0.8);
      curBg.lerp(WHITE, weather.flash * 0.7);
    }
  }

  // Blitz: Lichtblitz, Donner, ein ausgewachsener Baum fällt um (die Stämme darf man einsammeln)
  function lightning() {
    weather.flash = 1;
    shake = Math.max(shake, 0.35);
    sfx.thunder();
    const grown = trees.filter((t) => t.phase === 'grown' && t !== goldenTree);
    if (!grown.length) return null;
    const tree = pick(grown);
    tree.lastHitBy = null;
    tree.hp = 0;
    tree.phase = 'falling';
    tree.fall = 0;
    tree.fallDir = rand() < 0.5 ? -1 : 1;
    sparkles(new THREE.Vector3(tree.x, TREE_SH, tree.z), 16, '#fff6b0', 3);
    floater('Lightning!', new THREE.Vector3(tree.x, TREE_SH + 0.4, tree.z), 'floater-crit');
    return tree;
  }

  // Goldener Baum: ein zufälliger ausgewachsener Baum, beim Fällen wird jeder Stamm zu Goldholz
  function makeGolden() {
    const grown = trees.filter((t) => t.phase === 'grown');
    if (!grown.length) return null;
    goldenTree = pick(grown);
    sparkles(new THREE.Vector3(goldenTree.x, 1.4, goldenTree.z), 24, '#ffe27a', 2.4);
    floater('Golden tree!', new THREE.Vector3(goldenTree.x, TREE_SH + 0.4, goldenTree.z), 'floater-gold');
    return goldenTree;
  }

  // Wachstum pro Spielsekunde (Anteil von 0..1): Dünger, Boden, Bewässerung, Birken-Hain, Kiefer nachts, Ereignisse
  function growthRate(t, night) {
    const soil = SOIL_DEFS[state.soils[cellKey(...t.cell)]];
    const sp = speciesOf(t.species);
    const soilMult = soil ? soil.growthMult + state.soilBonus : 1;
    let mult = state.growthMult * soilMult * (1 + (wetCells.get(cellKey(...t.cell)) ?? 0));
    if (sp.trait === 'grove' && hasNeighborOf(t, 'birch')) mult *= 1.3;
    if (sp.trait === 'night') mult *= 1 + 0.5 * night;
    return (mult * (state.eventGrowthMult ?? 1)) / sp.growTime;
  }

  // Offline-Fortschritt: wachsende Bäume werden (ohne Effekte) weitergerechnet; gibt die Zahl fertiger Bäume zurück
  function fastForward(seconds) {
    let grown = 0;
    for (const t of trees) {
      if (t.phase !== 'growing') continue;
      t.growth += seconds * growthRate(t, 0.4); // Tag und Nacht im Mittel
      if (t.growth >= 1) {
        t.phase = 'grown';
        t.hp = speciesOf(t.species).hp;
        t.sprite.material.map = texOf(t).mature;
        grown++;
      } else if (t.growth >= 0.4) t.sprite.material.map = texOf(t).young;
    }
    return grown;
  }

  function setTreeStage(tree, tex) {
    if (tree.sprite.material.map === tex) return;
    tree.sprite.material.map = tex;
    tree.hitT = 0.7; // kleines Aufploppen
    sparkles(new THREE.Vector3(tree.x, 0.6, tree.z), 4, '#b8ff8a', 0.8);
  }

  // ---- Update ----
  function update(dt, gameDt) {
    const time = performance.now() / 1000;
    sampleLight(state.hour, curTint, curBg);
    updateWeather(dt);
    for (const e of tinted) e.mat.color.copy(curTint);
    fogColorSRGB.copy(curBg).convertLinearToSRGB();
    renderer.setClearColor(curBg);
    fogMat.color.copy(curBg);
    for (const p of puffs) p.material.color.copy(curBg).lerp(new THREE.Color(0xffffff), 0.35);

    // Kamera: gleitet zum Ziel (z. B. Mitte des neuen Landes), dazu Wackeln
    if (!drag?.moved) camPan.lerp(panTarget, Math.min(1, dt * 3));
    shake = Math.max(0, shake - dt * 0.9);
    applyCamera();
    if (shake > 0) {
      camera.position.addScaledVector(SCREEN_RIGHT, (rand() - 0.5) * shake);
      camera.position.y += (rand() - 0.5) * shake;
    }

    // Truhe
    if (chestOpenTimer > 0) chestOpenTimer -= dt;
    chest.material.map = chestOpenTimer > 0 ? chestOpen : chestClosed;
    chestBounce = Math.max(0, chestBounce - dt * 3);
    const cb = Math.sin(chestBounce * Math.PI * 3) * chestBounce * 0.16;
    chest.scale.set(chestBase.x * (1 + cb), chestBase.y * (1 - cb), 1);

    // Bäume
    updateSquirrel(gameDt);
    updateWoodpecker(gameDt);
    // Ohne Worker werden markierte Setzlinge direkt gepflanzt
    if (!state.workers.length) for (const seed of [...seeds.values()]) plantSeed(seed);
    updatePlacement(time);
    for (const t of trees) {
      t.hitT = Math.max(0, t.hitT - dt * 4.5);
      t.flashT = Math.max(0, t.flashT - dt * 9);
      const wind = 1 + weather.rain * (weather.storm ? 5 : 1.2); // Regen/Sturm: Bäume schwanken stärker
      const sway = t.phase === 'grown' || t.phase === 'growing' ? Math.sin(time * 1.3 * (weather.storm ? 2.2 : 1) + t.swayPhase) * 0.016 * wind : 0;
      const wob = Math.sin((1 - t.hitT) * 18) * 0.08 * t.hitT;
      let rot = sway + wob;

      if (t.phase === 'falling') {
        t.fall += dt / 0.7;
        const e = Math.min(1, t.fall);
        rot = t.fallDir * e * e * (Math.PI / 2) * 0.96;
        if (t.fall >= 1) {
          treeImpact(t);
          rot = 0;
        }
      } else if (t.phase === 'stump') {
        t.stumpTimer -= gameDt;
        if (t.autoRegrow && t.stumpTimer <= 0) {
          t.autoRegrow = false;
          t.phase = 'growing';
          t.growth = 0;
          setTreeStage(t, texOf(t).sapling);
        } else if (state.autoReplant && !t.reservedBy && t.stumpTimer <= -1.2 && availableSaplings() > 0) {
          // Stump Grinder: bepflanzt den Stumpf selbst (bevorzugt dieselbe Art)
          const species = consumeSapling(t.species);
          if (species) {
            trackIdle(state, speciesOf(species).sapling, -1);
            plantOnStump(t, species);
          }
        }
      } else if (t.phase === 'growing') {
        t.growth += gameDt * growthRate(t, nightAmount(state.hour));
        if (t.growth >= 1) {
          t.phase = 'grown';
          t.hp = speciesOf(t.species).hp;
          setTreeStage(t, texOf(t).mature);
        } else if (t.growth >= 0.4) {
          setTreeStage(t, texOf(t).young);
        }
      }

      t.sprite.material.rotation = rot;
      // Goldener Baum (Ereignis): golden eingefärbt, pulsiert und funkelt
      if (t === goldenTree) {
        const pulse = 0.85 + Math.sin(time * 5) * 0.15;
        t.sprite.material.color.multiply(GOLD_TINT.clone().multiplyScalar(pulse));
        goldenSparkT -= dt;
        if (goldenSparkT <= 0 && t.phase === 'grown') {
          goldenSparkT = 0.18;
          sparkles(new THREE.Vector3(t.x, 0.8 + rand() * 1.6, t.z).addScaledVector(SCREEN_RIGHT, randRange(-0.7, 0.7)), 1, '#ffe27a', 0.5);
        }
      }
      const sq = t.hitT;
      t.sprite.scale.set(TREE_SW * (1 + 0.07 * sq), TREE_SH * (1 - 0.06 * sq), 1);
      t.flash.visible = t.flashT > 0 && t.phase !== 'stump' && t.phase !== 'growing';
      if (t.flash.visible) {
        t.flash.material.opacity = t.flashT * 0.8;
        t.flash.material.rotation = rot;
        t.flash.scale.copy(t.sprite.scale);
      }

      // Lebensbalken
      if (t.hpEl) {
        t.hpTimer -= dt;
        const visible = t.hpTimer > 0 && (t.phase === 'grown' || t.phase === 'falling');
        t.hpEl.style.display = visible ? 'block' : 'none';
        if (visible) {
          const p = worldToScreen(new THREE.Vector3(t.x, TREE_SH + 0.15, t.z));
          t.hpEl.style.left = p.x + 'px';
          t.hpEl.style.top = p.y + 'px';
        }
      }
    }

    updateItems(dt, time);
    updateBuildings(dt, gameDt, time);
    updateAutoSell(dt);
    fellas.update(gameDt);
    visitors.update(dt);
    updateParticles(dt);
    updateCritters(dt, time);

    updateLandReveal(dt);
    for (const p of puffs) {
      // Schwaden ziehen in einem Oval knapp außerhalb des Landes
      const d = p.userData;
      const a = d.angle + time * d.speed * 0.1;
      const r = d.r + Math.sin(time * 0.3 + d.phase) * 0.4;
      p.position.set(box.cx + Math.cos(a) * (box.hx + r), 0.7, box.cz + Math.sin(a) * (box.hz + r));
    }

    renderer.clear();
    renderer.render(groundScene, camera);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    viewW = w;
    viewH = h;
    renderer.setSize(w, h);
    const aspect = w / h;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Dev-Hilfe: Baum per Code treffen (für Tests/Screenshots)
  function debugHit(i = 0) {
    const t = trees[i];
    if (t.phase !== 'grown') return;
    const rect = renderer.domElement.getBoundingClientRect();
    startChop(t, rect.left + worldToScreen(new THREE.Vector3(t.x, 0.5, t.z)).x + 40);
  }

  // Für den Spielstand: Bäume und liegende Items (fliegende Items zählen als liegend)
  function serialize() {
    return {
      trees: trees.map((t) => ({
        cell: t.cell, variant: t.variant, auto: t.auto, phase: t.phase, species: t.species, autoRegrow: t.autoRegrow,
        growth: +t.growth.toFixed(3), hp: t.hp, stumpTimer: +t.stumpTimer.toFixed(2),
      })),
      items: items.map((it) => {
        const p = it.state === 'fly' ? it.from : it.sprite.position;
        return { kind: it.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2), idle: it.idle || undefined };
      }),
      seeds: [...seeds.values()].map((sd) => ({ cell: sd.cell, species: sd.species })),
      buildings: buildings.map((b) => ({
        type: b.type, cell: b.cell, rot: b.rot, level: b.level, accept: b.accept,
        input: b.input, output: b.output, progress: +b.progress.toFixed(2),
      })),
    };
  }

  // Bildschirm-Rechteck (Client-Koordinaten) eines Weltbereichs, z. B. für die Tutorial-Hervorhebung
  function clientRect(x, z, bottom, top, halfW) {
    const rect = renderer.domElement.getBoundingClientRect();
    const a = worldToScreen(new THREE.Vector3(x, bottom, z));
    const b = worldToScreen(new THREE.Vector3(x, top, z));
    const w = halfW * (viewH / viewHeight);
    return { left: rect.left + a.x - w, right: rect.left + a.x + w, top: rect.top + b.y, bottom: rect.top + a.y };
  }
  const treeRect = (i = 0) => {
    const t = trees[i];
    return t ? clientRect(t.x, t.z, 0, TREE_SH, TREE_SW * 0.42) : null;
  };
  const itemRect = () => {
    const it = items.find((i) => i.state !== 'fly' && i.state !== 'carried');
    if (!it) return null;
    const p = it.sprite.position;
    return clientRect(p.x, p.z, p.y - 0.35, p.y + 0.35, 0.45);
  };

  // ---- Stümpfe neu bepflanzen ----
  let reservedSaplings = 0; // Setzlinge, die Worker für Stümpfe eingeplant haben
  const availableSaplings = () => totalSaplings(state.inventory) - reservedSaplings;
  // Einen Setzling aus der Truhe nehmen (bevorzugt die gewünschte Art); gibt die Art zurück
  function consumeSapling(preferred = DEFAULT_SPECIES) {
    const species = pickSaplingFor(state.inventory, preferred, 0);
    if (!species) return null;
    state.inventory[speciesOf(species).sapling] -= 1;
    return species;
  }

  function plantOnStump(tree, species = DEFAULT_SPECIES) {
    const sp = speciesOf(species);
    if (tree.species !== sp.id) tree.variant = pick(sp.variants);
    tree.species = sp.id;
    tree.phase = 'growing';
    tree.growth = state.headStart;
    tree.hp = sp.hp;
    tree.reservedBy = null;
    setTreeStage(tree, texOf(tree).sapling);
    sfx.pop();
    dust(new THREE.Vector3(tree.x, 0, tree.z), 3);
    sparkles(new THREE.Vector3(tree.x, 0.4, tree.z), 8, '#b8ff8a', 1.2);
    floater('Planted!', new THREE.Vector3(tree.x, 1, tree.z), 'floater-sapling');
    emit('treePlanted');
  }

  // Klick auf einen Stumpf: Setzling aus der Truhe direkt einpflanzen
  function pickStump(ev) {
    const { x, y } = localPointer(ev);
    const radius = Math.max(18, (viewH / viewHeight) * 0.45);
    let best = null;
    let bestD = radius;
    for (const t of trees) {
      if (t.phase !== 'stump' || t.autoRegrow) continue;
      const p = worldToScreen(new THREE.Vector3(t.x, 0.2, t.z));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }
  // Klick auf ein freies Baumbeet: Setzling aus der Truhe direkt einpflanzen
  function pickFreeBed(ev) {
    const cell = cellAtPointer(ev);
    return cell && bedFree(cellKey(...cell)) ? cell : null;
  }
  function clickBed(i, j) {
    const pos = new THREE.Vector3(cellX(i), 0, cellX(j));
    if (availableSaplings() <= 0) {
      sfx.deny();
      floater('No sapling!', pos.clone().setY(0.9), 'floater-warn');
      emit('noSapling');
      return;
    }
    const species = consumeSapling(DEFAULT_SPECIES);
    const t = addTree(i, j, pick(speciesOf(species).variants), { growing: true, auto: false, species });
    t.growth = state.headStart;
    digDust(pos);
    sfx.pop();
    sparkles(pos.clone().setY(0.4), 8, '#b8ff8a', 1.2);
    floater('Planted!', pos.clone().setY(1), 'floater-sapling');
    emit('treePlanted');
  }

  function clickStump(tree) {
    if (tree.reservedBy) {
      floater('A worker is on it', new THREE.Vector3(tree.x, 0.9, tree.z), 'floater-sapling');
      return;
    }
    if (availableSaplings() <= 0) {
      sfx.deny();
      floater('No sapling!', new THREE.Vector3(tree.x, 0.9, tree.z), 'floater-warn');
      emit('noSapling');
      return;
    }
    const species = consumeSapling(tree.species);
    digDust(new THREE.Vector3(tree.x, 0, tree.z));
    plantOnStump(tree, species);
  }

  // Woodpecker (Skill): pickt alle paar Sekunden einen zufälligen Baum an – Holz auch ohne Klicken
  const WOODPECKER = { name: 'Woodpecker', traits: [] }; // gilt als "Worker" (Holz zählt für offline)
  let woodpeckerT = 0;
  function updateWoodpecker(gameDt) {
    if (!state.woodpecker) return;
    woodpeckerT -= gameDt;
    if (woodpeckerT > 0) return;
    woodpeckerT = [0, 4, 2.5, 1.5][state.woodpecker];
    const grown = trees.filter((t) => t.phase === 'grown');
    if (!grown.length) return;
    const tree = pick(grown);
    workerHit(tree, 1, rand() < 0.5 ? -1 : 1, WOODPECKER);
    floater('[[icon:feather]] tok!', new THREE.Vector3(tree.x, 1.4, tree.z), 'floater-dmg');
  }

  // Sicherheitsnetz: ohne Baum und ohne Setzling bringt ein Eichhörnchen einen Setzling
  let squirrelT = 0;
  function updateSquirrel(gameDt) {
    const living = trees.some((t) => t.phase !== 'stump' || t.autoRegrow);
    const hasSapling = totalSaplings(state.inventory) > 0 || items.some((it) => ITEM_DEFS[it.kind]?.type === 'sapling') || seeds.size > 0;
    const canBuy = state.money >= saplingBuyPrice(treesUsed(), state.saplingPriceMult);
    if (living || hasSapling || canBuy || state.tutorial !== 'done') {
      squirrelT = 0;
      return;
    }
    squirrelT += gameDt;
    if (squirrelT < SQUIRREL_DELAY) return;
    squirrelT = 0;
    const from = new THREE.Vector3(box.minX - 0.5, 0.8, box.cz + randRange(-1.5, 1.5));
    spawnItem(from, new THREE.Vector3(3.2, 3.5, randRange(-0.6, 0.6)), 'sapling');
    floater('[[icon:acorn]] A squirrel brought a sapling!', new THREE.Vector3(box.minX + 1, 1.4, box.cz), 'floater-sapling');
    sfx.pop();
  }

  // ---- Land kaufen: eine ganze Plot-Reihe an einer Seite ----
  // Die Wiese ist sofort da, der Nebel weicht in einer kurzen Animation zurück.
  let reveal = null; // { from, to, t }
  function expandLand(side) {
    const oldBox = box;
    if (!buyRow(state, side)) return false;
    recomputeStats(state); // neue Baumplätze
    bounds = landBounds(state);
    box = boxOf(bounds);
    setMeadow();
    setGridOverlay();
    buildForestRing();
    // Deko nur im neuen Streifen
    const strip = {
      n: [box.minX, box.maxX, box.minZ, oldBox.minZ],
      s: [box.minX, box.maxX, oldBox.maxZ, box.maxZ],
      w: [box.minX, oldBox.minX, box.minZ, box.maxZ],
      e: [oldBox.maxX, box.maxX, box.minZ, box.maxZ],
    }[side];
    decorate(...strip);
    reveal = { from: oldBox, to: box, t: 0 };
    // Kamera zur neuen Mitte, etwas herauszoomen
    panTarget.set(box.cx, 0, box.cz);
    viewHeight = Math.min(viewMax(), viewHeight + 1.2);
    resize();
    // Effekte im neuen Streifen
    const [x0, x1, z0, z1] = strip;
    for (let k = 0; k < 14; k++) {
      const p = new THREE.Vector3(randRange(x0, x1), 0, randRange(z0, z1));
      dust(p, 2);
      sparkles(p.setY(0.4), 3, '#b8ff8a', 1.4);
    }
    shake = Math.max(shake, 0.15);
    sfx.buy();
    floater(`New land! +${TREE_SLOTS_PER_ROW} [[icon:oak]] slots`, new THREE.Vector3((x0 + x1) / 2, 1.4, (z0 + z1) / 2), 'floater-level');
    emit('landExpanded', { side });
    return true;
  }
  // Nebel-Animation: Rechteck wächst vom alten zum neuen Land
  function updateLandReveal(dt) {
    if (!reveal) return;
    reveal.t = Math.min(1, reveal.t + dt / 1.4);
    const e = 1 - (1 - reveal.t) ** 3;
    const lerp = (k) => reveal.from[k] + (reveal.to[k] - reveal.from[k]) * e;
    setFog({ cx: lerp('cx'), cz: lerp('cz'), hx: lerp('hx'), hz: lerp('hz') });
    if (reveal.t >= 1) reveal = null;
  }

  // ---- Setzling-Markierungen (Worker pflanzen sie) ----
  const seedTex = T.canvasTexture(T.seedMarkerCanvas());
  function addSeed(i, j, quiet = false, species = DEFAULT_SPECIES) {
    const key = cellKey(i, j);
    if (seeds.has(key)) return;
    const pos = new THREE.Vector3(cellX(i), 0, cellX(j));
    const sprite = makeSprite(seedTex, 14, 12);
    sprite.position.copy(pos);
    seeds.set(key, { cell: [i, j], pos, sprite, reservedBy: null, species });
    clearDecor(i, j);
    if (!quiet) {
      sfx.thud(0.2);
      dust(pos, 2);
      floater('Marked!', pos.clone().setY(0.8), 'floater-sapling');
      emit('seedMarked');
    }
  }
  function plantSeed(seed) {
    const [i, j] = seed.cell;
    removeSprite(seed.sprite);
    seeds.delete(cellKey(i, j));
    const t = addTree(i, j, Math.floor(rand() * 3), { growing: true, auto: false, species: seed.species });
    t.growth = state.headStart;
    sfx.pop();
    dust(new THREE.Vector3(t.x, 0, t.z), 3);
    sparkles(new THREE.Vector3(t.x, 0.4, t.z), 8, '#b8ff8a', 1.2);
    floater('Planted!', new THREE.Vector3(t.x, 1, t.z), 'floater-sapling');
  }
  for (const d of saved?.seeds ?? []) {
    const cell = Array.isArray(d) ? d : d.cell;
    if (isFree(...cell)) addSeed(...cell, true, d.species ?? DEFAULT_SPECIES);
  }

  // ---- Effekte für Worker ----
  function stepDust(pos) {
    particle({
      tex: puffTex, pos: new THREE.Vector3(pos.x, 0.05, pos.z),
      vel: new THREE.Vector3(randRange(-0.3, 0.3), 0.25, randRange(-0.3, 0.3)),
      color: '#efe4c8', size: 0.16, life: 0.35, gravity: 0, drag: 3, ground: false, grow: 1.4,
    });
  }
  function digDust(pos) {
    for (let i = 0; i < 4; i++) {
      particle({
        pos: new THREE.Vector3(pos.x + randRange(-0.15, 0.15), 0.08, pos.z + randRange(-0.15, 0.15)),
        vel: new THREE.Vector3(randRange(-0.8, 0.8), randRange(1.5, 2.6), randRange(-0.8, 0.8)),
        color: pick(['#7a4a22', '#5a3416', '#9a6232']), size: randRange(0.05, 0.08), life: 0.6, gravity: 9,
      });
    }
    stepDust(pos);
  }
  // Worker-Hieb: weniger Effekt als beim Spieler, Baum fällt vom Worker weg
  function workerHit(tree, dmg, side, worker) {
    if (tree.phase !== 'grown') return;
    tree.lastHitBy = worker;
    tree.hp -= dmg;
    tree.hitT = Math.max(tree.hitT, 0.75);
    tree.flashT = Math.max(tree.flashT, 0.45);
    const p = new THREE.Vector3(tree.x, 0.45, tree.z).addScaledVector(SCREEN_RIGHT, side * 0.15).addScaledVector(VIEW_DIR, 0.4);
    burstChips(p, 5);
    dropLeaves(tree, 1);
    sfx.chop(0.4);
    showHp(tree);
    if (tree.hp <= 0) {
      tree.phase = 'falling';
      tree.fall = 0;
      tree.fallDir = side;
    }
  }


  // ===================== Gebäude =====================
  const buildings = [];
  let onBuildingClick = null; // vom UI gesetzt: öffnet das Gebäude-Fenster
  const wetCells = new Map(); // 'i,j' -> Wachstums-Bonus durch Bewässerung (höchster zählt)
  const wetTex = T.canvasTexture(wetTileArt());
  const wetMeshes = new Map();
  const sawmillTex = [0, 1].map((f) => ({ idle: T.canvasTexture(sawmillArt(f, false)), work: T.canvasTexture(sawmillArt(f, true)) }));
  const irrigationTex = Object.fromEntries(Object.keys(BUILDING_DEFS).filter((k) => BUILDING_DEFS[k].kind === 'irrigation').map((k) => [k, T.canvasTexture(irrigationArt(k))]));

  const footprint = (type, i, j) => {
    const n = BUILDING_DEFS[type].size;
    const cells = [];
    for (let dj = 0; dj < n; dj++) for (let di = 0; di < n; di++) cells.push([i + di, j + dj]);
    return cells;
  };
  const footprintCenter = (type, i, j) => {
    const off = (BUILDING_DEFS[type].size - 1) / 2;
    return new THREE.Vector3(cellX(i) + off, 0, cellX(j) + off);
  };
  // Gebäude nicht auf Baumbeete (gespeicherte Gebäude dürfen beim Laden bleiben, wo sie sind)
  const canPlaceAt = (type, i, j, allowBeds = false) => footprint(type, i, j).every(([a, b]) => isFree(a, b) && (allowBeds || !beds.has(cellKey(a, b))));
  const countOf = (type) => buildings.filter((b) => b.type === type).length;
  const buildPrice = (type) => Math.round(BUILDING_DEFS[type].price(countOf(type)) * state.buildPriceMult);
  const outletDirs = (b) => BUILDING_DEFS[b.type].outlets.map((o) => (o + b.rot) % 4);

  function makeDecal(tex, x, z, size = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false }));
    tint(m.material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.009, z);
    m.renderOrder = 2;
    groundScene.add(m);
    return m;
  }

  function addBuilding(type, i, j, data = {}) {
    const def = BUILDING_DEFS[type];
    const center = footprintCenter(type, i, j);
    const b = {
      type, cell: [i, j], center, rot: data.rot ?? 0, level: data.level ?? 0, accept: data.accept ?? 'all',
      input: data.input ?? [], output: data.output ?? [], progress: data.progress ?? 0,
      reservedBy: null, frameT: 0, frame: 0, bounce: 0, sprayT: rand(), parts: [],
    };
    if (type === 'sawmill') {
      b.sprite = makeSprite(sawmillTex[0].idle, 52, 48, { scale: 0.95 });
      b.sprite.position.copy(center).addScaledVector(TO_CAMERA, 0.1);
      b.shadow = makeShadow(center.x, center.z, 2.6);
      // Stapel neben der Hütte: links Stämme, rechts Bretter
      b.logPile = Array.from({ length: 4 }, () => makeSprite(itemType('wood').tex, 16, 10, { center: [0.5, 0], scale: 1.1 }));
      b.plankPile = Array.from({ length: 4 }, () => makeSprite(itemType('oak_plank').tex, 16, 10, { center: [0.5, 0], scale: 1.1 }));
    } else {
      b.sprite = makeSprite(irrigationTex[type], 16, 20, { scale: 1.1 });
      b.sprite.position.copy(center);
      b.shadow = makeShadow(center.x, center.z, 0.7);
      b.decal = makeDecal(T.canvasTexture(irrigationDecal(outletDirs(b))), center.x, center.z);
    }
    b.sprite.userData.building = b;
    for (const [a, c] of footprint(type, i, j)) {
      buildingAt.set(cellKey(a, c), b);
      clearDecor(a, c);
    }
    buildings.push(b);
    if (def.kind === 'irrigation') recomputeWater();
    return b;
  }

  // Nasse Felder neu berechnen (höchster Bonus pro Feld) und die Wasser-Overlays anpassen
  function recomputeWater() {
    wetCells.clear();
    for (const b of buildings) {
      const def = BUILDING_DEFS[b.type];
      if (def.kind !== 'irrigation') continue;
      for (const [i, j] of wateredCells(b)) {
        if (!inGrid(i, j) || isChestCell(i, j)) continue;
        const key = cellKey(i, j);
        wetCells.set(key, Math.max(wetCells.get(key) ?? 0, def.growth));
      }
    }
    for (const [key, m] of wetMeshes) {
      if (!wetCells.has(key)) {
        groundScene.remove(m);
        wetMeshes.delete(key);
      }
    }
    for (const key of wetCells.keys()) {
      if (wetMeshes.has(key)) continue;
      const [i, j] = key.split(',').map(Number);
      wetMeshes.set(key, makeDecal(wetTex, cellX(i), cellX(j)));
    }
  }

  // Nachbar gleicher Art (für den Birken-Hain)
  function hasNeighborOf(tree, species) {
    const [i, j] = tree.cell;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => {
      const n = treeAt.get(cellKey(i + di, j + dj));
      return n && n.species === species && n.phase !== 'stump';
    });
  }

  // Stämme in der Truhe, die ein Sägewerk annimmt
  const logsFor = (b) => Object.keys(ITEM_DEFS).filter((k) => ITEM_DEFS[k].type === 'log' && (state.inventory[k] ?? 0) > 0
    && (b.accept === 'all' || ITEM_DEFS[k].species === b.accept));
  function takeLogsFor(b, max) {
    const room = sawmillLevel(b).inCap - b.input.length;
    const taken = [];
    for (const k of logsFor(b)) {
      while (taken.length < Math.min(max, room) && state.inventory[k] > 0) {
        state.inventory[k] -= 1;
        taken.push(k);
      }
    }
    return taken;
  }
  const chestRoom = () => Math.max(0, state.woodCap - chestUsed(state) - flyingCount - reservedSlots);
  function depositToChest(keys) {
    if (!keys.length) return;
    for (const k of keys) state.inventory[k] = (state.inventory[k] ?? 0) + 1;
    chestOpenTimer = 0.5;
    chestBounce = 1;
    sfx.deposit();
    sparkles(CHEST_TOP.clone().setY(0.7), 6);
    floater(`+${keys.length} [[icon:planks]]`, new THREE.Vector3(0, 1.5, 0), 'floater-wood');
    emit('itemDeposited', { kind: keys[0] });
  }
  const plankFor = (logKey) => speciesOf(ITEM_DEFS[logKey]?.species).plank;

  function updateBuildings(dt, gameDt, time) {
    for (const b of buildings) {
      if (b.type === 'sawmill') {
        const lvl = sawmillLevel(b);
        const working = b.input.length > 0 && b.output.length < lvl.outCap;
        if (working) {
          b.progress += (gameDt * state.sawSpeedMult) / lvl.time;
          if (b.progress >= 1) {
            b.progress = 0;
            b.output.push(plankFor(b.input.shift()));
            b.bounce = 1;
            sfx.saw();
            for (let k = 0; k < 6; k++) {
              particle({
                pos: b.center.clone().addScaledVector(TO_CAMERA, 0.7).setY(0.45),
                vel: new THREE.Vector3(randRange(-1, 1), randRange(1.2, 2.4), randRange(-1, 1)),
                color: pick(['#f2dca0', '#e2c080', '#fff0c8']), size: randRange(0.04, 0.07), life: 0.7, gravity: 6,
              });
            }
          }
        }
        // Sägeblatt dreht sich beim Arbeiten
        b.frameT += dt;
        if (b.frameT > 0.07) {
          b.frameT = 0;
          if (working) b.frame = 1 - b.frame;
        }
        b.sprite.material.map = working ? sawmillTex[b.frame].work : sawmillTex[0].idle;
        b.bounce = Math.max(0, b.bounce - dt * 5);
        const k = b.bounce * 0.06;
        b.sprite.scale.set(52 * PX * 0.95 * (1 + k), 48 * PX * 0.95 * (1 - k), 1);
        // Stapel: bis zu 4 Stämme / Bretter sichtbar
        const logsShown = Math.min(4, Math.ceil(b.input.length / 3));
        const planksShown = Math.min(4, Math.ceil(b.output.length / 3));
        const left = b.center.clone().addScaledVector(SCREEN_RIGHT, -1.05).addScaledVector(TO_CAMERA, 0.55);
        const right = b.center.clone().addScaledVector(SCREEN_RIGHT, 1.05).addScaledVector(TO_CAMERA, 0.55);
        b.logPile.forEach((sp, i) => {
          sp.visible = i < logsShown;
          if (sp.visible) {
            sp.material.map = itemType(b.input[0] ?? 'wood').tex;
            sp.position.copy(left).setY(i * 0.17);
          }
        });
        b.plankPile.forEach((sp, i) => {
          sp.visible = i < planksShown;
          if (sp.visible) {
            sp.material.map = itemType(b.output[b.output.length - 1] ?? 'oak_plank').tex;
            sp.position.copy(right).setY(i * 0.17);
          }
        });
      } else {
        // Bewässerung: Wassertropfen spritzen zu den Nachbarfeldern
        b.sprayT -= dt;
        if (b.sprayT <= 0) {
          b.sprayT = 0.5 + rand() * 0.4;
          for (const [i, j] of wateredCells(b)) {
            if (!inGrid(i, j)) continue;
            const target = new THREE.Vector3(cellX(i), 0, cellX(j));
            const vel = target.clone().sub(b.center).multiplyScalar(1.1).setY(2.2);
            particle({ pos: b.center.clone().setY(0.55), vel, color: '#7ec8ff', size: 0.07, life: 0.55, gravity: 7, additive: true });
          }
        }
      }
    }
  }

  // Klick auf einen wartenden Kunden
  function pickVisitor(ev) {
    const { x, y } = localPointer(ev);
    return visitors.pickAt(x, y, worldToScreen, Math.max(18, (viewH / viewHeight) * 0.5));
  }

  // Klick auf ein Gebäude
  function pickBuilding(ev) {
    const { x, y } = localPointer(ev);
    let best = null;
    let bestD = Infinity;
    for (const b of buildings) {
      const size = BUILDING_DEFS[b.type].size;
      const p = worldToScreen(b.center.clone().setY(0.35 * size));
      const radius = (viewH / viewHeight) * (0.45 * size + 0.15);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < radius && d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  // Gebäude aus dem Spielstand
  for (const d of saved?.buildings ?? []) {
    if (!BUILDING_DEFS[d.type] || !canPlaceAt(d.type, ...d.cell, true)) continue;
    addBuilding(d.type, ...d.cell, d);
  }

  // Gebäude kaufen und platzieren (bezahlt wird beim Platzieren, Bewässerung mit R drehen)
  const ghostBuilding = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0.65, depthWrite: false }));
  ghostBuilding.center.set(0.5, 0);
  ghostBuilding.visible = false;
  scene.add(ghostBuilding);
  const ghostDecal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }));
  ghostDecal.rotation.x = -Math.PI / 2;
  ghostDecal.renderOrder = 3;
  ghostDecal.visible = false;
  groundScene.add(ghostDecal);

  function beginBuilding(type) {
    const def = BUILDING_DEFS[type];
    const decalFor = (rot) => T.canvasTexture(irrigationDecal(def.outlets?.map((o) => (o + rot) % 4) ?? []));
    startPlacement({
      ghost: 'building',
      type,
      size: def.size,
      rot: 0,
      rotatable: def.kind === 'irrigation',
      decalTex: def.kind === 'irrigation' ? decalFor(0) : null,
      onRotate() {
        this.rot = (this.rot + 1) % 4;
        this.decalTex = decalFor(this.rot);
      },
      isValid: (i, j) => {
        if ((state.repLevel ?? 0) < def.unlockRep) return `Needs [[icon:star]] reputation ${def.unlockRep}`;
        if (state.money < buildPrice(type)) return 'Not enough coins';
        if (!footprint(type, i, j).every(([a, c]) => inGrid(a, c))) return 'Not enough room';
        if (!canPlaceAt(type, i, j)) return 'Tiles taken';
        return true;
      },
      place(i, j) {
        state.money -= buildPrice(type);
        const b = addBuilding(type, i, j, { rot: this.rot });
        sfx.thud(0.25);
        sfx.buy();
        dust(b.center, 6);
        sparkles(b.center.clone().setY(0.6), 12, '#ffe27a', 1.6);
        floater(`${def.icon} ${def.name}!`, b.center.clone().setY(1.6), 'floater-sapling');
        emit('buildingPlaced', { type });
      },
      keepGoing: () => def.kind === 'irrigation' && state.money >= buildPrice(type),
      label() {
        const rot = this.rotatable ? ' · R: rotate' : '';
        return `${def.icon} ${def.name} · [[icon:coin]] ${formatNumber(buildPrice(type))} · ${def.size}×${def.size}${rot}`;
      },
    });
  }
  window.addEventListener('keydown', (ev) => {
    if ((ev.key === 'r' || ev.key === 'R') && placement?.rotatable) {
      placement.onRotate();
      sfx.knock(1.6, 0.1);
    }
  });

  // UI-Aktionen für das Gebäude-Fenster
  const buildingApi = {
    info: (b) => ({ ...BUILDING_DEFS[b.type], lvl: b.type === 'sawmill' ? sawmillLevel(b) : null }),
    loadLogs(b) {
      const keys = takeLogsFor(b, Infinity);
      b.input.push(...keys);
      if (keys.length) sfx.thud(0.2);
      return keys.length;
    },
    takePlanks(b) {
      const keys = b.output.splice(0, Math.min(b.output.length, chestRoom()));
      depositToChest(keys);
      return keys.length;
    },
    upgrade(b) {
      const next = BUILDING_DEFS.sawmill.levels[b.level + 1];
      if (!next || state.money < next.cost) return false;
      state.money -= next.cost;
      b.level += 1;
      b.bounce = 1;
      sfx.buy();
      sparkles(b.center.clone().setY(1), 16, '#ffe27a', 2);
      floater(`Sawmill Lv ${b.level + 1}!`, b.center.clone().setY(1.7), 'floater-level');
      return true;
    },
    setAccept(b, accept) {
      b.accept = accept;
    },
  };

  const fellas = createFellas({
    state, SCREEN_RIGHT, TO_CAMERA, PX,
    landBox: () => box,
    canvasTexture: T.canvasTexture,
    makeSprite, removeSprite,
    makeShadow: (x, z, w) => makeShadow(x, z, w),
    removeShadow: (m) => groundScene.remove(m),
    items, trees, seeds,
    hasRoom,
    reserveSlot: (n) => { reservedSlots = Math.max(0, reservedSlots + n); },
    launchItem: (it) => launchItem(it),
    workerHit, plantSeed, stepDust, digDust, floater, sfx,
    plantOnStump,
    availableSaplings,
    reserveSapling: (n) => { reservedSaplings = Math.max(0, reservedSaplings + n); },
    // Setzling an der Truhe abholen (für einen Stumpf): nimmt ihn aus dem Inventar
    takeSapling: (preferred) => {
      reservedSaplings = Math.max(0, reservedSaplings - 1);
      const species = consumeSapling(preferred); // Art oder null
      if (species) trackIdle(state, speciesOf(species).sapling, -1); // Team pflanzt: Setzling verbraucht
      return species;
    },
    returnSapling: (species) => {
      const key = speciesOf(species).sapling;
      state.inventory[key] = (state.inventory[key] ?? 0) + 1;
      trackIdle(state, key, 1); // zurückgebracht: Verbrauch wieder ausgleichen
    },
    itemTexture: (key) => itemType(key).tex,
    saplingTexOf: (species) => itemType(speciesOf(species).sapling).tex,
    // Sägewerk-Logistik
    sawmills: () => buildings.filter((b) => b.type === 'sawmill'),
    sawmillSpot: (b) => b.center.clone().addScaledVector(TO_CAMERA, 1.15),
    sawmillNeedsInput: (b) => b.input.length < sawmillLevel(b).inCap && logsFor(b).length > 0,
    // Was das Team aus der Truhe nimmt bzw. hineinbringt, zählt für den Offline-Fortschritt
    takeLogsFor: (b, max) => {
      const keys = takeLogsFor(b, max);
      for (const k of keys) trackIdle(state, k, -1);
      return keys;
    },
    deliverLogs: (b, keys) => {
      b.input.push(...keys);
      sfx.thud(0.15);
    },
    takePlanks: (b, max) => b.output.splice(0, Math.max(0, Math.min(max, b.output.length, chestRoom()))),
    depositToChest: (keys) => {
      for (const k of keys) trackIdle(state, k);
      depositToChest(keys);
    },
    // Level-Up: goldener Funkenregen, große Schrift, welcher Wert gestiegen ist
    levelUp: (f, raised) => {
      const p = new THREE.Vector3(f.pos.x, 0.9, f.pos.z);
      sparkles(p, 18, '#ffe27a', 2.4);
      sparkles(p, 8, '#ffffff', 1.6);
      floater(`LEVEL ${f.data.level}!`, p.clone().setY(1.6), 'floater-level');
      if (raised.length) {
        const text = raised.map((k) => `+1 ${STAT_INFO[k].short}`).join(' ');
        setTimeout(() => floater(text, p.clone().setY(1.25), 'floater-sapling'), 350);
      }
      sfx.buy();
      emit('workerLevelUp', { id: f.id });
    },
  });

  // Kunden am Wiesenrand (zu jedem offenen Auftrag)
  const visitors = createVisitors({
    state, PX, SCREEN_RIGHT, CHEST_TOP,
    canvasTexture: T.canvasTexture,
    itemCanvas: (key) => itemUiCanvas(key),
    itemTexture: (key) => itemType(key).tex,
    makeSprite, removeSprite,
    makeShadow: (x, z, w) => makeShadow(x, z, w),
    removeShadow: (m) => groundScene.remove(m),
    landBox: () => box,
    fogAt,
    floater, sparkles, stepDust, sfx,
    chestPop: () => {
      chestOpenTimer = 0.7;
      chestBounce = 1;
    },
  });
  let onVisitorClick = null;

  // Zahltag: Lohn fliegt aus der Truhe, die Worker freuen sich
  on('payday', ({ total }) => {
    floater(`Wages −${formatNumber(total)} [[icon:coin]]`, new THREE.Vector3(0, 1.9, 0), 'floater-warn');
    sparkles(CHEST_TOP.clone().setY(0.9), 10, '#ffe27a', 2);
    chestOpenTimer = 0.6;
    chestBounce = 1;
    sfx.coin();
    fellas.emoteAll('heart');
  });

  // Dev-Hilfen für Balancing-Tests (Spieler-Aktionen ohne Maus und ohne Wartezeit)
  const debug = {
    hit: (tree) => tree.phase === 'grown' && hitTree(tree, new THREE.Vector3(tree.x, 0.5, tree.z), { x: 0, y: 0 }),
    collect: (item) => item.state === 'rest' && collectAt(item),
    replant: (tree) => tree.phase === 'stump' && !tree.autoRegrow && clickStump(tree),
    // Platzieren ohne Maus (Tests): zahlt wie der Spieler
    build: (type, i, j, rot = 0) => {
      if (!canPlaceAt(type, i, j) || state.money < buildPrice(type)) return null;
      state.money -= buildPrice(type);
      return addBuilding(type, i, j, { rot });
    },
    // (legt auch ein Beet an, damit Test-Bäume nicht "außerhalb" stehen)
    plantAt: (species, i, j, growth = 0) => {
      if (!isFree(i, j)) return false;
      addBed(i, j);
      addTree(i, j, 0, { growing: true, auto: false, species }).growth = growth;
      return true;
    },
    growthRate: (i, j) => wetCells.get(cellKey(i, j)) ?? 0,
    // freies Beet bepflanzen
    plantFree: (preferred = DEFAULT_SPECIES) => {
      const key = freeBeds()[0];
      if (!key || availableSaplings() <= 0) return false;
      const species = consumeSapling(preferred);
      addTree(...key.split(',').map(Number), 0, { growing: true, auto: false, species }).growth = state.headStart;
      return true;
    },
    // offene Beete automatisch setzen (Bot)
    placeBedsAuto: () => {
      while (pendingBeds() > 0) {
        const cell = autoBedCell();
        if (!cell) break;
        addBed(...cell);
      }
    },
    // Stumpf mit einer bestimmten Art bepflanzen (wenn ein Setzling dieser Art da ist)
    replantWith: (tree, species) => {
      const key = speciesOf(species).sapling;
      if (tree.phase !== 'stump' || tree.reservedBy || !(state.inventory[key] > 0)) return false;
      state.inventory[key] -= 1;
      plantOnStump(tree, species);
      return true;
    },
    // Gebäude auf dem ersten freien Platz bauen (zahlt wie der Spieler)
    buildAnywhere: (type, rot = 0) => {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        for (let i = bounds.minI; i <= bounds.maxI; i++) {
          if (!footprint(type, i, j).every(([a, c]) => inGrid(a, c)) || !canPlaceAt(type, i, j)) continue;
          if (state.money < buildPrice(type)) return null;
          state.money -= buildPrice(type);
          return addBuilding(type, i, j, { rot });
        }
      }
      return null;
    },
  };

  return {
    update, trees, items, worldToScreen, camera, debugHit, debug, serialize, treeRect, itemRect,
    beginPlanting, beginSoil, beginBuilding, endPlacement, isPlacing: () => !!placement, expandLand,
    buildings, buildingApi, buildPrice, countOf,
    setBuildingClickHandler: (fn) => { onBuildingClick = fn; },
    setVisitorClickHandler: (fn) => { onVisitorClick = fn; },
    // Kamera auf einen Punkt richten (Hauptmenü: Wiese neben den Knöpfen zeigen)
    lookAt: (x, z) => {
      panTarget.set(x, 0, z);
      camPan.copy(panTarget);
    },
    fastForward,
    // Zufallsereignisse
    setWeather,
    lightning,
    makeGolden,
    clearGolden: () => { goldenTree = null; },
    hasGolden: () => !!goldenTree,
    spawnMerchant: () => visitors.spawnMerchant(),
    dismissMerchant: () => visitors.dismissMerchant(),
    hasSawmill: () => buildings.some((b) => b.type === 'sawmill'),
    isWet: (i, j) => wetCells.has(cellKey(i, j)),
    fellaStatus: (id) => fellas.status(id),
    // Baumbeete: used = Bäume + Stümpfe + Markierungen, cap = Beete (inkl. noch offener), pending = noch zu setzen
    treeSlots: () => ({ used: treesUsed(), cap: Math.max(state.treeCap, beds.size), beds: beds.size, free: freeBeds().length, pending: pendingBeds() }),
    beginBedPlacement,
    stumpRect: () => {
      const t = trees.find((x) => x.phase === 'stump' && !x.autoRegrow);
      return t ? clientRect(t.x, t.z, -0.1, 0.6, 0.45) : null;
    },
    fellas,
  };
}
