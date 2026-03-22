const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');

// STATE
let elements = [];
let rooms = [];
let selectedId = null;
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

// ELEMENT DEFAULTS
const DEFAULTS = {
  camera:    { emoji:'📷', label:'Cam', color:'#4a9eff', size:36 },
  tripod:    { emoji:'🎬', label:'', color:'#4a9eff', size:36 },
  monitor:   { emoji:'🖥', label:'', color:'#4a9eff', size:36 },
  light:     { emoji:'💡', label:'Lumière', color:'#ffcc44', size:36 },
  reflector: { emoji:'🔆', label:'', color:'#ffcc44', size:36 },
  micro:     { emoji:'🎙', label:'', color:'#ffcc44', size:36 },
  person:    { emoji:'🧍', label:'P1', color:'#ff6b6b', size:36 },
  chair:     { emoji:'🪑', label:'', color:'#7bed9f', size:32 },
  table:     { emoji:'', label:'TABLE', color:'#7bed9f', size:48, shape:'rect' },
  door:      { emoji:'🚪', label:'', color:'#aaa', size:36 },
  window:    { emoji:'🪟', label:'', color:'#aaa', size:36 },
  wall:      { emoji:'', label:'MUR', color:'#555', size:48, shape:'rect' },
  arrow:     { emoji:'➡️', label:'', color:'#fff', size:40 },
  text:      { emoji:'', label:'Annotation', color:'#f5c842', size:14, isText:true },
};

let idCounter = 1;
function makeId() { return 'el_' + (idCounter++); }

// RESIZE CANVAS
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

  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  // Grid
  drawGrid();

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Rooms
  rooms.forEach(r => drawRoom(r));

  // Elements (sorted by z)
  [...elements].sort((a,b) => (a.z||0)-(b.z||0)).forEach(el => drawElement(el));

  // Drawing room preview
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
}

