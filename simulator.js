// Basic physics and rendering constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const CENTER_Y = CANVAS_HEIGHT / 2;
const FLOOR_Y = CANVAS_HEIGHT - 20;
const PX_PER_CM = 4; // 4 pixels = 1 cm
const SOURCE_X = 80;
const SOURCE_TO_PMMA_CM = 10;
const PMMA_X = SOURCE_X + SOURCE_TO_PMMA_CM * PX_PER_CM;
const PMMA_VISUAL_THICKNESS = 10;
const PMMA_HEIGHT = 150;
const DETECTOR_WIDTH = 30;
const DETECTOR_HEIGHT = 60;

// Physics constants
const K_CONST = 0.17; // m^2 * uSv/h
const K_ERROR = 0.024;
const MU_CONST = 0.02; // m^-1
const B_CONST = 0.15; // uSv/h

// State holders
let distanceCm = 80;
let counts = 0;
let sourceOpen = true;
let showHeatmap = false;
let doseRateDisplay = "0.150";

const particles = [];
let animationId;

// UI references
const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
const distanceSlider = document.getElementById("distanceSlider");
const distanceLabel = document.getElementById("distanceLabel");
const doseRateEl = document.getElementById("doseRate");
const countsEl = document.getElementById("counts");
const viewToggle = document.getElementById("viewToggle");
const viewLabel = document.getElementById("viewLabel");
const heatmapLegend = document.getElementById("heatmap-legend");
const sourceToggle = document.getElementById("sourceToggle");
const resetButton = document.getElementById("resetButton");

function spawnParticle() {
  const spreadY = (Math.random() - 0.5) * 2;
  particles.push({
    id: Math.random(),
    x: SOURCE_X + 10,
    y: CENTER_Y,
    vx: 6 + Math.random() * 2,
    vy: spreadY,
    type: "beta",
    life: 200,
    history: [],
  });
}

function spawnBackgroundParticle() {
  const speed = 3 + Math.random();
  let startX, startY, vx, vy;
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0:
      startX = Math.random() * CANVAS_WIDTH;
      startY = -10;
      vx = (Math.random() - 0.5) * speed;
      vy = Math.random() * speed;
      break;
    case 1:
      startX = CANVAS_WIDTH + 10;
      startY = Math.random() * CANVAS_HEIGHT;
      vx = -Math.random() * speed;
      vy = (Math.random() - 0.5) * speed;
      break;
    case 2:
      startX = Math.random() * CANVAS_WIDTH;
      startY = CANVAS_HEIGHT + 10;
      vx = (Math.random() - 0.5) * speed;
      vy = -Math.random() * speed;
      break;
    default:
      startX = -10;
      startY = Math.random() * CANVAS_HEIGHT;
      vx = Math.random() * speed;
      vy = (Math.random() - 0.5) * speed;
  }

  particles.push({
    id: Math.random(),
    x: startX,
    y: startY,
    vx,
    vy,
    type: "background_photon",
    life: 400,
    history: [],
  });
}

