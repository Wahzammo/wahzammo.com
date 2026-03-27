// ─── Audio Context & Nodes ───────────────────────────────────────────────────

let audioCtx = null;
let analyser = null;
let oscillator = null;
let gainNode = null;
let fileSource = null;
let audioBuffer = null;
let isPlaying = false;
let isFilePlaying = false;

const FFT_SIZE = 2048;
const ORANGE = '#f97316';

// ─── DOM ─────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const freqSlider = document.getElementById('freqSlider');
const freqDisplay = document.getElementById('freqDisplay');
const volumeSlider = document.getElementById('volumeSlider');
const toneBtn = document.getElementById('toneBtn');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const fileName = document.getElementById('fileName');
const playFileBtn = document.getElementById('playFileBtn');
const stopFileBtn = document.getElementById('stopFileBtn');

let vizMode = 'bars';
let waveType = 'sine';

// ─── Init Audio Context (on first user gesture) ─────────────────────────────

function ensureAudioCtx() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.8;
  gainNode = audioCtx.createGain();
  gainNode.gain.value = volumeSlider.value / 100;
  gainNode.connect(analyser);
  analyser.connect(audioCtx.destination);
}

// ─── Canvas Resize ───────────────────────────────────────────────────────────

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─── Visualization ──────────────────────────────────────────────────────────

function draw() {
  requestAnimationFrame(draw);

  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;

  ctx.clearRect(0, 0, w, h);

  if (!analyser) {
    drawIdle(w, h);
    return;
  }

  if (vizMode === 'bars') drawBars(w, h);
  else if (vizMode === 'wave') drawWaveform(w, h);
  else if (vizMode === 'circle') drawRadial(w, h);
}

