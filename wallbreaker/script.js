const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const statusEl = document.getElementById('status');
let pyodide = null;
let selectedFile = null;

async function initPyodide() {
  try {
    pyodide = await loadPyodide();
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    statusEl.innerHTML = "Installing openpyxl backend...";
    await micropip.install("openpyxl");
    statusEl.innerHTML = "Ready. Select an Excel file to crush.";
    statusEl.style.color = "#10b981";
  } catch (err) {
    statusEl.innerHTML = "Error initializing engine: " + err.message;
    statusEl.style.color = "#ef4444";
  }
}

initPyodide();

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  if (!file.name.endsWith('.xlsx')) {
    statusEl.innerHTML = "Please provide an .xlsx file.";
    statusEl.style.color = "#ef4444";
    return;
  }
  selectedFile = file;
  statusEl.innerHTML = `Selected: <strong>${file.name}</strong>`;
  statusEl.style.color = "var(--text-main)";
  processBtn.style.display = 'block';
}

processBtn.addEventListener('click', async () => {
  if (!pyodide || !selectedFile) return;
  
  processBtn.disabled = true;
  processBtn.innerHTML = "Unlocking...";
  statusEl.innerHTML = "Running Python script in browser...";
  statusEl.style.color = "var(--text-main)";
  
  try {
    // Read file as Uint8Array
    const arrayBuffer = await selectedFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Inject file into Pyodide virtual file system
    pyodide.FS.writeFile('/input.xlsx', uint8Array);
    
    // Execute python script
    const pythonCode = `
import openpyxl

# Load workbook
wb = openpyxl.load_workbook('/input.xlsx')

# Unprotect workbook
if wb.security:
    wb.security.workbookPassword = ''
    wb.security.lockStructure = False

# Unprotect sheets
for sheet in wb.worksheets:
    sheet.protection.disable()

# Save
wb.save('/output.xlsx')
    `;
    
    await pyodide.runPythonAsync(pythonCode);
    
    // Extract resulting file
    const outputData = pyodide.FS.readFile('/output.xlsx');
    
    // Download Blob
    const blob = new Blob([outputData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unlocked_' + selectedFile.name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    
    statusEl.innerHTML = "Success! Your file has been unlocked and downloaded.";
    statusEl.style.color = "#10b981";
  } catch(err) {
    console.error(err);
    statusEl.innerHTML = "Error processing file: " + err.message;
    statusEl.style.color = "#ef4444";
  } finally {
    processBtn.disabled = false;
    processBtn.innerHTML = "Unlock Workbook";
  }
});
