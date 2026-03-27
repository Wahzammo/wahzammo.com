const WORKER_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8787'
  : 'https://whisper-worker.REPLACE_AFTER_DEPLOY.workers.dev';

// Utility: ArrayBuffer <-> Base64URL
function bufToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuf(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Detect mode from URL hash
const hash = window.location.hash.slice(1);
if (hash && hash.includes(':')) {
  readMode(hash);
} else {
  createMode();
}

// ========================
// CREATE MODE
// ========================
function createMode() {
  document.getElementById('createMode').style.display = 'block';
  document.getElementById('readMode').style.display = 'none';

  const messageText = document.getElementById('messageText');
  const charCount = document.getElementById('charCount');
  const createBtn = document.getElementById('createBtn');
  const linkOutput = document.getElementById('linkOutput');
  const linkText = document.getElementById('linkText');
  const copyBtn = document.getElementById('copyBtn');
  const status = document.getElementById('status');

  messageText.addEventListener('input', () => {
    charCount.textContent = messageText.value.length;
  });

  createBtn.addEventListener('click', async () => {
    const plaintext = messageText.value.trim();
    if (!plaintext) {
      status.innerHTML = '<span class="error">Please type a message first.</span>';
      return;
    }

    createBtn.disabled = true;
    status.innerHTML = 'Encrypting...';

    try {
      // Generate AES-256-GCM key
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      // Generate random IV (12 bytes for GCM)
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt
      const encoded = new TextEncoder().encode(plaintext);
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
      );

      // Export key as raw bytes
      const keyBytes = await crypto.subtle.exportKey('raw', key);

      // Combine IV + ciphertext for storage
      const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
      combined.set(iv);
      combined.set(new Uint8Array(ciphertext), iv.length);

      const payload = bufToBase64url(combined.buffer);

      status.innerHTML = 'Storing encrypted message...';

      // POST to worker
      const res = await fetch(`${WORKER_URL}/api/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const { id } = await res.json();

      // Build shareable URL: key goes in fragment (never sent to server)
      const keyB64 = bufToBase64url(keyBytes);
      const shareUrl = `${window.location.origin}/whisper/#${id}:${keyB64}`;

      linkText.value = shareUrl;
      linkOutput.style.display = 'block';
      messageText.value = '';
      charCount.textContent = '0';
      status.innerHTML = '<span style="color:#10b981">Whisper created! Share the link above.</span>';
    } catch (e) {
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        status.innerHTML = '<span class="error">Cannot connect to backend. Deploy the Cloudflare Worker first.</span>';
      } else {
        status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
      }
    } finally {
      createBtn.disabled = false;
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
// READ MODE
// ========================
async function readMode(hash) {
  document.getElementById('createMode').style.display = 'none';
  document.getElementById('readMode').style.display = 'block';

  const loadingSpinner = document.getElementById('loadingSpinner');
  const messageDisplay = document.getElementById('messageDisplay');
  const destructNotice = document.getElementById('destructNotice');
  const errorNotice = document.getElementById('errorNotice');

  loadingSpinner.style.display = 'block';
  messageDisplay.style.display = 'none';

  const colonIndex = hash.indexOf(':');
  if (colonIndex === -1) {
    showError('Invalid whisper link.');
    return;
  }

  const uuid = hash.slice(0, colonIndex);
  const keyB64 = hash.slice(colonIndex + 1);

  try {
    // Fetch encrypted blob (worker deletes it after this read)
    const res = await fetch(`${WORKER_URL}/api/read/${uuid}`);

    if (res.status === 404) {
      showError('This whisper has already been read or has expired.');
      return;
    }
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const { data } = await res.json();

    // Decode combined IV + ciphertext
    const combined = new Uint8Array(base64urlToBuf(data));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Import key
    const keyBytes = base64urlToBuf(keyB64);
    const key = await crypto.subtle.importKey(
      'raw', keyBytes, 'AES-GCM', false, ['decrypt']
    );

    // Decrypt
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const plaintext = new TextDecoder().decode(plainBuf);

    // Display
    loadingSpinner.style.display = 'none';
    messageDisplay.textContent = plaintext;
    messageDisplay.style.display = 'block';
    destructNotice.style.display = 'flex';

    // Clear the hash so refreshing won't re-attempt
    history.replaceState(null, '', window.location.pathname);

  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      showError('Cannot connect to backend. The Cloudflare Worker may not be deployed yet.');
    } else if (e.name === 'OperationError') {
      showError('Decryption failed. The link may be corrupted.');
    } else {
      showError(`Error: ${e.message}`);
    }
  }

  function showError(msg) {
    loadingSpinner.style.display = 'none';
    messageDisplay.style.display = 'none';
    errorNotice.textContent = msg;
    errorNotice.style.display = 'block';
  }
}
