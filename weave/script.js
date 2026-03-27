// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
  });
});

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const parseBtn = document.getElementById('parseBtn');
const searchInput = document.getElementById('searchInput');
const exportBtn = document.getElementById('exportBtn');
const tableControls = document.getElementById('tableControls');
const tableWrapper = document.getElementById('tableWrapper');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const rowCount = document.getElementById('rowCount');
const status = document.getElementById('status');

let headers = [];
let allData = [];
let filteredData = [];
let sortCol = -1;
let sortDir = 'asc';

// Drag and drop for CSV upload
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
  const reader = new FileReader();
  reader.onload = (e) => parseCSV(e.target.result);
  reader.readAsText(file);
  status.innerHTML = `Loading <strong style="color:#fff">${file.name}</strong>...`;
}

parseBtn.addEventListener('click', () => {
  const text = document.getElementById('csvText').value.trim();
  if (!text) {
    status.innerHTML = '<span class="error">Please paste some CSV data first.</span>';
    return;
  }
  parseCSV(text);
});

function parseCSV(text) {
  try {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      status.innerHTML = `<span class="error">Parse error: ${result.errors[0].message}</span>`;
      return;
    }

    headers = result.meta.fields || [];
    allData = result.data;
    filteredData = allData;
    sortCol = -1;
    sortDir = 'asc';
    searchInput.value = '';

    if (headers.length === 0 || allData.length === 0) {
      status.innerHTML = '<span class="error">No data found. Check your CSV format.</span>';
      return;
    }

    renderTable();
    tableControls.classList.add('visible');
    tableWrapper.classList.add('visible');
    updateRowCount();

    status.innerHTML = `<span style="color:#10b981">Parsed ${allData.length} rows and ${headers.length} columns.</span>`;
  } catch (e) {
    status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
  }
}

function renderTable() {
  // Header
  tableHead.innerHTML = '';
  const headRow = document.createElement('tr');
  headers.forEach((h, i) => {
    const th = document.createElement('th');
    const arrow = sortCol === i ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ' \u25B2';
    th.innerHTML = `${escapeHtml(h)}<span class="sort-arrow">${arrow}</span>`;
    if (sortCol === i) th.classList.add('sorted');
    th.addEventListener('click', () => handleSort(i));
    headRow.appendChild(th);
  });
  tableHead.appendChild(headRow);

  // Body
  renderBody();
}

function renderBody() {
  tableBody.innerHTML = '';
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      const val = row[h];
      td.textContent = val !== null && val !== undefined ? String(val) : '';
      td.title = td.textContent;
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
  updateRowCount();
}

function handleSort(colIndex) {
  if (sortCol === colIndex) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortCol = colIndex;
    sortDir = 'asc';
  }

  const key = headers[colIndex];
  filteredData.sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va === null || va === undefined) va = '';
    if (vb === null || vb === undefined) vb = '';

    // Try numeric comparison
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) {
      return sortDir === 'asc' ? na - nb : nb - na;
    }

    // String comparison
    const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
    const cmp = sa.localeCompare(sb);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  renderTable();
}

// Search
searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase().trim();
  if (!query) {
    filteredData = [...allData];
  } else {
    filteredData = allData.filter(row =>
      headers.some(h => {
        const val = row[h];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(query);
      })
    );
  }

  // Re-apply current sort
  if (sortCol >= 0) {
    const key = headers[sortCol];
    filteredData.sort((a, b) => {
      let va = a[key], vb = b[key];
      if (va === null || va === undefined) va = '';
      if (vb === null || vb === undefined) vb = '';
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) {
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
      const cmp = sa.localeCompare(sb);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  renderBody();
});

function updateRowCount() {
  const total = allData.length;
  const shown = filteredData.length;
  rowCount.textContent = shown === total ? `${total} rows` : `${shown} of ${total} rows`;
}

// PDF Export
exportBtn.addEventListener('click', () => {
  exportBtn.disabled = true;
  status.innerHTML = 'Generating PDF...';

  const opt = {
    margin: 0.5,
    filename: 'weave-table.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, backgroundColor: '#0b0f19' },
    jsPDF: { unit: 'in', format: 'letter', orientation: filteredData.length > 0 && headers.length > 5 ? 'landscape' : 'portrait' },
  };

  html2pdf().set(opt).from(tableWrapper).save().then(() => {
    status.innerHTML = '<span style="color:#10b981">PDF exported successfully!</span>';
    exportBtn.disabled = false;
  }).catch(e => {
    status.innerHTML = `<span class="error">PDF export failed: ${e.message}</span>`;
    exportBtn.disabled = false;
  });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
