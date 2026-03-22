const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');


let elements = [];
let rooms = [];
let selectedId = null;
let selectedRoomId = null;
let tool = 'select';
let zoom = 1;
let panX = 0, panY = 0;
let isDragging = false, isDrawingRoom = false, isPanning = false;
let dragOffX = 0, dragOffY = 0;
let roomStart = null, roomCurrent = null;
let mouseDown = false;
let spaceDown = false;
let lastPanX = 0, lastPanY = 0;
let history = [];
let dragType = null;
let pendingDrop = null;
let ctxMenuTarget = null;

// Room resize state
let isResizingRoom = false;
let resizeRoomId = null;
let resizeHandle = null; // 'n','s','e','w','ne','nw','se','sw'
let resizeStartMouse = null;
let resizeStartRoom = null;

const HANDLE_SIZE = 8; // en pixel - px

const IMAGE_CACHE = {};
 
function loadImage(src) {
  if (IMAGE_CACHE[src]) return IMAGE_CACHE[src];
  const img = new Image();
  img.src = src;
  img.onload = () => draw();
  IMAGE_CACHE[src] = img;
  return img;
}

// ELEMENT DEFAULTS
const DEFAULTS = {
  camera:    { img:'./images/camera.svg', label:'Cam', color:'#4a9eff', size:36 },
  light:     { emoji:'💡', label:'Lumière', color:'#ffcc44', size:36 },
  reflector: { emoji:'🔆', label:'', color:'#ffcc44', size:36 },
  micro:     { emoji:'🎙', label:'', color:'#ffcc44', size:36 },
  person:    { img:'./images/people.svg', label:'P1', color:'#ff6b6b', size:36 },
  table:     { emoji:'', label:'TABLE', color:'#7bed9f', size:48, shape:'rect' },
};

Object.values(DEFAULTS).forEach(d => {
  if (d.img) loadImage(d.img);
});

let idCounter = 1;
function makeId() { return 'el_' + (idCounter++); }

// Permet de resize le canva
function resize() {
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  draw();
}
window.addEventListener('resize', resize);
resize();

// COORD TRANSFORMS
function toWorld(sx, sy) {
  return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
}
function toScreen(wx, wy) {
  return { x: wx * zoom + panX, y: wy * zoom + panY };
}

// DRAW
function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  drawGrid();

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  rooms.forEach(r => drawRoom(r));
  [...elements].sort((a,b) => (a.z||0)-(b.z||0)).forEach(el => drawElement(el));

  if (isDrawingRoom && roomStart && roomCurrent) {
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6/zoom, 3/zoom]);
    const x = Math.min(roomStart.x, roomCurrent.x);
    const y = Math.min(roomStart.y, roomCurrent.y);
    const w = Math.abs(roomCurrent.x - roomStart.x);
    const h = Math.abs(roomCurrent.y - roomStart.y);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Draw resize handles in screen space (for selected room)
  if (selectedRoomId) {
    const r = rooms.find(r => r.id === selectedRoomId);
    if (r) drawRoomHandles(r);
  }
}

/**
 * Permet de dessiner la grille du fond
 */
function drawGrid() {
  const gridSize = 40 * zoom; // Taille des carreaux
  const ox = panX % gridSize;
  const oy = panY % gridSize;
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = ox; x < canvas.width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = oy; y < canvas.height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

/**
 * Permet de dessiner une salle
 */
function drawRoom(r) {
  ctx.save();
  ctx.fillStyle = r.color || '#fafaf7';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const gs = 40;
  ctx.strokeStyle = '#e0ddd5';
  ctx.lineWidth = 0.5 / zoom;
  for (let gx = r.x; gx <= r.x + r.w; gx += gs) {
    ctx.beginPath(); ctx.moveTo(gx, r.y); ctx.lineTo(gx, r.y+r.h); ctx.stroke();
  }
  for (let gy = r.y; gy <= r.y + r.h; gy += gs) {
    ctx.beginPath(); ctx.moveTo(r.x, gy); ctx.lineTo(r.x+r.w, gy); ctx.stroke();
  }

  // Si la room est select, on met une bordure dessus
  if (r.id === selectedRoomId) {
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([8/zoom, 4/zoom]);
  } else {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([]);
  }
  
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]);

  // Label de la salle
  if (r.label) {
    ctx.fillStyle = '#333';
    ctx.font = `bold ${14/zoom}px Syne`;
    ctx.textAlign = 'left';
    ctx.fillText(r.label, r.x+6/zoom, r.y+16/zoom);
  }

  ctx.restore();
}

