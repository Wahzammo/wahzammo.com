const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewBtn = document.getElementById('previewBtn');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');
const renameOptions = document.getElementById('renameOptions');
const fileList = document.getElementById('fileList');

let loadedZip = null;
let fileEntries = []; // { path, name, dir }
let renameMap = []; // { original, renamed, dirPath }

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

async function handleFile(file) {
  if (!file.name.endsWith('.zip')) {
    status.innerHTML = '<span class="error">Please upload a .zip file.</span>';
    return;
  }

  status.innerHTML = 'Reading ZIP archive...';
  downloadBtn.style.display = 'none';
  fileList.style.display = 'none';

  try {
    const arrayBuffer = await file.arrayBuffer();
    loadedZip = await JSZip.loadAsync(arrayBuffer);

    fileEntries = [];
    loadedZip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        const lastSlash = relativePath.lastIndexOf('/');
        fileEntries.push({
          path: relativePath,
          name: lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath,
          dirPath: lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : '',
        });
      }
    });

    if (fileEntries.length === 0) {
      status.innerHTML = '<span class="error">ZIP is empty or contains only directories.</span>';
      return;
    }

    // Sort by name for consistent ordering
    fileEntries.sort((a, b) => a.path.localeCompare(b.path));

    status.innerHTML = `Loaded <strong style="color:#fff">${file.name}</strong> — ${fileEntries.length} file${fileEntries.length > 1 ? 's' : ''} found.`;
    renameOptions.style.display = 'block';
    previewBtn.style.display = 'block';
  } catch (e) {
    status.innerHTML = `<span class="error">Failed to read ZIP: ${e.message}</span>`;
  }
}

function buildRenameMap() {
  const prefix = document.getElementById('prefix').value || 'File';
  const startNum = parseInt(document.getElementById('startNum').value) || 0;
  const separator = document.getElementById('separator').value;
  const extOverride = document.getElementById('extOverride').value.trim().replace(/^\./, '');

  renameMap = fileEntries.map((entry, i) => {
    const num = startNum + i;
    const padLen = String(startNum + fileEntries.length - 1).length;
    const padded = String(num).padStart(padLen, '0');

    let ext;
    if (extOverride) {
      ext = extOverride;
    } else {
      const dotIndex = entry.name.lastIndexOf('.');
      ext = dotIndex >= 0 ? entry.name.slice(dotIndex + 1) : '';
    }

    const newName = `${prefix}${separator}${padded}${ext ? '.' + ext : ''}`;

    return {
      original: entry.path,
      renamed: entry.dirPath + newName,
      displayOriginal: entry.name,
      displayRenamed: newName,
    };
  });

  return renameMap;
}

previewBtn.addEventListener('click', () => {
  const map = buildRenameMap();

  fileList.innerHTML = '';
  map.forEach(({ displayOriginal, displayRenamed }) => {
    const div = document.createElement('div');
    div.className = 'file-entry';
    div.innerHTML = `<span class="original">${displayOriginal}</span><span class="arrow">&rarr;</span><span class="renamed">${displayRenamed}</span>`;
    fileList.appendChild(div);
  });

  fileList.style.display = 'block';
  downloadBtn.style.display = 'block';
});

downloadBtn.addEventListener('click', async () => {
  if (!loadedZip || renameMap.length === 0) return;

  downloadBtn.disabled = true;
  status.innerHTML = 'Building renamed ZIP...';

  try {
    const newZip = new JSZip();

    for (const entry of renameMap) {
      const data = await loadedZip.file(entry.original).async('uint8array');
      newZip.file(entry.renamed, data);
    }

    const blob = await newZip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wrangled.zip';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();

    status.innerHTML = `<span style="color:#10b981">Done! Downloaded wrangled.zip with ${renameMap.length} renamed files.</span>`;
  } catch (e) {
    status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
  } finally {
    downloadBtn.disabled = false;
  }
});
