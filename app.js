// ── State ──────────────────────────────────────────────────────
const S = {
  pdfBytes: null,
  pdfJsDoc: null,
  currentPage: 1,
  totalPages: 1,
  stampColor: '#1a3a6b',
  stampSize: 160,
  stampOpacity: 0.80,
  stampPos: { x: 40, y: 40 },
  stampPageNum: 1,
  penSize: 3,
  sigDrawing: false,
  sigLast: null,
  dragging: false,
  dragOff: { x: 0, y: 0 },
  pdfScale: 1,
  pdfPageW: 0,
  pdfPageH: 0,
};

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initUpload();
  initStampDrag();
  drawStampOnCanvas(document.getElementById('stamp-preview'), 240, S.stampColor);
  updateStampDragCanvas();
  // Init sig canvas after layout is computed
  requestAnimationFrame(() => initSigCanvas());
});

// ── Upload ─────────────────────────────────────────────────────
function initUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('pdf-input');

  input.addEventListener('change', e => e.target.files[0] && loadPDF(e.target.files[0]));

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') loadPDF(f);
  });
}

async function loadPDF(file) {
  // Read ONCE — mobile content URIs (Drive, WhatsApp…) can only be read once
  S.pdfBytes = new Uint8Array(await file.arrayBuffer());

  document.getElementById('file-name-label').textContent = file.name;
  document.getElementById('upload-idle').classList.add('hidden');
  document.getElementById('upload-done').classList.remove('hidden');

  // Pass a copy so pdfjs worker transfer doesn't affect our stored bytes
  S.pdfJsDoc = await pdfjsLib.getDocument({ data: S.pdfBytes.slice() }).promise;
  S.totalPages = S.pdfJsDoc.numPages;
  S.currentPage = 1;
  S.stampPageNum = 1;

  document.getElementById('section-position').classList.remove('hidden');
  updatePageLabel();
  await renderPage();
  updateStampDragCanvas();
}