function updateParticles() {
  const detectorX = PMMA_X + PMMA_VISUAL_THICKNESS + distanceCm * PX_PER_CM;
  const detectorYMin = CENTER_Y - DETECTOR_HEIGHT / 2;
  const detectorYMax = CENTER_Y + DETECTOR_HEIGHT / 2;

  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;

    p.history.push({ x: p.x, y: p.y });
    if (p.history.length > 10) p.history.shift();

    if (
      p.type === "beta" &&
      p.x >= PMMA_X &&
      p.x <= PMMA_X + PMMA_VISUAL_THICKNESS &&
      p.y > CENTER_Y - PMMA_HEIGHT / 2 &&
      p.y < CENTER_Y + PMMA_HEIGHT / 2
    ) {
      const angle = (Math.random() - 0.5) * (Math.PI / 1.5);
      const speed = 4;
      p.type = "photon";
      p.history = [];
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 400;
    }

    if (p.type === "photon" || p.type === "background_photon") {
      if (
        p.x >= detectorX &&
        p.x <= detectorX + DETECTOR_WIDTH &&
        p.y >= detectorYMin &&
        p.y <= detectorYMax
      ) {
        counts += 1;
        countsEl.textContent = counts.toString();
        p.life = 0;
      }
    }

    if (p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20) {
      p.life = 0;
    }
  });

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function drawHeatmap(ctx) {
  const blockSize = 8;
  const cols = Math.ceil(CANVAS_WIDTH / blockSize);
  const rows = Math.ceil(CANVAS_HEIGHT / blockSize);

  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const x = i * blockSize;
      const y = j * blockSize;

      let fieldValue = B_CONST;
      if (sourceOpen) {
        const pmmaCenterX = PMMA_X + PMMA_VISUAL_THICKNESS / 2;
        const pmmaCenterY = CENTER_Y;
        const dx = x - pmmaCenterX;
        const dy = y - pmmaCenterY;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distM = Math.max(distPx / PX_PER_CM / 100, 0.01);
        const attenuation = Math.exp(-MU_CONST * distM);
        const geometricLoss = distM * distM;
        fieldValue += (K_CONST * attenuation) / geometricLoss;
      }

      const logVal = Math.log10(fieldValue);
      const minLog = Math.log10(B_CONST);
      const maxLog = Math.log10(50);
      let t = (logVal - minLog) / (maxLog - minLog);
      t = Math.max(0, Math.min(1, t));
      const hue = 240 - t * 240;

      ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.4)`;
      ctx.fillRect(x, y, blockSize, blockSize);
    }
  }
}

function drawScene() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (showHeatmap) drawHeatmap(ctx);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(CANVAS_WIDTH, FLOOR_Y);
  ctx.stroke();

  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(SOURCE_X - 30, FLOOR_Y);
  ctx.lineTo(SOURCE_X + 30, FLOOR_Y);
  ctx.moveTo(SOURCE_X, FLOOR_Y);
  ctx.lineTo(SOURCE_X, CENTER_Y);
  ctx.moveTo(SOURCE_X, CENTER_Y);
  ctx.lineTo(SOURCE_X + 15, CENTER_Y);
  ctx.stroke();

  ctx.fillStyle = "#222";
  ctx.fillRect(SOURCE_X + 15, CENTER_Y - 8, 20, 16);
  ctx.fillStyle = sourceOpen ? "#00ffaa" : "#333";
  ctx.beginPath();
  ctx.arc(SOURCE_X + 35, CENTER_Y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#888";
  ctx.font = "10px Inter";
  ctx.fillText("Sr-90 (20 MBq)", SOURCE_X - 20, CENTER_Y - 20);

  ctx.fillStyle = "rgba(200, 230, 255, 0.3)";
  ctx.strokeStyle = "rgba(200, 230, 255, 0.6)";
  ctx.lineWidth = 1;
  const pmmaTop = CENTER_Y - PMMA_HEIGHT / 2;
  ctx.fillRect(PMMA_X, pmmaTop, PMMA_VISUAL_THICKNESS, PMMA_HEIGHT);
  ctx.strokeRect(PMMA_X, pmmaTop, PMMA_VISUAL_THICKNESS, PMMA_HEIGHT);
  ctx.fillStyle = "#aaddee";
  ctx.textAlign = "center";
  ctx.fillText("PMMA (5mm)", PMMA_X + 5, pmmaTop - 10);

  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SOURCE_X + 35, CENTER_Y + 50);
  ctx.lineTo(PMMA_X, CENTER_Y + 50);
  ctx.stroke();
  ctx.fillStyle = "#555";
  ctx.fillText("10 cm", SOURCE_X + 35 + (PMMA_X - (SOURCE_X + 35)) / 2, CENTER_Y + 65);

  const detectorX = PMMA_X + PMMA_VISUAL_THICKNESS + distanceCm * PX_PER_CM;
  const detectorTop = CENTER_Y - DETECTOR_HEIGHT / 2;
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(detectorX + DETECTOR_WIDTH / 2, FLOOR_Y);
  ctx.lineTo(detectorX + DETECTOR_WIDTH / 2, detectorTop + DETECTOR_HEIGHT);
  ctx.stroke();
  ctx.fillStyle = "#222";
  ctx.fillRect(detectorX, detectorTop, DETECTOR_WIDTH, DETECTOR_HEIGHT);
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 2;
  ctx.strokeRect(detectorX, detectorTop, DETECTOR_WIDTH, DETECTOR_HEIGHT);
  ctx.fillStyle = "#114411";
  ctx.fillRect(detectorX, detectorTop + 2, 4, DETECTOR_HEIGHT - 4);
  ctx.fillStyle = "#fff";
  ctx.fillText("Probe", detectorX + 15, detectorTop - 10);
  ctx.fillText(`${distanceCm} cm`, detectorX + 15, FLOOR_Y - 5);

  if (!showHeatmap) {
    particles.forEach((p) => {
      if (p.type === "beta") {
        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          for (let i = p.history.length - 1; i >= 0; i -= 1) ctx.lineTo(p.history[i].x, p.history[i].y);
          ctx.strokeStyle = `rgba(0, 136, 255, ${p.life / 200})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "#0088ff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      } else if (p.type === "photon") {
        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          for (let i = p.history.length - 1; i >= 0; i -= 1) ctx.lineTo(p.history[i].x, p.history[i].y);
          ctx.strokeStyle = `rgba(255, 255, 0, ${p.life / 400})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255, 255, 0, ${p.life / 100})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          for (let i = p.history.length - 1; i >= 0; i -= 1) ctx.lineTo(p.history[i].x, p.history[i].y);
          ctx.strokeStyle = `rgba(255, 255, 100, ${p.life / 500})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255, 255, 100, ${Math.min(0.8, p.life / 100)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

function tick() {
  if (sourceOpen) {
    for (let i = 0; i < 3; i += 1) spawnParticle();
  }
  if (Math.random() < 0.3) spawnBackgroundParticle();
  updateParticles();
  drawScene();
  animationId = requestAnimationFrame(tick);
}

function calculateDose() {
  let currentDose = B_CONST;
  if (sourceOpen) {
    const d = Math.max(distanceCm, 1) / 100;
    const attenuation = Math.exp(-MU_CONST * d);
    const geometricLoss = d * d;
    const sourceContribution = (K_CONST * attenuation) / geometricLoss;
    currentDose += sourceContribution;
  }
  const noise = 1 + (Math.random() * 0.04 - 0.02);
  doseRateDisplay = (currentDose * noise).toFixed(3);
  doseRateEl.textContent = doseRateDisplay;
}

const sliderHandler = (value) => {
  distanceCm = parseInt(value, 10);
  distanceLabel.textContent = `${distanceCm} cm`;
};

sliderHandler(distanceSlider.value);

viewToggle.addEventListener("change", (e) => {
  showHeatmap = e.target.checked;
  viewLabel.textContent = showHeatmap ? "Heatmap" : "Particles";
  heatmapLegend.classList.toggle("hidden", !showHeatmap);
});

sourceToggle.addEventListener("click", () => {
  sourceOpen = !sourceOpen;
  sourceToggle.textContent = sourceOpen ? "● Source OPEN" : "○ Source SHIELDED";
  sourceToggle.className = sourceOpen
    ? "flex-1 py-3 px-4 rounded-lg font-semibold transition-all bg-green-500/20 text-green-300 border border-green-500/50 hover:bg-green-500/30"
    : "flex-1 py-3 px-4 rounded-lg font-semibold transition-all bg-red-500/20 text-red-300 border border-red-500/50 hover:bg-red-500/30";
});

resetButton.addEventListener("click", () => {
  counts = 0;
  doseRateDisplay = "0.150";
  doseRateEl.textContent = doseRateDisplay;
  countsEl.textContent = counts.toString();
  particles.length = 0;
});

distanceSlider.addEventListener("input", (e) => sliderHandler(e.target.value));

// Kick off animation and dose calculations
animationId = requestAnimationFrame(tick);
const doseInterval = setInterval(calculateDose, 500);

window.addEventListener("beforeunload", () => {
  if (animationId) cancelAnimationFrame(animationId);
  clearInterval(doseInterval);
});
