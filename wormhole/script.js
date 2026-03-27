const WORKER_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'
  : 'https://wormhole-worker.REPLACE_AFTER_DEPLOY.workers.dev';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// Detect mode from URL hash
const hash = window.location.hash.slice(1);
if (hash) {
  downloadMode(hash);
} else {
  uploadMode();
}

// ========================
// UPLOAD MODE
// ========================
function uploadMode() {
  document.getElementById('uploadMode').style.display = 'block';
  document.getElementById('downloadMode').style.display = 'none';

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const linkOutput = document.getElementById('linkOutput');
  const linkText = document.getElementById('linkText');
  const copyBtn = document.getElementById('copyBtn');
  const uploadCountdown = document.getElementById('uploadCountdown');
  const uploadTimer = document.getElementById('uploadTimer');
  const status = document.getElementById('status');

  let selectedFile = null;

  // Drag and drop
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      status.innerHTML = `<span class="error">File too large. Maximum size is 25 MB (yours is ${(file.size / 1024 / 1024).toFixed(1)} MB).</span>`;
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    fileInfo.style.display = 'block';
    uploadBtn.style.display = 'block';
    linkOutput.style.display = 'none';
    uploadCountdown.style.display = 'none';
    status.innerHTML = '';
  }

  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    status.innerHTML = 'Uploading through wormhole...';

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch(`${WORKER_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const { id, expiresAt } = await res.json();

      // Build shareable URL
      const shareUrl = `${window.location.origin}/wormhole/#${id}`;
      linkText.value = shareUrl;
      linkOutput.style.display = 'block';

      // Start countdown
      startCountdown(new Date(expiresAt), uploadTimer, uploadCountdown);

      status.innerHTML = '<span style="color:#10b981">Wormhole opened! Share the link above.</span>';
    } catch (e) {
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        status.innerHTML = '<span class="error">Cannot connect to backend. Deploy the Cloudflare Worker first.</span>';
      } else {
        status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
      }
    } finally {
      uploadBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', () => {
    linkText.select();
    navigator.clipboard.writeText(linkText.value).then(() => {
      copyBtn.innerHTML = '<i class="ph ph-check"></i> Copied!';
      setTimeout(() => {
        copyBtn.innerHTML = '<i class="ph ph-copy"></i> Copy';
      }, 2000);
    });
  });
}

// ========================
// DOWNLOAD MODE
// ========================
function downloadMode(uuid) {
  document.getElementById('uploadMode').style.display = 'none';
  document.getElementById('downloadMode').style.display = 'block';

  const loadingSpinner = document.getElementById('loadingSpinner');
  const downloadContent = document.getElementById('downloadContent');
  const dlFileName = document.getElementById('dlFileName');
  const dlFileSize = document.getElementById('dlFileSize');
  const dlTimer = document.getElementById('dlTimer');
  const dlCountdown = document.getElementById('dlCountdown');
  const downloadBtn = document.getElementById('downloadBtn');
  const collapseNotice = document.getElementById('collapseNotice');
  const errorNotice = document.getElementById('errorNotice');

  loadingSpinner.style.display = 'block';

  // First, get file info
  fetch(`${WORKER_URL}/api/info/${uuid}`)
    .then(res => {
      if (res.status === 404 || res.status === 410) {
        showError('This wormhole has collapsed. The file has expired or already been downloaded.');
        return null;
      }
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      return res.json();
    })
    .then(info => {
      if (!info) return;

      loadingSpinner.style.display = 'none';
      downloadContent.style.display = 'block';

      dlFileName.textContent = info.name || 'Unknown file';
      dlFileSize.textContent = info.size ? formatSize(info.size) : '';

      if (info.expiresAt) {
        startCountdown(new Date(info.expiresAt), dlTimer, dlCountdown);
      }

      downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="ph ph-spinner"></i> Downloading...';

        try {
          const res = await fetch(`${WORKER_URL}/api/download/${uuid}`);
          if (res.status === 404 || res.status === 410) {
            showCollapsed();
            return;
          }
          if (!res.ok) throw new Error(`Download failed: ${res.status}`);

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = info.name || 'download';
          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          a.remove();

          // Show collapsed state after download
          showCollapsed();
        } catch (e) {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = '<i class="ph ph-download-simple"></i> Download File';
          errorNotice.textContent = `Download failed: ${e.message}`;
          errorNotice.style.display = 'block';
        }
      });
    })
    .catch(e => {
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        showError('Cannot connect to backend. The Cloudflare Worker may not be deployed yet.');
      } else {
        showError(`Error: ${e.message}`);
      }
    });

  function showCollapsed() {
    downloadContent.style.display = 'none';
    collapseNotice.style.display = 'flex';
    history.replaceState(null, '', window.location.pathname);
  }

  function showError(msg) {
    loadingSpinner.style.display = 'none';
    downloadContent.style.display = 'none';
    errorNotice.textContent = msg;
    errorNotice.style.display = 'block';
  }
}

// ========================
// SHARED UTILITIES
// ========================
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function startCountdown(expiresAt, timerEl, containerEl) {
  containerEl.style.display = 'block';

  function update() {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      timerEl.textContent = 'EXPIRED';
      timerEl.style.color = '#ef4444';
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  update();
  setInterval(update, 1000);
}
