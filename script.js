const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

const UI = {
  resVal: document.getElementById('val-res'),
  resBar: document.getElementById('bar-res'),
  volVal: document.getElementById('val-vol'),
  volBar: document.getElementById('bar-vol'),
  alarmBox: document.getElementById('alarm-box'),
  alarmIcon: document.getElementById('alarm-icon'),
  alarmText: document.getElementById('alarm-text'),
  smokeToggle: document.getElementById('toggle-smoke'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.getElementById('system-status'),
  btnResetAlarm: document.getElementById('reset-alarm'),
  bigIndicator: document.getElementById('big-indicator'),
  sliderVin: document.getElementById('slider-vin'),
  dispVin: document.getElementById('disp-vin')
};

// Physics Constants
let V_IN = 5.0; // Dynamic Volts source
const R1 = 10000; // 10 kΩ series resistor
const R_DARK = 10000000; // 10 MΩ
const R_LIGHT = 1000;    // 1 kΩ
const V_THRESHOLD = 2.5; // Alarm triggers if voltage drops below this

let width, height;
let isDragging = false;
let draggedObj = null;
let alarmLatched = false;

// Scene State
let objects = {
  emitter: { x: 50, y: 300, angle: 0, r: 25, type: 'emitter' },
  target: { x: 800, y: 300, r: 25, type: 'ldr' },
  mirrors: [],
  intruders: [
    { x: 400, y: 150, w: 60, h: 60, type: 'intruder', r: 30 }
  ]
};

// Initialize
function init() {
  resize();
  window.addEventListener('resize', resize);
  
  // Setup Canvas Interactivity
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  
  // Wheel to rotate
  canvas.addEventListener('wheel', (e) => {
    if(draggedObj && draggedObj.type === 'mirror') {
      e.preventDefault();
      draggedObj.angle += e.deltaY > 0 ? 0.05 : -0.05;
    } else if (draggedObj && draggedObj.type === 'emitter') {
      e.preventDefault();
      draggedObj.angle += e.deltaY > 0 ? 0.05 : -0.05;
    }
  }, {passive: false});

  // Buttons
  document.getElementById('spawn-mirror').addEventListener('click', () => {
    objects.mirrors.push({
      x: width/2, y: height/2, width: 80, height: 10, angle: Math.PI/4, type: 'mirror', r: 40
    });
  });
  
  document.getElementById('spawn-intruder').addEventListener('click', () => {
    objects.intruders.push({
      x: width/2 - 100, y: height/2, w: 60, h: 60, type: 'intruder', r: 30
    });
  });

  document.getElementById('reset-sim').addEventListener('click', () => {
    objects.mirrors = [];
    objects.intruders = [ { x: width/2, y: 150, w: 60, h: 60, type: 'intruder', r: 30 } ];
    objects.emitter.x = 50; objects.emitter.y = height/2; objects.emitter.angle = 0;
    objects.target.x = width - 100; objects.target.y = height/2;
    alarmLatched = false;
  });

  UI.btnResetAlarm.addEventListener('click', () => {
    alarmLatched = false;
  });

  UI.sliderVin.addEventListener('input', (e) => {
    V_IN = parseFloat(e.target.value);
    UI.dispVin.innerText = V_IN.toFixed(1) + ' V';
  });

  // Start initial positions
  objects.emitter.y = height / 2;
  objects.target.x = width - 150;
  objects.target.y = height / 2;

  requestAnimationFrame(loop);
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  width = canvas.width;
  height = canvas.height;
}

// Interactivity Logic
function findTarget(x, y) {
  // Note: Emitter and Target are now fixed (cannot be dragged)
  
  // Check Mirrors
  for (let m of objects.mirrors) {
    if (Math.hypot(m.x - x, m.y - y) <= m.r) return m;
  }
  
  // Check Intruders
  for (let i of objects.intruders) {
    if (x > i.x - i.w/2 && x < i.x + i.w/2 && y > i.y - i.h/2 && y < i.y + i.h/2) return i;
  }
  
  return null;
}

function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const obj = findTarget(x, y);
  if (obj) {
    isDragging = true;
    draggedObj = obj;
  }
}

function onMouseMove(e) {
  if (!isDragging || !draggedObj) return;
  const rect = canvas.getBoundingClientRect();
  draggedObj.x = e.clientX - rect.left;
  draggedObj.y = e.clientY - rect.top;
}

function onMouseUp() {
  isDragging = false;
  draggedObj = null;
}

