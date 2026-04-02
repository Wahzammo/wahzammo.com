// Ensure PDF.js worker is correctly pointed
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Tabs Logic
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
  });
});

// Setup drag and drop generic helper
function setupUploader(dropAreaId, inputId, ext, fileCallback) {
  const dropzone = document.getElementById(dropAreaId);
  const input = document.getElementById(inputId);
  
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) fileCallback(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', (e) => {
    if (e.target.files.length) fileCallback(e.target.files[0]);
  });
}

// ============================
// PDF to DOCX Logic
// ============================
let selectedPdf = null;
setupUploader('dropPdf', 'pdfInput', '.pdf', (file) => {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      document.getElementById('pdfStatus').innerHTML = '<span class="error">Not a valid PDF file.</span>'; return;
  }
  selectedPdf = file;
  document.getElementById('pdfStatus').innerHTML = `Selected: <strong style="color:#fff">${file.name}</strong>`;
  document.getElementById('convertPdfBtn').style.display = 'block';
});

document.getElementById('convertPdfBtn').addEventListener('click', async () => {
   if (!selectedPdf) return;
   const btn = document.getElementById('convertPdfBtn');
   const status = document.getElementById('pdfStatus');
   btn.disabled = true;
   status.innerHTML = 'Extracting text from PDF (this might take a moment)...';
   
   try {
       const arrayBuffer = await selectedPdf.arrayBuffer();
       const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
       
       const pages = [];
       for (let i = 1; i <= pdf.numPages; i++) {
           const page = await pdf.getPage(i);
           const content = await page.getTextContent();
           const pageText = content.items.map(item => item.str).join(' ');
           pages.push(pageText);
       }
       
       status.innerHTML = 'Structuring DOCX file...';
       
       // Use docx library
       const { Document, Packer, Paragraph, TextRun } = docx;
       
       const docChildren = [];
       pages.forEach((pageText, i) => {
           docChildren.push(new Paragraph({
               children: [new TextRun(pageText)]
           }));
           if (i < pages.length - 1) {
               // Append a page break but docx.js handles paragraph flow naturally
               docChildren.push(new Paragraph(" "));
           }
       });
       
       const doc = new Document({
            sections: [{ properties: {}, children: docChildren }]
       });
       
       const blob = await Packer.toBlob(doc);
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = selectedPdf.name.replace('.pdf', '') + '.docx';
       document.body.appendChild(a);
       a.click();
       URL.revokeObjectURL(url);
       a.remove();
       
       status.innerHTML = '<span style="color:#10b981">Conversion successful! File downloaded. Note: Complex formatting may be lost.</span>';
   } catch (e) {
       status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
   } finally {
       btn.disabled = false;
   }
});

// ============================
// DOCX to PDF Logic
// ============================
let selectedDocx = null;
setupUploader('dropDocx', 'docxInput', '.docx', (file) => {
  if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
      document.getElementById('docxStatus').innerHTML = '<span class="error">Not a valid DOCX file.</span>'; return;
  }
  selectedDocx = file;
  document.getElementById('docxStatus').innerHTML = `Selected: <strong style="color:#fff">${file.name}</strong>`;
  document.getElementById('convertDocxBtn').style.display = 'block';
});

document.getElementById('convertDocxBtn').addEventListener('click', async () => {
    if (!selectedDocx) return;
    const btn = document.getElementById('convertDocxBtn');
    const status = document.getElementById('docxStatus');
    const renderArea = document.getElementById('hidden-render-area');
    
    btn.disabled = true;
    status.innerHTML = 'Parsing DOCX structure...';
    
    try {
        const arrayBuffer = await selectedDocx.arrayBuffer();
        
        // Convert docx to HTML using mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const html = result.value;
        
        status.innerHTML = 'Generating PDF from parsed document...';
        
        renderArea.innerHTML = html;
        renderArea.style.display = 'block';
        
        // Use html2pdf
        const opt = {
            margin: 1,
            filename: selectedDocx.name.replace('.docx', '') + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        await html2pdf().set(opt).from(renderArea).save();
        
        // Cleanup UI
        renderArea.style.display = 'none';
        renderArea.innerHTML = '';
        
        status.innerHTML = '<span style="color:#10b981">Conversion successful! PDF downloaded.</span>';
    } catch (e) {
        renderArea.style.display = 'none';
        renderArea.innerHTML = '';
        console.error(e);
        status.innerHTML = `<span class="error">Error: ${e.message}</span>`;
    } finally {
        btn.disabled = false;
    }
});
