const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const stripBtn = document.getElementById('stripBtn');
const status = document.getElementById('status');
const metadataSection = document.getElementById('metadataSection');
const originalMeta = document.getElementById('originalMeta');
const cleanedMeta = document.getElementById('cleanedMeta');
const formatSelector = document.getElementById('formatSelector');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');

let selectedFile = null;
let loadedImage = null;

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

const EXIF_FIELDS = [
  { key: 'Make', label: 'Camera Make' },
  { key: 'Model', label: 'Camera Model' },
  { key: 'DateTime', label: 'Date Taken' },
  { key: 'DateTimeOriginal', label: 'Original Date' },
  { key: 'ExposureTime', label: 'Exposure' },
  { key: 'FNumber', label: 'F-Stop' },
  { key: 'ISOSpeedRatings', label: 'ISO' },
  { key: 'FocalLength', label: 'Focal Length' },
  { key: 'GPSLatitude', label: 'GPS Latitude' },
  { key: 'GPSLongitude', label: 'GPS Longitude' },
  { key: 'Software', label: 'Software' },
  { key: 'ImageDescription', label: 'Description' },
];

function formatExifValue(key, val) {
  if (val === undefined || val === null) return null;
  if (key === 'GPSLatitude' || key === 'GPSLongitude') {
    if (Array.isArray(val)) {
      return val.map(v => typeof v === 'number' ? v.toFixed(4) : v).join(', ');
    }
  }
  if (key === 'ExposureTime' && typeof val === 'number') {
    return val < 1 ? `1/${Math.round(1 / val)}s` : `${val}s`;
  }
  if (key === 'FNumber' && typeof val === 'number') {
    return `f/${val}`;
  }
  if (key === 'FocalLength' && typeof val === 'number') {
    return `${val}mm`;
  }
  return String(val);
}

function handleFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(jpe?g|png|tiff?|webp)$/i)) {
    status.innerHTML = '<span class="error">Please upload a valid image file (JPEG, PNG, TIFF, WebP).</span>';
    return;
  }

  selectedFile = file;
  status.innerHTML = `Selected: <strong style="color:#fff">${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;

  // Show image preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    imagePreview.style.display = 'block';

    // Load into an Image element for canvas later
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      readExif(file);
      formatSelector.style.display = 'block';
      stripBtn.style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function readExif(file) {
  originalMeta.innerHTML = '';
  cleanedMeta.innerHTML = '';

  try {
    EXIF.getData(file, function() {
      let foundAny = false;

      EXIF_FIELDS.forEach(({ key, label }) => {
        const val = EXIF.getTag(this, key);
        const formatted = formatExifValue(key, val);

        const origRow = document.createElement('tr');
        const cleanRow = document.createElement('tr');

        if (formatted) {
          foundAny = true;
          origRow.innerHTML = `<td>${label}</td><td style="color:#fff">${formatted}</td>`;
          cleanRow.innerHTML = `<td>${label}</td><td class="stripped">Stripped</td>`;
        } else {
          origRow.innerHTML = `<td>${label}</td><td>Not found</td>`;
          cleanRow.innerHTML = `<td>${label}</td><td>Clean</td>`;
        }

        originalMeta.appendChild(origRow);
        cleanedMeta.appendChild(cleanRow);
      });

      if (!foundAny) {
        status.innerHTML += '<br><span style="color:#f97316">No EXIF metadata detected — image may already be clean.</span>';
      }

      metadataSection.style.display = 'block';
    });
  } catch (e) {
    // exif-js can fail on some formats — still allow stripping
    metadataSection.style.display = 'none';
    status.innerHTML += '<br><span style="color:#f97316">Could not parse EXIF data — you can still strip and download.</span>';
  }
}

stripBtn.addEventListener('click', () => {
  if (!loadedImage) return;

  stripBtn.disabled = true;
  status.innerHTML = 'Stripping metadata...';

  // Use requestAnimationFrame to let the UI update
  requestAnimationFrame(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = loadedImage.naturalWidth;
      canvas.height = loadedImage.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(loadedImage, 0, 0);

      const format = document.querySelector('input[name="format"]:checked').value;
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'png' ? undefined : 0.95;
      const ext = format === 'png' ? '.png' : '.jpg';

      canvas.toBlob((blob) => {
        if (!blob) {
          status.innerHTML = '<span class="error">Failed to generate clean image.</span>';
          stripBtn.disabled = false;
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
        a.download = baseName + '_clean' + ext;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();

        const savings = selectedFile.size - blob.size;
        const pct = ((savings / selectedFile.size) * 100).toFixed(1);
        status.innerHTML = `<span style="color:#10b981">Metadata stripped! Downloaded ${(blob.size / 1024).toFixed(1)} KB (${savings > 0 ? pct + '% smaller' : 'similar size'}).</span>`;
        stripBtn.disabled = false;
      }, mimeType, quality);
    } catch (e) {
      status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
      stripBtn.disabled = false;
    }
  });
});
