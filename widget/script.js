(function () {
  const input = document.getElementById('qrInput');
  const sizeSelect = document.getElementById('sizeSelect');
  const ecSelect = document.getElementById('ecSelect');
  const preview = document.getElementById('qrPreview');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const status = document.getElementById('status');

  let currentCanvas = null;
  let debounceTimer = null;

  const EC_LEVELS = { L: 'L', M: 'M', Q: 'Q', H: 'H' };

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = 'status' + (type ? ' ' + type : '');
    if (type === 'success') {
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 2500);
    }
  }

  function generateQR() {
    const text = input.value.trim();
    if (!text) {
      preview.innerHTML = '<div class="qr-placeholder"><i class="ph ph-qr-code"></i>Your QR code will appear here</div>';
      downloadBtn.disabled = true;
      copyBtn.disabled = true;
      currentCanvas = null;
      return;
    }

    const size = parseInt(sizeSelect.value, 10);
    const ecLevel = EC_MAP[ecSelect.value];

    try {
      // Type 0 = auto-detect best version for the data
      const qr = qrcode(0, ecLevel);
      qr.addData(text);
      qr.make();

      const moduleCount = qr.getModuleCount();
      const cellSize = Math.floor(size / moduleCount);
      const actualSize = cellSize * moduleCount;
      const margin = Math.floor(cellSize * 2);
      const canvasSize = actualSize + margin * 2;

      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Draw modules
      ctx.fillStyle = '#000000';
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
          }
        }
      }

      // Display a scaled-down preview (max 280px) while keeping the full-res canvas for export
      const previewSize = Math.min(280, canvasSize);
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = previewSize;
      displayCanvas.height = previewSize;
      displayCanvas.style.imageRendering = 'pixelated';
      const dCtx = displayCanvas.getContext('2d');
      dCtx.imageSmoothingEnabled = false;
      dCtx.drawImage(canvas, 0, 0, previewSize, previewSize);

      preview.innerHTML = '';
      preview.appendChild(displayCanvas);

      currentCanvas = canvas;
      downloadBtn.disabled = false;
      copyBtn.disabled = false;
      setStatus('');
    } catch (e) {
      preview.innerHTML = '<div class="qr-placeholder"><i class="ph ph-warning-circle"></i>Text too long for this error correction level</div>';
      downloadBtn.disabled = true;
      copyBtn.disabled = true;
      currentCanvas = null;
      setStatus('Try reducing the text or lowering the error correction level.', 'error');
    }
  }

  function onInputChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateQR, 200);
  }

  input.addEventListener('input', onInputChange);
  sizeSelect.addEventListener('change', generateQR);
  ecSelect.addEventListener('change', generateQR);

  downloadBtn.addEventListener('click', function () {
    if (!currentCanvas) return;
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = currentCanvas.toDataURL('image/png');
    link.click();
    setStatus('QR code downloaded.', 'success');
  });

  copyBtn.addEventListener('click', async function () {
    if (!currentCanvas) return;
    try {
      const blob = await new Promise(function (resolve) {
        currentCanvas.toBlob(resolve, 'image/png');
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setStatus('Copied to clipboard.', 'success');
    } catch (e) {
      setStatus('Copy failed — try downloading instead.', 'error');
    }
  });
})();