function drawIdle(w, h) {
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const y = h / 2 + Math.sin(x * 0.02 + Date.now() * 0.002) * 20;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawBars(w, h) {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const barCount = 64;
  const barWidth = (w / barCount) * 0.8;
  const gap = (w / barCount) * 0.2;

  for (let i = 0; i < barCount; i++) {
    // Sample from the lower frequency range (more visually interesting)
    const index = Math.floor((i / barCount) * bufferLength * 0.6);
    const value = dataArray[index] / 255;
    const barHeight = value * h * 0.85;

    const x = i * (barWidth + gap);
    const hue = 20 + value * 15; // orange range
    const alpha = 0.4 + value * 0.6;

    // Glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = `hsla(${hue}, 95%, 55%, ${alpha * 0.5})`;

    // Bar
    ctx.fillStyle = `hsla(${hue}, 95%, 55%, ${alpha})`;
    const radius = Math.min(barWidth / 2, 4);
    roundedRect(ctx, x, h - barHeight, barWidth, barHeight, radius);
    ctx.fill();

    // Reflection
    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsla(${hue}, 95%, 55%, ${alpha * 0.1})`;
    roundedRect(ctx, x, h, barWidth, barHeight * 0.3, radius);
    ctx.fill();
  }
}

function drawWaveform(w, h) {
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  // Glow effect
  ctx.shadowBlur = 6;
  ctx.shadowColor = ORANGE;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ORANGE;
  ctx.beginPath();

  const sliceWidth = w / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * h) / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sliceWidth;
  }

  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // Faded fill below
  ctx.shadowBlur = 0;
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(249, 115, 22, 0.08)');
  gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = gradient;
  ctx.fill();
}

function drawRadial(w, h) {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(w, h) * 0.15;
  const maxRadius = Math.min(w, h) * 0.42;
  const bars = 120;

  for (let i = 0; i < bars; i++) {
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const index = Math.floor((i / bars) * bufferLength * 0.5);
    const value = dataArray[index] / 255;

    const r1 = baseRadius;
    const r2 = baseRadius + value * (maxRadius - baseRadius);

    const x1 = cx + Math.cos(angle) * r1;
    const y1 = cy + Math.sin(angle) * r1;
    const x2 = cx + Math.cos(angle) * r2;
    const y2 = cy + Math.sin(angle) * r2;

    const hue = 20 + value * 15;
    const alpha = 0.3 + value * 0.7;

    ctx.strokeStyle = `hsla(${hue}, 95%, 55%, ${alpha})`;
    ctx.lineWidth = Math.max(1.5, (2 * Math.PI * r2) / bars * 0.6);
    ctx.shadowBlur = value * 8;
    ctx.shadowColor = `hsla(${hue}, 95%, 55%, 0.4)`;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Center circle
  ctx.shadowBlur = 15;
  ctx.shadowColor = ORANGE;
  ctx.strokeStyle = `rgba(249, 115, 22, 0.3)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function roundedRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Tone Generator ─────────────────────────────────────────────────────────

freqSlider.addEventListener('input', () => {
  const freq = parseInt(freqSlider.value);
  freqDisplay.innerHTML = `${freq} <span class="freq-unit">Hz</span>`;
  if (oscillator) {
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
  }
});

volumeSlider.addEventListener('input', () => {
  if (gainNode) {
    gainNode.gain.setValueAtTime(volumeSlider.value / 100, audioCtx.currentTime);
  }
});

toneBtn.addEventListener('click', () => {
  ensureAudioCtx();

  if (isPlaying) {
    stopTone();
  } else {
    startTone();
  }
});

function startTone() {
  // Stop file playback if active
  if (isFilePlaying) stopFile();

  oscillator = audioCtx.createOscillator();
  oscillator.type = waveType;
  oscillator.frequency.setValueAtTime(parseInt(freqSlider.value), audioCtx.currentTime);
  oscillator.connect(gainNode);
  oscillator.start();

  isPlaying = true;
  toneBtn.className = 'play-btn on';
  toneBtn.innerHTML = '<i class="ph ph-stop"></i> Stop Tone';
}

function stopTone() {
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
  }
  isPlaying = false;
  toneBtn.className = 'play-btn off';
  toneBtn.innerHTML = '<i class="ph ph-play"></i> Play Tone';
}

// Wave type buttons
document.querySelectorAll('.wave-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    waveType = btn.dataset.wave;
    if (oscillator) {
      oscillator.type = waveType;
    }
  });
});

// ─── Audio File Playback ────────────────────────────────────────────────────

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) loadAudioFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadAudioFile(fileInput.files[0]);
});

async function loadAudioFile(file) {
  ensureAudioCtx();

  fileName.textContent = file.name;
  fileName.style.display = 'block';

  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  playFileBtn.disabled = false;
  stopFileBtn.disabled = false;
}

playFileBtn.addEventListener('click', () => {
  if (!audioBuffer) return;
  // Stop tone if playing
  if (isPlaying) stopTone();
  // Stop previous file playback
  if (isFilePlaying) stopFile();

  playFile();
});

stopFileBtn.addEventListener('click', () => {
  stopFile();
});

function playFile() {
  fileSource = audioCtx.createBufferSource();
  fileSource.buffer = audioBuffer;
  fileSource.connect(gainNode);
  fileSource.start();
  isFilePlaying = true;

  fileSource.onended = () => {
    isFilePlaying = false;
    playFileBtn.innerHTML = '<i class="ph ph-play"></i> Play';
  };

  playFileBtn.innerHTML = '<i class="ph ph-pause"></i> Playing...';
}

function stopFile() {
  if (fileSource) {
    fileSource.stop();
    fileSource.disconnect();
    fileSource = null;
  }
  isFilePlaying = false;
  playFileBtn.innerHTML = '<i class="ph ph-play"></i> Play';
}

// ─── Viz Mode Selector ──────────────────────────────────────────────────────

document.querySelectorAll('.viz-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    vizMode = btn.dataset.mode;
  });
});

// ─── Start Render Loop ──────────────────────────────────────────────────────

draw();