function drawGrid() {
  const gridSize = 40 * zoom;
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

function drawRoom(r) {
  ctx.save();
  // Fill
  ctx.fillStyle = r.color || '#fafaf7';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Grid inside
  const gs = 40;
  ctx.strokeStyle = '#e0ddd5';
  ctx.lineWidth = 0.5 / zoom;
  for (let gx = r.x; gx <= r.x + r.w; gx += gs) {
    ctx.beginPath(); ctx.moveTo(gx, r.y); ctx.lineTo(gx, r.y+r.h); ctx.stroke();
  }
  for (let gy = r.y; gy <= r.y + r.h; gy += gs) {
    ctx.beginPath(); ctx.moveTo(r.x, gy); ctx.lineTo(r.x+r.w, gy); ctx.stroke();
  }
  // Border
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3 / zoom;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  // Label
  if (r.label) {
    ctx.fillStyle = '#333';
    ctx.font = `bold ${14/zoom}px Syne`;
    ctx.textAlign = 'left';
    ctx.fillText(r.label, r.x+6/zoom, r.y+16/zoom);
  }
  ctx.restore();
}

function drawElement(el) {
  ctx.save();
  const cx = el.x, cy = el.y;
  ctx.translate(cx, cy);
  if (el.rotation) ctx.rotate(el.rotation * Math.PI / 180);

  const s = (el.size || 36);
  const d = DEFAULTS[el.type] || {};

  if (el.type === 'text') {
    ctx.font = `bold ${s}px Syne`;
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
      ctx.font = `bold ${Math.max(8, s*0.22)}px Space Mono`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, 0, 0);
    }
  } else {
    // Emoji element
    const fontSize = s;
    ctx.font = `${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const em = el.emoji || d.emoji || '?';
    if (em) ctx.fillText(em, 0, 0);

    // Direction indicator for camera/light
    if (el.type === 'camera' || el.type === 'light') {
      ctx.strokeStyle = el.color || d.color;
      ctx.lineWidth = 2/zoom;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, -s*0.1);
      ctx.lineTo(0, -s*0.85);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Arrow tip
      ctx.fillStyle = el.color || d.color;
      ctx.beginPath();
      ctx.moveTo(0, -s*0.9);
      ctx.lineTo(-4/zoom, -s*0.7);
      ctx.lineTo(4/zoom, -s*0.7);
      ctx.closePath();
      ctx.fill();
    }

    if (el.label) {
      ctx.font = `bold ${Math.max(9, s*0.28)}px Space Mono`;
      ctx.fillStyle = el.color || d.color || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3/zoom;
      ctx.strokeText(el.label, 0, s*0.5+2/zoom);
      ctx.fillText(el.label, 0, s*0.5+2/zoom);
    }
  }

  // Selection ring
  if (el.id === selectedId) {
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5/zoom, 3/zoom]);
    const r = (el.type === 'text' ? el.size * el.label.length * 0.35 : s * 0.65);
    ctx.strokeRect(-r, -r, r*2, r*2);
    ctx.setLineDash([]);
    // Handles
    const hs = 6/zoom;
    ctx.fillStyle = '#f5c842';
    [[-r,-r],[r,-r],[-r,r],[r,r]].forEach(([hx,hy]) => {
      ctx.fillRect(hx-hs/2, hy-hs/2, hs, hs);
    });
  }

  ctx.restore();
}

// SNAP TO GRID
function snap(v, g=40) { return Math.round(v/g)*g; }

// HIT TEST
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

// MOUSE EVENTS
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

  const hit = hitTest(w.x, w.y);
  if (hit) {
    selectedId = hit.id;
    isDragging = true;
    dragOffX = w.x - hit.x;
    dragOffY = w.y - hit.y;
    updatePropsPanel();
  } else {
    selectedId = null;
    updatePropsPanel();
  }
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

  if (isDragging && selectedId) {
    const el = elements.find(e => e.id === selectedId);
    if (el) {
      el.x = snap(w.x - dragOffX);
      el.y = snap(w.y - dragOffY);
      draw();
    }
  }
});

canvas.addEventListener('mouseup', e => {
  if (isDrawingRoom && roomStart && roomCurrent) {
    const x = Math.min(roomStart.x, roomCurrent.x);
    const y = Math.min(roomStart.y, roomCurrent.y);
    const w = Math.abs(roomCurrent.x - roomStart.x);
    const h = Math.abs(roomCurrent.y - roomStart.y);
    if (w > 40 && h > 40) {
      saveHistory();
      rooms.push({ id: makeId(), x, y, w, h, label: 'Salle', color: '#fafaf8' });
    }
    isDrawingRoom = false; roomStart = null; roomCurrent = null;
  }
  if (isDragging) { saveHistory(); }
  isDragging = false;
  isPanning = false;
  mouseDown = false;
  canvas.style.cursor = 'crosshair';
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

// KEYBOARD
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  if (e.ctrlKey && e.key === 'z') undo();
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = 'crosshair'; }
});

// DRAG FROM SIDEBAR
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
  updatePropsPanel();
  draw();
}

// PROPS
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

// TOOLS
function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tool-'+t)?.classList.add('active');
  canvas.style.cursor = t === 'room' ? 'crosshair' : 'default';
}

// ZOOM
function zoomIn() { zoom = Math.min(4, zoom * 1.2); updateZoomDisplay(); draw(); }
function zoomOut() { zoom = Math.max(0.2, zoom / 1.2); updateZoomDisplay(); draw(); }
function resetZoom() { zoom = 1; panX = 0; panY = 0; updateZoomDisplay(); draw(); }
function updateZoomDisplay() { document.getElementById('zoom-display').textContent = Math.round(zoom*100)+'%'; }

// HISTORY
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
  updatePropsPanel();
  draw();
}

function deleteSelected() {
  if (!selectedId) return;
  saveHistory();
  elements = elements.filter(e => e.id !== selectedId);
  selectedId = null;
  updatePropsPanel();
  draw();
}

function clearAll() {
  if (!confirm('Effacer tout le plan ?')) return;
  saveHistory();
  elements = []; rooms = []; selectedId = null;
  updatePropsPanel();
  draw();
}

function newPlan() {
  if (!confirm('Créer un nouveau plan ? (les modifications non sauvegardées seront perdues)')) return;
  elements = []; rooms = []; selectedId = null; history = [];
  document.getElementById('plan-name').value = 'Mon plan de tournage';
  resetZoom();
  updatePropsPanel();
  draw();
}

// CONTEXT MENU
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

// SAVE / LOAD
function savePlan() {
  const name = document.getElementById('plan-name').value || 'plan';
  const data = { name, elements, rooms, zoom, panX, panY };
  localStorage.setItem('planausol_' + name, JSON.stringify(data));
  localStorage.setItem('planausol_last', name);
  showToast('Plan sauvegardé ✓');
}

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

// Auto-save every 30s
setInterval(() => {
  const name = document.getElementById('plan-name').value || 'autosave';
  localStorage.setItem('planausol_' + name, JSON.stringify({ name, elements, rooms, zoom, panX, panY }));
  localStorage.setItem('planausol_last', name);
}, 30000);

// EXPORT PNG
function exportPNG() {
  const exp = document.createElement('canvas');
  exp.width = 1600; exp.height = 1100;
  const ec = exp.getContext('2d');
  ec.fillStyle = '#fafaf7';
  ec.fillRect(0, 0, exp.width, exp.height);
  // Draw rooms
  rooms.forEach(r => {
    ec.save();
    ec.fillStyle = r.color || '#fafaf7';
    ec.fillRect(r.x + 800, r.y + 550, r.w, r.h);
    ec.strokeStyle = '#222';
    ec.lineWidth = 3;
    ec.strokeRect(r.x + 800, r.y + 550, r.w, r.h);
    ec.restore();
  });
  // Draw grid
  ec.strokeStyle = '#ddd';
  ec.lineWidth = 0.5;
  for (let gx = 0; gx < exp.width; gx += 40) { ec.beginPath(); ec.moveTo(gx,0); ec.lineTo(gx,exp.height); ec.stroke(); }
  for (let gy = 0; gy < exp.height; gy += 40) { ec.beginPath(); ec.moveTo(0,gy); ec.lineTo(exp.width,gy); ec.stroke(); }
  // Draw elements
  elements.forEach(el => {
    const d = DEFAULTS[el.type] || {};
    ec.save();
    ec.translate(el.x + 800, el.y + 550);
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
      ec.fillRect(-s/2, -s*0.3, s, s*0.6);
      ec.strokeStyle = 'rgba(0,0,0,0.3)';
      ec.lineWidth = 1.5;
      ec.strokeRect(-s/2, -s*0.3, s, s*0.6);
      ec.fillStyle = '#fff';
      ec.font = `bold ${s*0.22}px monospace`;
      ec.textAlign = 'center';
      ec.textBaseline = 'middle';
      if (el.label) ec.fillText(el.label, 0, 0);
    } else {
      ec.font = `${s}px serif`;
      ec.textAlign = 'center';
      ec.textBaseline = 'middle';
      if (d.emoji) ec.fillText(d.emoji, 0, 0);
      if (el.label) {
        ec.font = `bold ${Math.max(9, s*0.28)}px monospace`;
        ec.fillStyle = el.color || d.color || '#000';
        ec.strokeStyle = 'rgba(255,255,255,0.8)';
        ec.lineWidth = 3;
        ec.strokeText(el.label, 0, s*0.6);
        ec.fillText(el.label, 0, s*0.6);
      }
    }
    ec.restore();
  });
  // Watermark
  ec.fillStyle = '#999';
  ec.font = '13px monospace';
  ec.textAlign = 'right';
  ec.fillText('PlanAuSol — ' + (document.getElementById('plan-name').value || ''), exp.width - 14, exp.height - 14);

  const link = document.createElement('a');
  link.download = (document.getElementById('plan-name').value || 'plan') + '.png';
  link.href = exp.toDataURL('image/png');
  link.click();
}

// EXPORT PDF
function exportPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const name = document.getElementById('plan-name').value || 'Plan de tournage';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(name, 148, 16, { align:'center' });
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(150);
  pdf.text('PlanAuSol — ' + new Date().toLocaleDateString('fr-FR'), 148, 22, { align:'center' });
  // Draw from canvas (capture)
  const dataUrl = canvas.toDataURL('image/png');
  pdf.addImage(dataUrl, 'PNG', 10, 28, 277, 175);
  pdf.save(name + '.pdf');
}

// TOAST
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

// INIT
loadPlan();
if (!rooms.length && !elements.length) {
  // Demo room
  rooms.push({ id: makeId(), x:-200, y:-150, w:400, h:300, label:'Décor principal', color:'#fafaf7' });
  draw();
}