// ── PDF Render ─────────────────────────────────────────────────
async function renderPage() {
  if (!S.pdfJsDoc) return;
  const page = await S.pdfJsDoc.getPage(S.currentPage);
  const viewport = page.getViewport({ scale: 1 });

  const stage = document.getElementById('pdf-stage');
  const maxW = stage.parentElement.clientWidth - 64;
  S.pdfScale = Math.min(1.5, maxW / viewport.width);

  const scaled = page.getViewport({ scale: S.pdfScale });
  const canvas = document.getElementById('pdf-canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  S.pdfPageW = viewport.width;
  S.pdfPageH = viewport.height;

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
}

function changePage(dir) {
  const np = S.currentPage + dir;
  if (np < 1 || np > S.totalPages) return;
  S.currentPage = np;
  S.stampPageNum = np;
  updatePageLabel();
  renderPage();
}

function updatePageLabel() {
  document.getElementById('page-label').textContent =
    `עמוד ${S.currentPage} מתוך ${S.totalPages}`;
}

// ── Stamp Drawing — text only, transparent background ─────────
function drawStampOnCanvas(canvas, w, color) {
  const name    = document.getElementById('lawyer-name')?.value    || 'ישראל ישראלי';
  const license = document.getElementById('license-number')?.value || '12345';
  const city    = document.getElementById('city')?.value           || 'תל אביב';
  const extra   = document.getElementById('stamp-extra')?.value    || '';

  // "עו״ד" gets its own prominent line; remaining lines are smaller
  const titleFontSize = Math.round(w * 0.16);
  const bodyFontSize  = Math.round(w * 0.12);
  const titleLineH    = titleFontSize * 2.2;   // generous spacing so nothing clips
  const bodyLineH     = bodyFontSize  * 1.7;
  const padY          = titleFontSize * 0.6;

  const bodyLines = [name, `רישיון מס׳ ${license}`, city, extra].filter(l => l.trim());
  const h = Math.round(padY + titleLineH + bodyLineH * bodyLines.length + padY);

  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.direction    = 'rtl';
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Draw "עו״ד" prominently
  ctx.font = `bold ${titleFontSize}px Arial`;
  ctx.fillText('עו״ד', w / 2, padY + titleLineH / 2);

  // Draw remaining lines smaller
  ctx.font = `bold ${bodyFontSize}px Arial`;
  bodyLines.forEach((line, i) => {
    ctx.fillText(line, w / 2, padY + titleLineH + bodyLineH * i + bodyLineH / 2);
  });
}

function liveUpdateStamp() {
  drawStampOnCanvas(document.getElementById('stamp-preview'), 240, S.stampColor);
  updateStampDragCanvas();
}

function pickColor(btn, color) {
  document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.stampColor = color;
  liveUpdateStamp();
}

function resizeStamp(val) {
  S.stampSize = parseInt(val);
  document.getElementById('stamp-size-val').textContent = val;
  updateStampDragCanvas();
}

function updateOpacity(val) {
  S.stampOpacity = parseInt(val) / 100;
  document.getElementById('stamp-opacity-val').textContent = val;
  const el = document.getElementById('stamp-drag');
  el.style.opacity = S.stampOpacity;
}

function updateStampDragCanvas() {
  const canvas = document.getElementById('stamp-drag-canvas');
  drawStampOnCanvas(canvas, S.stampSize, S.stampColor);
  // canvas height is auto-calculated by drawStampOnCanvas based on lines
  const el = document.getElementById('stamp-drag');
  el.style.width  = canvas.width  + 'px';
  el.style.height = canvas.height + 'px';
  el.style.opacity = S.stampOpacity;
}

// ── Stamp Drag ─────────────────────────────────────────────────
function initStampDrag() {
  const el = document.getElementById('stamp-drag');

  el.addEventListener('mousedown', e => {
    S.dragging = true;
    const r = el.getBoundingClientRect();
    S.dragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
    e.preventDefault();
  });

  el.addEventListener('touchstart', e => {
    S.dragging = true;
    const r = el.getBoundingClientRect();
    const t = e.touches[0];
    S.dragOff = { x: t.clientX - r.left, y: t.clientY - r.top };
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('mousemove', e => moveStamp(e.clientX, e.clientY));
  document.addEventListener('touchmove', e => {
    if (!S.dragging) return;
    e.preventDefault();
    moveStamp(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  document.addEventListener('mouseup',  () => { S.dragging = false; });
  document.addEventListener('touchend', () => { S.dragging = false; });
}

function moveStamp(cx, cy) {
  if (!S.dragging) return;
  const stage = document.getElementById('pdf-stage');
  const pdfCanvas = document.getElementById('pdf-canvas');
  const rect = stage.getBoundingClientRect();

  let x = cx - rect.left - S.dragOff.x;
  let y = cy - rect.top  - S.dragOff.y;
  const dragCanvas = document.getElementById('stamp-drag-canvas');
  x = Math.max(0, Math.min(x, pdfCanvas.width  - dragCanvas.width));
  y = Math.max(0, Math.min(y, pdfCanvas.height - dragCanvas.height));

  S.stampPos = { x, y };
  const el = document.getElementById('stamp-drag');
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}

// ── Signature Canvas ───────────────────────────────────────────
function initSigCanvas() {
  const canvas = document.getElementById('sig-canvas');
  canvas.width  = canvas.offsetWidth  || 500;
  canvas.height = canvas.offsetHeight || 200;

  canvas.addEventListener('mousedown',  e => startSig(e.offsetX, e.offsetY));
  canvas.addEventListener('mousemove',  e => { if (S.sigDrawing) drawSig(e.offsetX, e.offsetY); });
  canvas.addEventListener('mouseup',    () => stopSig());
  canvas.addEventListener('mouseleave', () => stopSig());

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    startSig((t.clientX - r.left) * canvas.width / r.width,
             (t.clientY - r.top)  * canvas.height / r.height);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!S.sigDrawing) return;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    drawSig((t.clientX - r.left) * canvas.width / r.width,
            (t.clientY - r.top)  * canvas.height / r.height);
  }, { passive: false });

  canvas.addEventListener('touchend', () => stopSig());
}

function startSig(x, y) {
  S.sigDrawing = true;
  S.sigLast = { x, y };
  document.querySelector('.sig-hint').style.opacity = '0';
}

function drawSig(x, y) {
  const canvas = document.getElementById('sig-canvas');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#111';
  ctx.lineWidth = S.penSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(S.sigLast.x, S.sigLast.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  S.sigLast = { x, y };
}

function stopSig() { S.sigDrawing = false; }

function clearSig() {
  const canvas = document.getElementById('sig-canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.querySelector('.sig-hint').style.opacity = '1';
}

function setPenSize(val) {
  S.penSize = parseInt(val);
  document.getElementById('pen-size-val').textContent = val;
}

// ── Generate PDF ───────────────────────────────────────────────
async function generatePDF() {
  if (!S.pdfBytes) {
    alert('אנא העלה קובץ PDF תחילה');
    return;
  }

  const btn = document.getElementById('gen-btn');
  const txt = document.getElementById('gen-text');
  btn.disabled = true;
  txt.textContent = '⏳ מייצר PDF חתום...';

  try {
    // Use a fresh slice of the stored bytes (pdfjs worker may have transferred the previous copy)
    const pdfDoc = await PDFLib.PDFDocument.load(S.pdfBytes.slice());
    const pages  = pdfDoc.getPages();
    const page   = pages[S.stampPageNum - 1];
    const { width: pw, height: ph } = page.getSize();

    const pdfCanvas = document.getElementById('pdf-canvas');
    const scX = pw / pdfCanvas.width;
    const scY = ph / pdfCanvas.height;

    // --- Stamp image (rectangular, transparent background) ---
    const stampTmp = document.createElement('canvas');
    drawStampOnCanvas(stampTmp, 600, S.stampColor);   // high-res for PDF quality
    const stampPng = canvasToPngBytes(stampTmp);
    const stampImg = await pdfDoc.embedPng(stampPng);

    // Scale from screen pixels to PDF points using the stamp width
    const dragCanvas = document.getElementById('stamp-drag-canvas');
    const stPdfW = dragCanvas.width  * scX;
    const stPdfH = dragCanvas.height * scY;
    const stPdfX = S.stampPos.x * scX;
    const stPdfY = ph - (S.stampPos.y + dragCanvas.height) * scY;

    page.drawImage(stampImg, {
      x: stPdfX,
      y: stPdfY,
      width:  stPdfW,
      height: stPdfH,
      opacity: S.stampOpacity,
    });

    // --- Signature overlaid on stamp area (centered, slightly behind) ---
    const sigSrc = document.getElementById('sig-canvas');
    const sigPng = canvasToPngBytes(sigSrc);
    const sigImg = await pdfDoc.embedPng(sigPng);

    // Signature spans the stamp width, positioned at stamp center
    const sigPdfW = stPdfW * 1.1;
    const sigPdfH = stPdfH * 0.7;
    const sigPdfX = stPdfX - (sigPdfW - stPdfW) / 2;
    const sigPdfY = stPdfY + stPdfH * 0.15;

    page.drawImage(sigImg, {
      x: sigPdfX,
      y: sigPdfY,
      width:  sigPdfW,
      height: sigPdfH,
      opacity: 1,
    });

    const result = await pdfDoc.save();
    triggerDownload(result, 'מסמך-חתום.pdf');

    txt.textContent = '✅ PDF הורד בהצלחה!';
    setTimeout(() => { txt.textContent = '⬇ הורד PDF חתום'; btn.disabled = false; }, 3000);

  } catch (err) {
    console.error(err);
    alert('שגיאה ביצירת PDF: ' + err.message);
    txt.textContent = '⬇ הורד PDF חתום';
    btn.disabled = false;
  }
}

function canvasToPngBytes(canvas) {
  const dataUrl = canvas.toDataURL('image/png');
  const b64 = dataUrl.split(',')[1];
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function triggerDownload(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