// Math Utilities
// Line segment intersection (Returns closest t on segment)
function checkIntersection(p0, p1, p2, p3) {
  let s1_x = p1.x - p0.x, s1_y = p1.y - p0.y;
  let s2_x = p3.x - p2.x, s2_y = p3.y - p2.y;
  let s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
  let t = ( s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return {
      x: p0.x + (t * s1_x),
      y: p0.y + (t * s1_y),
      t: t
    };
  }
  return null;
}

function circleIntersect(p1, p2, cx, cy, r) {
  // Distance from point to line segment
  const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
  if(l2 === 0) return null;
  
  let t = ((cx - p1.x) * (p2.x - p1.x) + (cy - p1.y) * (p2.y - p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = p1.x + t * (p2.x - p1.x);
  const projY = p1.y + t * (p2.y - p1.y);
  
  const dist = Math.hypot(cx - projX, cy - projY);
  if(dist < r) {
    return { x: projX, y: projY, t: t };
  }
  return null;
}

function raycast(ox, oy, angle, depth = 0, linesToDraw) {
  if (depth > 10) return false; // max bounces

  let dirX = Math.cos(angle);
  let dirY = Math.sin(angle);
  let rayEnd = { x: ox + dirX * 3000, y: oy + dirY * 3000 };
  
  let minIntersect = null;
  let hitType = null;
  let hitNormal = null;

  // Check Canvas Bounds
  let bounds = [
    [{x:0, y:0}, {x:width, y:0}],
    [{x:width, y:0}, {x:width, y:height}],
    [{x:width, y:height}, {x:0, y:height}],
    [{x:0, y:height}, {x:0, y:0}],
    [{x:objects.target.x + objects.target.r, y:0}, {x:objects.target.x + objects.target.r, y:height}]
  ];
  
  bounds.forEach(b => {
    let inter = checkIntersection({x: ox, y: oy}, rayEnd, b[0], b[1]);
    if (inter && (!minIntersect || inter.t < minIntersect.t) && inter.t > 0.001) {
      minIntersect = inter;
      hitType = 'wall';
    }
  });

  // Check Mirrors
  objects.mirrors.forEach(m => {
    let p1 = {x: m.x - Math.cos(m.angle)*m.width/2, y: m.y - Math.sin(m.angle)*m.width/2};
    let p2 = {x: m.x + Math.cos(m.angle)*m.width/2, y: m.y + Math.sin(m.angle)*m.width/2};
    let inter = checkIntersection({x: ox, y: oy}, rayEnd, p1, p2);
    
    if (inter && (!minIntersect || inter.t < minIntersect.t) && inter.t > 0.001) {
      minIntersect = inter;
      hitType = 'mirror';
      // Mirror normal is perpendicular to its line
      hitNormal = m.angle + Math.PI/2;
    }
  });

  // Check Intruders (Rectangle)
  objects.intruders.forEach(i => {
    let rectBounds = [
      [{x:i.x-i.w/2, y:i.y-i.h/2}, {x:i.x+i.w/2, y:i.y-i.h/2}],
      [{x:i.x+i.w/2, y:i.y-i.h/2}, {x:i.x+i.w/2, y:i.y+i.h/2}],
      [{x:i.x+i.w/2, y:i.y+i.h/2}, {x:i.x-i.w/2, y:i.y+i.h/2}],
      [{x:i.x-i.w/2, y:i.y+i.h/2}, {x:i.x-i.w/2, y:i.y-i.h/2}]
    ];
    rectBounds.forEach(b => {
      let inter = checkIntersection({x: ox, y: oy}, rayEnd, b[0], b[1]);
      if (inter && (!minIntersect || inter.t < minIntersect.t) && inter.t > 0.001) {
        minIntersect = inter;
        hitType = 'intruder';
      }
    });
  });

  // Check Target LDR
  let hitLDR = false;
  let targetInt = circleIntersect({x: ox, y: oy}, rayEnd, objects.target.x, objects.target.y, objects.target.r);
  if (targetInt && (!minIntersect || targetInt.t < minIntersect.t)) {
    minIntersect = targetInt;
    hitType = 'ldr';
    hitLDR = true;
  }

  // Draw Ray
  let endX = minIntersect ? minIntersect.x : rayEnd.x;
  let endY = minIntersect ? minIntersect.y : rayEnd.y;
  
  linesToDraw.push({x1: ox, y1: oy, x2: endX, y2: endY});

  // Recurse physics (Reflection)
  if (hitType === 'mirror' && hitNormal !== null) {
    // R = V - 2(V.N)N
    // Or in angles: angle_out = 2*normal - angle_in - PI
    let inAngle = Math.atan2(endY - oy, endX - ox);
    let outAngle = 2 * hitNormal - inAngle - Math.PI;
    return raycast(endX, endY, outAngle, depth + 1, linesToDraw);
  }

  return hitType === 'ldr' ? true : hitLDR;
}

// Update Physics State
function updatePhysics(isBeamHitting) {
  // LDR Reaction Time (Smoothing)
  let targetR = isBeamHitting ? R_LIGHT : R_DARK;
  
  // R_LDR is what we are transitioning
  if(!window.currentR) window.currentR = targetR;
  window.currentR += (targetR - window.currentR) * 0.1; // smoothing

  // Voltage Divider: V_out = V_in * (R1 / (R1 + R_ldr)) 
  // Wait, if LDR is in series with R1, pulling down to ground:
  // Usually LDR to GND, R1 to +5V. 
  // V_out = V_in * (R_ldr / (R1 + R_ldr))
  let Vout = V_IN * (window.currentR / (R1 + window.currentR));

  // Determine Alarm State
  // If light hits: R_ldr = 1k, Vout = 5 * (1k / 11k) = ~0.45V (Low)
  // If beam broken: R_ldr = 10M, Vout = 5 * (10M / 10.01M) = ~5V (High)
  
  // Wait, the UI implies Voltage drops when beam broken. Let's flip the divider:
  // LDR connects to +5V, R1 to GND.
  // V_out = V_in * (R1 / (R1 + R_ldr))
  // When Light: R_LDR = 1k. V_out = 5 * 10k / 11k = 4.54V 
  // When Dark: R_LDR = 10M. V_out = 5 * 10k / 10M = 0.005V
  Vout = V_IN * (R1 / (R1 + window.currentR));

  let isAlarm = Vout < V_THRESHOLD;
  if(isAlarm) alarmLatched = true;

  // Update UI Elements
  // Format Resistance
  if (window.currentR > 1000000) {
    UI.resVal.innerText = (window.currentR / 1000000).toFixed(2);
    UI.resVal.nextElementSibling.innerText = "MΩ";
  } else {
    UI.resVal.innerText = (window.currentR / 1000).toFixed(2);
    UI.resVal.nextElementSibling.innerText = "kΩ";
  }
  
  UI.resBar.style.width = Math.max(1, (window.currentR / R_DARK) * 100) + '%';
  UI.resBar.style.backgroundColor = isAlarm ? 'var(--alarm-red)' : 'var(--safe-green)';

  UI.volVal.innerText = Vout.toFixed(2);
  UI.volBar.style.width = (Vout / V_IN) * 100 + '%';
  UI.volBar.style.backgroundColor = isAlarm ? 'var(--alarm-red)' : 'var(--safe-green)';

  // Alarm UI
  if (alarmLatched) {
    UI.alarmBox.className = 'alarm-state';
    UI.alarmIcon.className = 'ph ph-siren';
    UI.alarmText.innerText = 'ALARM TRIGGERED (BEAM BROKEN)';
    UI.statusDot.className = 'status-dot alarm';
    UI.statusText.innerText = 'BREACH DETECTED';
    UI.statusText.style.color = 'var(--alarm-red)';
    UI.btnResetAlarm.style.display = 'flex';
    if(UI.bigIndicator) UI.bigIndicator.className = 'light-bulb alarm';
  } else {
    UI.alarmBox.className = 'alarm-state safe';
    UI.alarmIcon.className = 'ph ph-shield-check';
    UI.alarmText.innerText = 'SECURE (LASER OPTIMAL)';
    UI.statusDot.className = 'status-dot';
    UI.statusText.innerText = 'SYSTEM ONLINE';
    UI.statusText.style.color = 'var(--text-muted)';
    UI.btnResetAlarm.style.display = 'none';
    if(UI.bigIndicator) UI.bigIndicator.className = 'light-bulb safe';
  }

  return alarmLatched;
}

// Main Render Loop
function loop() {
  ctx.clearRect(0, 0, width, height);
  
  const smokeActive = UI.smokeToggle.checked;
  let linesToDraw = [];
  
  // Logic
  let beamHitting = raycast(objects.emitter.x, objects.emitter.y, objects.emitter.angle, 0, linesToDraw);
  let isAlarm = updatePhysics(beamHitting);

  // Draw Mirrors
  ctx.lineWidth = 4;
  objects.mirrors.forEach(m => {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(-m.width/2, -m.height/2, m.width, m.height);
    // Silver coating
    ctx.fillStyle = '#8B949E';
    ctx.fillRect(-m.width/2, -m.height/2, m.width, 3);
    
    // selection ring
    if(m === draggedObj) {
      ctx.beginPath();
      ctx.arc(0,0, m.r, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(47, 129, 247, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      ctx.stroke();
    }
    ctx.restore();
  });

  // Draw Intruders
  objects.intruders.forEach(i => {
    ctx.fillStyle = '#21262D';
    ctx.strokeStyle = '#30363D';
    ctx.lineWidth = 2;
    ctx.fillRect(i.x - i.w/2, i.y - i.h/2, i.w, i.h);
    ctx.strokeRect(i.x - i.w/2, i.y - i.h/2, i.w, i.h);
    
    // Draw Hand Icon or something
    ctx.fillStyle = '#8B949E';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✋', i.x, i.y);
    
    if(i === draggedObj) {
      ctx.strokeStyle = 'var(--accent)';
      ctx.setLineDash([4,4]);
      ctx.strokeRect(i.x - i.w/2 - 4, i.y - i.h/2 - 4, i.w + 8, i.h + 8);
      ctx.setLineDash([]);
    }
  });

  // Draw Dotted Wall
  ctx.save();
  ctx.beginPath();
  const wallX = objects.target.x + objects.target.r;
  ctx.moveTo(wallX, 0);
  ctx.lineTo(wallX, height);
  ctx.strokeStyle = '#30363D';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 15]);
  ctx.stroke();
  ctx.restore();

  // Draw Target LDR
  ctx.save();
  ctx.translate(objects.target.x, objects.target.y);
  ctx.fillStyle = '#161B22';
  ctx.beginPath(); ctx.arc(0,0, objects.target.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#30363D';
  ctx.lineWidth = 2; ctx.stroke();
  
  // Sensor active pattern
  ctx.fillStyle = beamHitting ? 'var(--accent)' : '#0D1117';
  ctx.beginPath(); ctx.arc(0,0, 15, 0, Math.PI*2); fillLDRPattern(ctx, beamHitting);

  ctx.restore();

  // Draw Emitter
  ctx.save();
  ctx.translate(objects.emitter.x, objects.emitter.y);
  ctx.rotate(objects.emitter.angle);
  ctx.fillStyle = '#161B22';
  ctx.fillRect(-20, -15, 40, 30);
  ctx.strokeStyle = '#30363D';
  ctx.lineWidth = 2; ctx.strokeRect(-20, -15, 40, 30);
  // Lens
  ctx.fillStyle = '#FF4A4A';
  ctx.fillRect(20, -5, 8, 10);
  // label
  ctx.fillStyle = '#8B949E';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText('LD-1', -15, 4);
  
  ctx.restore();

  // Draw Laser Lines
  linesToDraw.forEach(l => {
    // Glow/Smoke effect
    if(smokeActive) {
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.strokeStyle = 'rgba(255, 74, 74, 0.15)';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.strokeStyle = 'rgba(255, 74, 74, 0.3)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Core beam
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.strokeStyle = '#FF4A4A';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End point flash
    ctx.beginPath();
    ctx.arc(l.x2, l.y2, 4, 0, Math.PI*2);
    ctx.fillStyle = '#FF4A4A';
    ctx.fill();
    if(smokeActive) {
      ctx.beginPath();
      ctx.arc(l.x2, l.y2, 12, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255, 74, 74, 0.3)';
      ctx.fill();
    }
  });

  requestAnimationFrame(loop);
}

function fillLDRPattern(ctx, active) {
  ctx.fill();
  ctx.strokeStyle = active ? '#fff' : '#8B949E';
  ctx.lineWidth = 1;
  
  // wavy zig zag line for LDR symbol
  ctx.beginPath();
  let w = 18; let h = 6;
  ctx.moveTo(-w/2, -h/2);
  ctx.lineTo(-w/4, h/2);
  ctx.lineTo(0, -h/2);
  ctx.lineTo(w/4, h/2);
  ctx.lineTo(w/2, -h/2);
  ctx.stroke();
}

window.onload = init;
