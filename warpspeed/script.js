const ytUrlInput = document.getElementById('ytUrl');
const convertBtn = document.getElementById('convertBtn');
const statusArea = document.getElementById('statusArea');
const spinner = document.getElementById('spinner');
const statusText = document.getElementById('statusText');

// Replace this with the actual deployed worker URL later
const WORKER_URL = 'https://your-yt-worker.workers.dev/api/convert';

convertBtn.addEventListener('click', async () => {
  const url = ytUrlInput.value.trim();
  if (!url) return;

  // UI state
  convertBtn.disabled = true;
  statusArea.style.display = 'block';
  spinner.style.display = 'block';
  statusText.innerHTML = 'Sending URL to yt-dlp backend worker...';
  statusText.className = '';

  try {
    const res = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`, {
      method: 'GET'
    });

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}: ${res.statusText}`);
    }

    // Assuming the backend streams back the MP3 file directly
    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    
    spinner.style.display = 'none';
    statusText.innerHTML = `Success! <a href="${downloadUrl}" download="warpspeed_audio.mp3" style="color: #10b981; text-decoration: underline;">Click here to download your MP3 file</a>.`;
    statusText.className = 'result';
    
  } catch (err) {
    console.error(err);
    spinner.style.display = 'none';
    statusText.innerHTML = `Error: Cannot connect to backend proxy. Ensure your yt-dlp endpoint is live at <code>${WORKER_URL}</code>.`;
    statusText.className = 'error';
  } finally {
    convertBtn.disabled = false;
  }
});