/**
 * Dessiner les carré pour resize la salle
 * @param {*} r salle à resize
 */
function drawRoomHandles(r) {
  const handles = getRoomHandlePositions(r);
  handles.forEach(h => {
    ctx.save();
    ctx.fillStyle = '#f5c842';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(h.sx - HANDLE_SIZE/2, h.sy - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}


/**
 * Permet de récupère la position des manettes d'une salle
 * @param {*} r salle en modification
 * @returns les coordonnées des manettes
 */
function getRoomHandlePositions(r) {
  const tl = toScreen(r.x, r.y);
  const br = toScreen(r.x + r.w, r.y + r.h);
  const mx = (tl.x + br.x) / 2;
  const my = (tl.y + br.y) / 2;

  // Retourne selon les valeurs Nord, Sud, Est, Ouest
  return [
    { id:'nw', sx: tl.x, sy: tl.y },
    { id:'n',  sx: mx,   sy: tl.y },
    { id:'ne', sx: br.x, sy: tl.y },
    { id:'e',  sx: br.x, sy: my   },
    { id:'se', sx: br.x, sy: br.y },
    { id:'s',  sx: mx,   sy: br.y },
    { id:'sw', sx: tl.x, sy: br.y },
    { id:'w',  sx: tl.x, sy: my   },
  ];
}

// Nom des manettes de redimenbsionnement
const HANDLE_CURSORS = {
  n:'ns-resize', s:'ns-resize',
  e:'ew-resize', w:'ew-resize',
  ne:'nesw-resize', sw:'nesw-resize',
  nw:'nwse-resize', se:'nwse-resize',
};

function hitRoomHandle(sx, sy) {
  if (!selectedRoomId) return null;

  const r = rooms.find(r => r.id === selectedRoomId);
  if (!r) return null;

  const handles = getRoomHandlePositions(r);
  const HIT = HANDLE_SIZE + 4;

  for (const h of handles) {
    if (Math.abs(sx - h.sx) < HIT/2 && Math.abs(sy - h.sy) < HIT/2) return h.id;
  }

  return null;
}

/**
 * Dessine un élément sur le canva
 * @param {*} el element à dessiner
 */
function drawElement(el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  if (el.rotation) ctx.rotate(el.rotation * Math.PI / 180);
 
  const s = el.size || 36;
  const d = DEFAULTS[el.type] || {};
 
  if (el.type === 'text') {
    ctx.font = `bold ${s}px sans-serif`;
    ctx.fillStyle = el.color || '#f5c842';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.label || 'Texte', 0, 0);
 
  } else if (d.shape === 'rect' || el.type === 'table' || el.type === 'wall') {
    ctx.fillStyle = el.color || d.color || '#7bed9f';
    ctx.fillRect(-s/2, -s*0.3, s, s*0.6);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5/zoom;
    ctx.strokeRect(-s/2, -s*0.3, s, s*0.6);
    if (el.label) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, s*0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, 0, 0);
    }
 
  } else {
    if (d.img) {
      const img = loadImage(d.img);
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, -s/2, -s/2, s, s);
      } else {
        // Placeholder pendant le chargement
        ctx.fillStyle = d.color || '#4a9eff';
        ctx.globalAlpha = 0.3;
        ctx.fillRect(-s/2, -s/2, s, s);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.font = `${s}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const em = el.emoji || d.emoji || '?';
      if (em) ctx.fillText(em, 0, 0);
    }
 
    if (el.label) {
      ctx.font = `bold ${Math.max(9, s*0.28)}px Arial`;
      ctx.fillStyle = el.color || d.color || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3/zoom;
      ctx.fillText(el.label, 0, s*0.5+2/zoom);
    }
  }
 
  // Sélection
  if (el.id === selectedId) {
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5/zoom, 3/zoom]);
    const r = (el.type === 'text' ? el.size * (el.label||'').length * 0.35 : s * 0.65);
    ctx.strokeRect(-r, -r, r*2, r*2);
    ctx.setLineDash([]);
    const hs = 6/zoom;
    ctx.fillStyle = '#f5c842';
    [[-r,-r],[r,-r],[-r,r],[r,r]].forEach(([hx,hy]) => {
      ctx.fillRect(hx-hs/2, hy-hs/2, hs, hs);
    });
  }
 
  ctx.restore();
}

/**
 * Permet aux élements de se coller à la grille
 */
function snap(v, g=40) { 
  return Math.round(v/g)*g; 
}

/**
 * Détecte un clique sur un élément
 */
function hitTest(wx, wy) {
  const els = [...elements].reverse();
  for (const el of els) {
    const s = el.size || 36;
    const r = (el.type === 'text' ? s * (el.label||'').length * 0.35 : s*0.65);
    const dx = wx - el.x, dy = wy - el.y;
    if (Math.abs(dx) < r+4 && Math.abs(dy) < r+4) return el;
  }
  return null;
}

/**
 * Détecte un clique sur une salle
 */
function hitRoom(wx, wy) {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return r;
  }
  return null;
}

/**
 * Change le curseur en fonction de ce qu'il fait (survol, clic, drag)
 */
function updateCursor(e) {
  if (spaceDown || isPanning) { canvas.style.cursor = isPanning ? 'grabbing' : 'grab'; return; }
  if (tool === 'room') { canvas.style.cursor = 'crosshair'; return; }
  if (isResizingRoom) { canvas.style.cursor = HANDLE_CURSORS[resizeHandle] || 'nwse-resize'; return; }
  if (isDragging) { canvas.style.cursor = 'grabbing'; return; }

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const w = toWorld(sx, sy);

  const handle = hitRoomHandle(sx, sy);
  if (handle) { canvas.style.cursor = HANDLE_CURSORS[handle]; return; }

  const el = hitTest(w.x, w.y);
  if (el) { canvas.style.cursor = 'grab'; return; }

  const room = hitRoom(w.x, w.y);
  if (room) { canvas.style.cursor = 'move'; return; }

  canvas.style.cursor = 'default';
}

canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  closeCtxMenu();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const w = toWorld(sx, sy);

  if (e.button === 2) {
    const hit = hitTest(w.x, w.y);
    if (hit) { selectedId = hit.id; ctxMenuTarget = hit; showCtxMenu(e.clientX, e.clientY); draw(); }
    return;
  }

  if (spaceDown || e.button === 1) {
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (tool === 'room') {
    isDrawingRoom = true;
    roomStart = { x: snap(w.x), y: snap(w.y) };
    roomCurrent = { ...roomStart };
    return;
  }

  const handle = hitRoomHandle(sx, sy);
  if (handle) {
    isResizingRoom = true;
    resizeHandle = handle;
    resizeRoomId = selectedRoomId;
    resizeStartMouse = { x: w.x, y: w.y };
    const r = rooms.find(r => r.id === selectedRoomId);
    resizeStartRoom = { ...r };
    saveHistory();
    canvas.style.cursor = HANDLE_CURSORS[handle];
    return;
  }

  const hit = hitTest(w.x, w.y);
  if (hit) {
    selectedId = hit.id;
    selectedRoomId = null;
    isDragging = true;
    dragOffX = w.x - hit.x;
    dragOffY = w.y - hit.y;
    updatePropsPanel();
    draw();
    mouseDown = true;
    canvas.style.cursor = 'grabbing';
    return;
  }

  const room = hitRoom(w.x, w.y);
  if (room) {
    selectedRoomId = room.id;
    selectedId = null;
    updatePropsPanel();
    draw();
    return;
  }

  // Si clique sur rien on désélectionne tout
  selectedId = null;
  selectedRoomId = null;
  updatePropsPanel();
  draw();
  mouseDown = true;
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const w = toWorld(sx, sy);

  if (isPanning) {
    panX += e.clientX - lastPanX;
    panY += e.clientY - lastPanY;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    draw();
    return;
  }

  if (isDrawingRoom) {
    roomCurrent = { x: snap(w.x), y: snap(w.y) };
    draw();
    return;
  }

  if (isResizingRoom) {
    const r = rooms.find(r => r.id === resizeRoomId);
    if (r) {
      applyRoomResize(r, resizeHandle, resizeStartRoom, resizeStartMouse, w);
      draw();
    }
    return;
  }

  if (isDragging && selectedId) {
    const el = elements.find(e => e.id === selectedId);
    if (el) {
      el.x = snap(w.x - dragOffX);
      el.y = snap(w.y - dragOffY);
      draw();
    }
  }

  updateCursor(e);
});

canvas.addEventListener('mouseup', e => {
  if (isDrawingRoom && roomStart && roomCurrent) {
    const x = Math.min(roomStart.x, roomCurrent.x);
    const y = Math.min(roomStart.y, roomCurrent.y);
    const w = Math.abs(roomCurrent.x - roomStart.x);
    const h = Math.abs(roomCurrent.y - roomStart.y);
    if (w > 40 && h > 40) {
      saveHistory();
      const newRoom = { id: makeId(), x, y, w, h, label: 'Salle', color: '#fafaf8' };
      rooms.push(newRoom);
      selectedRoomId = newRoom.id;
    }
    isDrawingRoom = false; roomStart = null; roomCurrent = null;
  }

  if (isResizingRoom) {
    isResizingRoom = false;
    resizeHandle = null;
    resizeRoomId = null;
  }

  if (isDragging) { saveHistory(); }
  isDragging = false;
  isPanning = false;
  mouseDown = false;

  const rect = canvas.getBoundingClientRect();
  updateCursor({ clientX: e.clientX, clientY: e.clientY });
  draw();
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(4, Math.max(0.2, zoom * factor));
  panX = sx - (sx - panX) * (newZoom / zoom);
  panY = sy - (sy - panY) * (newZoom / zoom);
  zoom = newZoom;
  document.getElementById('zoom-display').textContent = Math.round(zoom*100) + '%';
  draw();
}, { passive: false });

function applyRoomResize(r, handle, start, startMouse, mouse) {
  const dx = mouse.x - startMouse.x;
  const dy = mouse.y - startMouse.y;
  const MIN = 80;

  let newX = start.x, newY = start.y, newW = start.w, newH = start.h;

  if (handle.includes('e')) { newW = Math.max(MIN, snap(start.w + dx)); }
  if (handle.includes('s')) { newH = Math.max(MIN, snap(start.h + dy)); }
  if (handle.includes('w')) {
    const dxSnapped = snap(dx);
    const candidate = start.w - dxSnapped;
    if (candidate >= MIN) { newX = start.x + dxSnapped; newW = candidate; }
  }
  if (handle.includes('n')) {
    const dySnapped = snap(dy);
    const candidate = start.h - dySnapped;
    if (candidate >= MIN) { newY = start.y + dySnapped; newH = candidate; }
  }

  r.x = newX; r.y = newY; r.w = newW; r.h = newH;
}


window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  if (e.ctrlKey && e.key === 'z') undo();
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = 'default'; }
});

/**
 * Drag un élément de la sidebar
 */
document.querySelectorAll('.element-btn').forEach(btn => {
  btn.addEventListener('dragstart', e => {
    dragType = btn.dataset.type;
  });
});

wrapper.addEventListener('dragover', e => e.preventDefault());
wrapper.addEventListener('drop', e => {
  e.preventDefault();
  if (!dragType) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const w = toWorld(sx, sy);
  addElement(dragType, snap(w.x), snap(w.y));
  dragType = null;
});

function addElement(type, x, y) {
  saveHistory();
  const d = DEFAULTS[type] || {};
  const count = elements.filter(e => e.type === type).length + 1;
  const label = d.label ? (d.label === 'P1' ? 'P'+count : d.label) : '';
  elements.push({
    id: makeId(),
    type, x, y,
    label: label,
    rotation: 0,
    color: d.color || '#fff',
    size: d.size || 36,
    emoji: d.emoji || '',
    z: elements.length,
  });
  selectedId = elements[elements.length-1].id;
  selectedRoomId = null;
  updatePropsPanel();
  draw();
}

function updatePropsPanel() {
  const el = elements.find(e => e.id === selectedId);
  document.getElementById('no-selection').style.display = el ? 'none' : 'block';
  document.getElementById('selection-props').style.display = el ? 'block' : 'none';
  if (el) {
    document.getElementById('prop-label').value = el.label || '';
    document.getElementById('prop-rotation').value = el.rotation || 0;
    document.getElementById('rot-val').textContent = (el.rotation||0) + '°';
    document.getElementById('prop-color').value = el.color || '#ffffff';
    document.getElementById('prop-size').value = el.size || 36;
  }
}

function updateSelectedProp(prop, val) {
  const el = elements.find(e => e.id === selectedId);
  if (!el) return;
  el[prop] = val;
  draw();
}

// Outils
function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tool-'+t)?.classList.add('active');
  canvas.style.cursor = t === 'room' ? 'crosshair' : 'default';
}

// Zoom
function zoomIn() { 
  zoom = Math.min(4, zoom * 1.2); 
  updateZoomDisplay(); 
  draw(); 
}

function zoomOut() { 
  zoom = Math.max(0.2, zoom / 1.2); 
  updateZoomDisplay(); 
  draw(); 
}

function resetZoom() { 
  zoom = 1;
  panX = 0; 
  panY = 0; 
  updateZoomDisplay(); 
  draw(); 
}

function updateZoomDisplay() { 
  document.getElementById('zoom-display').textContent = Math.round(zoom*100)+'%'; 
}

// Historique
function saveHistory() {
  history.push(JSON.stringify({ elements, rooms }));
  if (history.length > 40) history.shift();
}

function undo() {
  if (!history.length) return;
  const state = JSON.parse(history.pop());
  elements = state.elements;
  rooms = state.rooms;
  selectedId = null;
  selectedRoomId = null;
  updatePropsPanel();
  draw();
}

function deleteSelected() {
  if (selectedId) {
    saveHistory();
    elements = elements.filter(e => e.id !== selectedId);
    selectedId = null;
    updatePropsPanel();
    draw();
  } else if (selectedRoomId) {
    saveHistory();
    rooms = rooms.filter(r => r.id !== selectedRoomId);
    selectedRoomId = null;
    draw();
  }
}

function clearAll() {
  if (!confirm('Effacer tout le plan ?')) return;
  saveHistory();
  elements = []; rooms = []; selectedId = null; selectedRoomId = null;
  updatePropsPanel();
  draw();
}

function newPlan() {
  if (!confirm('Créer un nouveau plan ? (les modifications non sauvegardées seront perdues)')) return;
  elements = []; rooms = []; selectedId = null; selectedRoomId = null; history = [];
  document.getElementById('plan-name').value = 'Mon plan de tournage';
  resetZoom();
  updatePropsPanel();
  draw();
}

// Menu contextuelle (dupliquer, ...)
function showCtxMenu(x, y) {
  const m = document.getElementById('ctx-menu');
  m.style.display = 'block';
  m.style.left = x + 'px';
  m.style.top = y + 'px';
}
function closeCtxMenu() { document.getElementById('ctx-menu').style.display = 'none'; }
window.addEventListener('click', closeCtxMenu);

function ctxDuplicate() {
  const el = elements.find(e => e.id === selectedId);
  if (!el) return;
  saveHistory();
  const copy = { ...el, id: makeId(), x: el.x + 40, y: el.y + 40 };
  elements.push(copy);
  selectedId = copy.id;
  updatePropsPanel();
  draw();
}
function ctxToFront() {
  const el = elements.find(e => e.id === selectedId);
  if (!el) return;
  el.z = Math.max(...elements.map(e => e.z||0)) + 1;
  draw();
}
function ctxToBack() {
  const el = elements.find(e => e.id === selectedId);
  if (!el) return;
  el.z = Math.min(...elements.map(e => e.z||0)) - 1;
  draw();
}

// Sauvegardé et chargé un plan
function savePlan() {
  const name = document.getElementById('plan-name').value || 'plan';
  const data = { name, elements, rooms, zoom, panX, panY };
  localStorage.setItem('planausol_' + name, JSON.stringify(data));
  localStorage.setItem('planausol_last', name);
  showToast('Plan sauvegardé');
}

/**
 * charge un plan du localstorage
 * @returns le plan récupérer
 */
function loadPlan() {
  const lastName = localStorage.getItem('planausol_last');
  if (!lastName) return;
  const raw = localStorage.getItem('planausol_' + lastName);
  if (!raw) return;
  const data = JSON.parse(raw);
  elements = data.elements || [];
  rooms = data.rooms || [];
  zoom = data.zoom || 1;
  panX = data.panX || canvas.width / 2;
  panY = data.panY || canvas.height / 2;
  document.getElementById('plan-name').value = data.name || '';
  updateZoomDisplay();
  draw();
  showToast('Plan restauré : ' + data.name);
}

// Permet de sauvegarder toute les 30 secondes
setInterval(() => {
  const name = document.getElementById('plan-name').value || 'autosave';
  localStorage.setItem('planausol_' + name, JSON.stringify({ name, elements, rooms, zoom, panX, panY }));
  localStorage.setItem('planausol_last', name);
}, 30000);

// Export png du plan au sol
function exportPNG() {
  const PADDING = 80;
  const OUT_W = 1600, OUT_H = 1100;
 
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
 
  rooms.forEach(r => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  });
 
  elements.forEach(el => {
    const s = el.size || 36;
    minX = Math.min(minX, el.x - s);
    minY = Math.min(minY, el.y - s);
    maxX = Math.max(maxX, el.x + s);
    maxY = Math.max(maxY, el.y + s);
  });
 
  if (!isFinite(minX)) { minX = -200; minY = -150; maxX = 200; maxY = 150; }
 
  const contentW = maxX - minX;
  const contentH = maxY - minY;
 
  const scaleX = (OUT_W - PADDING * 2) / contentW;
  const scaleY = (OUT_H - PADDING * 2) / contentH;
  const scale = Math.min(scaleX, scaleY, 2); // max 2x pour ne pas pixéliser
 
  const scaledW = contentW * scale;
  const scaledH = contentH * scale;
  const offX = (OUT_W - scaledW) / 2 - minX * scale;
  const offY = (OUT_H - scaledH) / 2 - minY * scale;
 
  const exp = document.createElement('canvas');
  exp.width = OUT_W; exp.height = OUT_H;
  const ec = exp.getContext('2d');
 
  // Fond blanc
  ec.fillStyle = '#fafaf7';
  ec.fillRect(0, 0, OUT_W, OUT_H);
 
  // Grille
  const gs = 40 * scale;
  const gox = offX % gs, goy = offY % gs;
  ec.strokeStyle = '#ddd';
  ec.lineWidth = 0.5;
  for (let gx = gox; gx < OUT_W; gx += gs) { ec.beginPath(); ec.moveTo(gx, 0); ec.lineTo(gx, OUT_H); ec.stroke(); }
  for (let gy = goy; gy < OUT_H; gy += gs) { ec.beginPath(); ec.moveTo(0, gy); ec.lineTo(OUT_W, gy); ec.stroke(); }
 
  ec.save();
  ec.translate(offX, offY);
  ec.scale(scale, scale);
 
  // Salles
  rooms.forEach(r => {
    ec.save();
    ec.fillStyle = r.color || '#fafaf7';
    ec.fillRect(r.x, r.y, r.w, r.h);
    // Grille intérieure
    ec.strokeStyle = '#e0ddd5';
    ec.lineWidth = 0.5 / scale;
    for (let gx = r.x; gx <= r.x + r.w; gx += 40) {
      ec.beginPath(); ec.moveTo(gx, r.y); ec.lineTo(gx, r.y + r.h); ec.stroke();
    }
    for (let gy = r.y; gy <= r.y + r.h; gy += 40) {
      ec.beginPath(); ec.moveTo(r.x, gy); ec.lineTo(r.x + r.w, gy); ec.stroke();
    }
    ec.strokeStyle = '#222';
    ec.lineWidth = 3 / scale;
    ec.strokeRect(r.x, r.y, r.w, r.h);
    if (r.label) {
      ec.fillStyle = '#333';
      ec.font = `bold ${14 / scale}px sans-serif`;
      ec.textAlign = 'left';
      ec.fillText(r.label, r.x + 6 / scale, r.y + 16 / scale);
    }
    ec.restore();
  });
 
  // Éléments
  elements.forEach(el => {
    const d = DEFAULTS[el.type] || {};
    ec.save();
    ec.translate(el.x, el.y);
    if (el.rotation) ec.rotate(el.rotation * Math.PI / 180);
    const s = el.size || 36;
 
    if (el.type === 'text') {
      ec.font = `bold ${s}px sans-serif`;
      ec.fillStyle = el.color || '#f5c842';
      ec.textAlign = 'center';
      ec.textBaseline = 'middle';
      ec.fillText(el.label || 'Texte', 0, 0);
    } else if (d.shape === 'rect' || el.type === 'table' || el.type === 'wall') {
      ec.fillStyle = el.color || d.color || '#7bed9f';
      ec.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
      ec.strokeStyle = 'rgba(0,0,0,0.3)';
      ec.lineWidth = 1.5 / scale;
      ec.strokeRect(-s / 2, -s * 0.3, s, s * 0.6);
      if (el.label) {
        ec.fillStyle = '#fff';
        ec.font = `bold ${Math.max(8, s * 0.22)}px monospace`;
        ec.textAlign = 'center';
        ec.textBaseline = 'middle';
        ec.fillText(el.label, 0, 0);
      }
    } else {
      if (d.img) {
        const img = loadImage(d.img);
        if (img.complete && img.naturalWidth) {
          ec.drawImage(img, -s/2, -s/2, s, s);
        }
      } else {
        ec.font = `${s}px serif`;
        ec.textAlign = 'center'; ec.textBaseline = 'middle';
        const em = d.emoji || '';
        if (em) ec.fillText(em, 0, 0);
      }
      if (el.label) {
        ec.font = `bold ${Math.max(9, s*0.28)}px monospace`;
        ec.fillStyle = el.color || d.color || '#000';
        ec.strokeStyle = 'rgba(255,255,255,0.8)'; ec.lineWidth = 3 / scale;
        ec.strokeText(el.label, 0, s*0.6);
        ec.fillText(el.label, 0, s*0.6);
      }
    }
    ec.restore();
  });
 
  ec.restore();
 
  // Watermark
  ec.fillStyle = '#bbb';
  ec.font = '13px monospace';
  ec.textAlign = 'right';
  ec.fillText('PlanAuSol - ' + (document.getElementById('plan-name').value || ''), OUT_W - 14, OUT_H - 14);
 
  const link = document.createElement('a');
  link.download = (document.getElementById('plan-name').value || 'plan') + '.png';
  link.href = exp.toDataURL('image/png');
  link.click();
}

// Toast
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#f5c842;color:#111;font-family:Space Mono,monospace;font-size:0.75rem;padding:10px 20px;border-radius:6px;z-index:999;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,0.4)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.opacity = '0', 2500);
}

// Init
loadPlan();
if (!rooms.length && !elements.length) {
  const demoRoom = { id: makeId(), x:-200, y:-150, w:400, h:300, label:'Décor principal', color:'#fafaf7' };
  rooms.push(demoRoom);
 
  // Centrer la vue sur le centre de la salle
  const roomCenterX = demoRoom.x + demoRoom.w / 2; // 0
  const roomCenterY = demoRoom.y + demoRoom.h / 2; // 0
  panX = canvas.width  / 2 - roomCenterX * zoom;   // centre horizontal
  panY = canvas.height / 2 - roomCenterY * zoom;   // centre vertical
 
  draw();
}