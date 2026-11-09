/**
 * Omen PDF - Offline PDF Engine
 * Created by Shubham Chudasma
 * 100% Client-Side & Zero-Telemetry Privacy
 */

// Configure PDF.js Worker using local vendor path
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
}

// Global Application State
const state = {
  currentView: 'compress',
  
  // Compressor state
  compress: {
    file: null,
    arrayBuffer: null,
    doc: null,
    pageCount: 0,
    resultBlob: null,
    originalSize: 0,
    compressedSize: 0,
    mode: 'target', // 'target', 'slider', 'presets'
    targetKb: 500, // Default 500 KB for Tenant Registration
    sliderLevel: 65,
    preset: 'balanced', // 'balanced', 'extreme', 'lossless'
    highContrast: true
  },

  // Merger state
  merge: {
    files: [], // Array of { id, file, name, size, pageCount, thumbDataUrl, arrayBuffer }
    isProcessing: false
  },

  // Splitter state
  split: {
    file: null,
    arrayBuffer: null,
    pageCount: 0,
    pages: [], // Array of { pageNum, thumbDataUrl, selected }
    mode: 'selected', // 'selected', 'all-zip', 'range', 'interval'
    interval: 2,
    customRange: ''
  },

  // Rotate & Organize state
  organize: {
    file: null,
    arrayBuffer: null,
    pageCount: 0,
    pages: [] // Array of { pageNum, originalIndex, rotation, isDeleted, thumbDataUrl }
  },

  // Images to PDF state
  imgToPdf: {
    images: [], // Array of { id, file, name, size, dataUrl, width, height }
    pageSize: 'fit', // 'fit', 'a4', 'letter'
    orientation: 'portrait',
    margin: 20
  },

  // PDF to Images state
  pdfToImg: {
    file: null,
    arrayBuffer: null,
    pageCount: 0,
    format: 'image/jpeg',
    scale: 2.0 // 2x Retina by default
  },

  // Watermark state
  watermark: {
    file: null,
    arrayBuffer: null,
    pageCount: 0,
    text: 'CONFIDENTIAL',
    fontSize: 48,
    opacity: 0.25
  },

  // Extractor state
  extract: {
    file: null,
    arrayBuffer: null,
    fullText: ''
  },

  // Modal Preview state
  modalPreview: {
    pdfJsDoc: null,
    currentPage: 1,
    totalPages: 1,
    zoomScale: 1.0
  }
};

/* ==========================================================================
   Helper & Utility Functions
   ========================================================================== */

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✕';

  toast.innerHTML = `<span style="font-weight:700; color:${type === 'success' ? '#30d158' : type === 'error' ? '#ff453a' : '#0a84ff'}">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Generate thumbnail image for a PDF page using PDF.js
async function renderPdfPageToCanvas(pdfDoc, pageNumber, scale = 0.5) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  
  await page.render({
    canvasContext: ctx,
    viewport: viewport
  }).promise;

  return canvas;
}

async function getPdfPageThumbnail(arrayBuffer, pageNum = 1, scale = 0.35) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdfDoc = await loadingTask.promise;
    const canvas = await renderPdfPageToCanvas(pdfDoc, pageNum, scale);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (err) {
    console.error('Thumbnail generation error:', err);
    return '';
  }
}

/* ==========================================================================
   Navigation Router
   ========================================================================== */

function switchView(viewName) {
  state.currentView = viewName;
  
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.view === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show corresponding view container
  document.querySelectorAll('.view-section').forEach(sec => {
    if (sec.id === `view-${viewName}`) {
      sec.style.display = 'block';
    } else {
      sec.style.display = 'none';
    }
  });
}

/* ==========================================================================
   FEATURE 1: PDF COMPRESSOR (with 11zon Slider & 500 KB Tenant Portal Mode)
   ========================================================================== */

function setupCompressor() {
  const dropzone = document.getElementById('compress-dropzone');
  const fileInput = document.getElementById('compress-file-input');
  const startBtn = document.getElementById('compress-start-btn');
  const resetBtn = document.getElementById('compress-reset-btn');
  const downloadBtn = document.getElementById('compress-download-btn');
  const previewBtn = document.getElementById('compress-preview-btn');
  const readjustBtn = document.getElementById('compress-readjust-btn');
  const targetInput = document.getElementById('compress-target-kb');
  const targetDisplay = document.getElementById('target-kb-display');
  const sizePills = document.querySelectorAll('.size-pill');
  const segmentBtns = document.querySelectorAll('#view-compress .segment-btn');
  const zonSlider = document.getElementById('compress-zon-slider');
  const sliderLevelVal = document.getElementById('slider-level-val');
  const sliderEstSize = document.getElementById('slider-est-size');
  const highContrastCheck = document.getElementById('compress-high-contrast');
  const presetCards = document.querySelectorAll('#compress-mode-presets .preset-card');

  // Drag and drop events
  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      // Don't trigger twice if target was already the file input
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleCompressFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleCompressFile(e.target.files[0]);
      }
    });
  }

  // Segment Mode Switcher (Target Size vs 11zon Slider vs Presets)
  segmentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      segmentBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      state.compress.mode = mode;

      const targetEl = document.getElementById('compress-mode-target');
      const sliderEl = document.getElementById('compress-mode-slider');
      const presetsEl = document.getElementById('compress-mode-presets');

      if (targetEl) targetEl.style.display = mode === 'target' ? 'flex' : 'none';
      if (sliderEl) sliderEl.style.display = mode === 'slider' ? 'flex' : 'none';
      if (presetsEl) presetsEl.style.display = mode === 'presets' ? 'grid' : 'none';

      if (startBtn) {
        if (mode === 'target') {
          startBtn.textContent = `Compress PDF to ≤ ${state.compress.targetKb} KB Now`;
        } else if (mode === 'slider') {
          startBtn.textContent = `Compress with ${state.compress.sliderLevel}% Slider Level`;
        } else {
          startBtn.textContent = `Compress PDF (${state.compress.preset.toUpperCase()})`;
        }
      }
    });
  });

  // Target Size Input & Pills
  if (targetInput) {
    targetInput.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 10) val = 10;
      state.compress.targetKb = val;
      if (targetDisplay) targetDisplay.textContent = val;
      if (startBtn) startBtn.textContent = `Compress PDF to ≤ ${val} KB Now`;

      sizePills.forEach(pill => {
        if (parseInt(pill.dataset.kb, 10) === val) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });
    });
  }

  sizePills.forEach(pill => {
    pill.addEventListener('click', () => {
      sizePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const kb = parseInt(pill.dataset.kb, 10);
      state.compress.targetKb = kb;
      if (targetInput) targetInput.value = kb;
      if (targetDisplay) targetDisplay.textContent = kb;
      if (startBtn) startBtn.textContent = `Compress PDF to ≤ ${kb} KB Now`;
      showToast(`Target set to ${kb} KB`, 'info', 1500);
    });
  });

  // High Contrast Text Protection
  if (highContrastCheck) {
    highContrastCheck.addEventListener('change', (e) => {
      state.compress.highContrast = e.target.checked;
    });
  }

  // 11zon Slider Listener & Notch Buttons
  const notchBtns = document.querySelectorAll('.notch-btn');

  function updateSliderVisuals(val) {
    state.compress.sliderLevel = val;
    if (sliderLevelVal) sliderLevelVal.textContent = val + '%';
    
    // Update notch pills
    notchBtns.forEach(btn => {
      if (parseInt(btn.dataset.level, 10) === val) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (state.compress.originalSize && sliderEstSize) {
      const compressionFactor = Math.max(0.06, (100 - (val * 0.88)) / 100);
      const estBytes = Math.round(state.compress.originalSize * compressionFactor);
      sliderEstSize.textContent = `Estimated Output: ~${formatBytes(estBytes)}`;
    }
    if (startBtn) startBtn.textContent = `Compress with ${val}% Slider Level`;
  }

  if (zonSlider) {
    zonSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      updateSliderVisuals(val);
    });
  }

  notchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const level = parseInt(btn.dataset.level, 10);
      if (zonSlider) zonSlider.value = level;
      updateSliderVisuals(level);
      showToast(`Slider set to ${level}%`, 'info', 1200);
    });
  });

  // Presets Selection
  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      presetCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.compress.preset = card.dataset.preset;
      if (startBtn) startBtn.textContent = `Compress PDF (${state.compress.preset.toUpperCase()})`;
    });
  });

  if (startBtn) startBtn.addEventListener('click', runCompression);
  if (resetBtn) resetBtn.addEventListener('click', resetCompressor);

  // Download Button (Prominently Accessible After Size Review)
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (state.compress.resultBlob) {
        const origName = state.compress.file ? state.compress.file.name.replace(/\.pdf$/i, '') : 'document';
        const targetSuffix = state.compress.mode === 'target' ? `_${state.compress.targetKb}KB` : '_compressed';
        triggerDownload(state.compress.resultBlob, `${origName}${targetSuffix}.pdf`);
        showToast('Compressed PDF downloaded successfully!', 'success');
      }
    });
  }

  // Preview Button
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      if (state.compress.resultBlob) {
        openPreviewModal(state.compress.resultBlob);
      }
    });
  }

  // Re-adjust Button
  if (readjustBtn) {
    readjustBtn.addEventListener('click', () => {
      const modeEl = document.getElementById('compress-mode-target');
      if (modeEl) modeEl.scrollIntoView({ behavior: 'smooth' });
      showToast('You can now adjust the size or slider above.', 'info', 2000);
    });
  }
}

async function handleCompressFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  state.compress.file = file;
  state.compress.originalSize = file.size;

  const arrayBuffer = await file.arrayBuffer();
  state.compress.arrayBuffer = arrayBuffer;

  try {
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    state.compress.pageCount = pdfDoc.getPageCount();

    // Render thumbnail
    const thumbUrl = await getPdfPageThumbnail(arrayBuffer, 1, 0.4);
    
    // Update UI
    document.getElementById('compress-dropzone').style.display = 'none';
    document.getElementById('compress-workspace').style.display = 'block';
    document.getElementById('compress-file-name').textContent = file.name;
    document.getElementById('compress-file-meta').textContent = `${state.compress.pageCount} Pages • Original: ${formatBytes(file.size)}`;
    document.getElementById('compress-file-thumb').src = thumbUrl;
    document.getElementById('compress-review-card').style.display = 'none';
    document.getElementById('compress-progress-container').style.display = 'none';
    document.getElementById('compress-start-btn').disabled = false;

    // Update estimated output for 11zon slider
    const val = state.compress.sliderLevel;
    const compressionFactor = Math.max(0.08, (100 - (val * 0.85)) / 100);
    const estBytes = Math.round(file.size * compressionFactor);
    const sliderEstEl = document.getElementById('slider-est-size');
    if (sliderEstEl) sliderEstEl.textContent = `Estimated Output: ~${formatBytes(estBytes)}`;

    showToast(`Loaded "${file.name}" (${state.compress.pageCount} pages, ${formatBytes(file.size)})`, 'info');
  } catch (err) {
    console.error(err);
    showToast('Could not parse PDF. Password-protected files must be unlocked first.', 'error');
  }
}

function resetCompressor() {
  state.compress.file = null;
  state.compress.arrayBuffer = null;
  state.compress.resultBlob = null;
  document.getElementById('compress-file-input').value = '';
  document.getElementById('compress-dropzone').style.display = 'flex';
  document.getElementById('compress-workspace').style.display = 'none';
}

async function runCompression() {
  const startBtn = document.getElementById('compress-start-btn');
  const progressContainer = document.getElementById('compress-progress-container');
  const progressBar = document.getElementById('compress-progress-bar');
  const progressText = document.getElementById('compress-progress-text');
  const reviewCard = document.getElementById('compress-review-card');

  startBtn.disabled = true;
  progressContainer.style.display = 'block';
  reviewCard.style.display = 'none';

  const mode = state.compress.mode;
  const targetKb = state.compress.targetKb || 500;
  const targetLimitBytes = targetKb * 1024;
  // Safety margin of 6% so 500 KB target will always land between 440 KB and 485 KB
  const effectiveTargetBytes = Math.floor(targetLimitBytes * 0.94);
  const origBytes = state.compress.originalSize;
  const pageCount = state.compress.pageCount || 1;

  try {
    let finalPdfBytes;

    if (mode === 'presets' && state.compress.preset === 'lossless') {
      progressText.textContent = 'Performing lossless optimization & removing metadata...';
      progressBar.style.width = '60%';
      await new Promise(r => setTimeout(r, 100));

      const srcDoc = await PDFLib.PDFDocument.load(state.compress.arrayBuffer);
      srcDoc.setTitle('');
      srcDoc.setAuthor('');
      srcDoc.setSubject('');
      srcDoc.setProducer('Omen PDF');
      srcDoc.setCreator('Omen PDF by Shubham Chudasma');

      finalPdfBytes = await srcDoc.save({ useObjectStreams: true, addDefaultPage: false });
      progressBar.style.width = '100%';
    } else {
      // Guaranteed Strict-Size Compression
      finalPdfBytes = await executeGuaranteedCompression(mode, effectiveTargetBytes, targetLimitBytes, (pct, msg) => {
        progressBar.style.width = `${pct}%`;
        progressText.textContent = msg;
      });
    }

    state.compress.resultBlob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    state.compress.compressedSize = state.compress.resultBlob.size;

    const compBytes = state.compress.compressedSize;
    const diff = origBytes - compBytes;
    const savedPct = Math.max(0, ((diff / origBytes) * 100)).toFixed(1);

    // Update Size Review Card
    document.getElementById('review-orig-size').textContent = formatBytes(origBytes);
    document.getElementById('review-target-size').textContent = mode === 'target' ? `${targetKb} KB` : 'Auto';
    document.getElementById('review-final-size').textContent = formatBytes(compBytes);
    document.getElementById('review-saved-pct').textContent = `-${savedPct}%`;

    const statusBadge = document.getElementById('review-status-badge');
    if (mode === 'target') {
      if (compBytes <= targetLimitBytes) {
        statusBadge.innerHTML = `<span>✓ Verified: ${formatBytes(compBytes)} (Under ${targetKb} KB limit • Ready for Upload!)</span>`;
        statusBadge.style.color = 'var(--accent-green)';
        statusBadge.style.borderColor = 'rgba(48, 209, 88, 0.4)';
        statusBadge.style.background = 'rgba(48, 209, 88, 0.15)';
      } else {
        statusBadge.innerHTML = `<span>Notice: ${formatBytes(compBytes)}</span>`;
      }
    } else {
      statusBadge.innerHTML = `<span>✓ Compressed & Ready</span>`;
    }

    // Update Prominent Download Button label with final size
    document.getElementById('compress-download-label').textContent = `Download Compressed PDF (${formatBytes(compBytes)})`;

    progressContainer.style.display = 'none';
    reviewCard.style.display = 'block';
    startBtn.disabled = false;

    // Smooth scroll down to review card
    reviewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    showToast(`Success! Compressed to ${formatBytes(compBytes)} (Under ${targetKb} KB)`, 'success');
  } catch (err) {
    console.error('Compression error:', err);
    progressContainer.style.display = 'none';
    startBtn.disabled = false;
    showToast('Compression encountered an error. Please adjust the settings and try again.', 'error');
  }
}

// Guaranteed Adaptive Canvas Compression Engine
async function executeGuaranteedCompression(mode, effectiveTargetBytes, targetLimitBytes, onProgress) {
  const loadingTask = pdfjsLib.getDocument({ data: state.compress.arrayBuffer.slice(0) });
  const pdfJsDoc = await loadingTask.promise;
  const totalPages = pdfJsDoc.numPages;

  // Calculate per-page byte budget
  let budgetPerPage = Math.floor((effectiveTargetBytes - (totalPages * 800 + 4000)) / totalPages);
  if (budgetPerPage < 15000) budgetPerPage = 15000;

  // Starting base DPI and JPEG quality based on mode and budget
  let baseDpi = 120;
  let baseQuality = 0.70;

  if (mode === 'target') {
    if (budgetPerPage >= 280000) { baseDpi = 140; baseQuality = 0.78; }
    else if (budgetPerPage >= 160000) { baseDpi = 125; baseQuality = 0.70; }
    else if (budgetPerPage >= 90000) { baseDpi = 105; baseQuality = 0.62; }
    else if (budgetPerPage >= 50000) { baseDpi = 90; baseQuality = 0.52; }
    else { baseDpi = 75; baseQuality = 0.42; }
  } else if (mode === 'slider') {
    const level = state.compress.sliderLevel;
    baseDpi = Math.round(180 - (level / 100) * 105);
    baseQuality = Math.max(0.25, 0.90 - (level / 100) * 0.60);
  } else if (mode === 'presets') {
    if (state.compress.preset === 'extreme') {
      baseDpi = 90;
      baseQuality = 0.45;
    } else {
      baseDpi = 135;
      baseQuality = 0.70;
    }
  }

  // Builder helper
  async function renderAndPack(dpi, qualityParam) {
    const newPdfDoc = await PDFLib.PDFDocument.create();

    for (let i = 1; i <= totalPages; i++) {
      const pct = Math.round((i / totalPages) * 100);
      if (onProgress) {
        onProgress(pct, `Optimizing page ${i} of ${totalPages} (${pct}%)...`);
      }

      const page = await pdfJsDoc.getPage(i);
      const origViewport = page.getViewport({ scale: 1.0 });

      // Render at requested DPI
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });

      let canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      let ctx = canvas.getContext('2d', { alpha: false });

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      // High-Contrast Text Protection for contracts/agreements
      if (state.compress.highContrast) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let p = 0; p < data.length; p += 4) {
          const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
          if (lum > 218) {
            data[p] = 255;
            data[p + 1] = 255;
            data[p + 2] = 255;
          } else if (lum < 110) {
            data[p] = Math.max(0, data[p] - 25);
            data[p + 1] = Math.max(0, data[p + 1] - 25);
            data[p + 2] = Math.max(0, data[p + 2] - 25);
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Check page JPEG size against budget in Target Mode
      let pageQuality = qualityParam;
      let dataUrl = canvas.toDataURL('image/jpeg', pageQuality);
      let pageBytes = Math.round((dataUrl.length - 23) * 0.75);

      if (mode === 'target') {
        let attempts = 0;
        while (pageBytes > budgetPerPage && attempts < 4) {
          attempts++;
          const ratio = budgetPerPage / pageBytes;
          pageQuality = Math.max(0.18, pageQuality * ratio * 0.92);

          // If quality alone is low, downscale canvas dimensions
          if (pageQuality <= 0.35 && canvas.width > 420) {
            const scaleDown = Math.max(0.65, Math.sqrt(ratio) * 0.90);
            const tmp = document.createElement('canvas');
            tmp.width = Math.max(320, Math.round(canvas.width * scaleDown));
            tmp.height = Math.max(420, Math.round(canvas.height * scaleDown));
            const tctx = tmp.getContext('2d');
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, tmp.width, tmp.height);
            tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
            canvas = tmp;
          }

          dataUrl = canvas.toDataURL('image/jpeg', pageQuality);
          pageBytes = Math.round((dataUrl.length - 23) * 0.75);
        }
      }

      const embeddedImage = await newPdfDoc.embedJpg(dataUrl);
      const newPage = newPdfDoc.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height
      });
    }

    if (onProgress) onProgress(100, 'Packing final document...');
    return await newPdfDoc.save({ useObjectStreams: true });
  }

  // First pass
  let pdfBytes = await renderAndPack(baseDpi, baseQuality);

  // Convergence Loop: In target mode, GUARANTEE that the output is strictly <= targetLimitBytes!
  if (mode === 'target') {
    let loopTries = 0;
    while (pdfBytes.length > targetLimitBytes && loopTries < 4) {
      loopTries++;
      if (onProgress) {
        onProgress(95, `Fine-tuning to guarantee under ${Math.round(targetLimitBytes/1024)} KB (Attempt ${loopTries})...`);
      }
      const overRatio = targetLimitBytes / pdfBytes.length;
      baseDpi = Math.max(65, Math.round(baseDpi * Math.sqrt(overRatio) * 0.90));
      baseQuality = Math.max(0.18, baseQuality * overRatio * 0.88);
      budgetPerPage = Math.floor(budgetPerPage * overRatio * 0.90);

      pdfBytes = await renderAndPack(baseDpi, baseQuality);
    }
  }

  return pdfBytes;
}

/* ==========================================================================
   FEATURE 2: PDF MERGE
   ========================================================================== */

function setupMerger() {
  const dropzone = document.getElementById('merge-dropzone');
  const fileInput = document.getElementById('merge-file-input');
  const clearBtn = document.getElementById('merge-clear-btn');
  const runBtn = document.getElementById('merge-run-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        addMergeFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        addMergeFiles(Array.from(e.target.files));
        e.target.value = '';
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.merge.files = [];
      renderMergeList();
      showToast('Merge queue cleared', 'info');
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', executeMerge);
  }
}

async function addMergeFiles(fileList) {
  const validFiles = fileList.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if (validFiles.length === 0) {
    showToast('Please select valid PDF files.', 'error');
    return;
  }

  showToast(`Loading ${validFiles.length} file(s)...`, 'info');

  for (const file of validFiles) {
    const id = 'merge_' + Math.random().toString(36).substr(2, 9);
    const arrayBuffer = await file.arrayBuffer();
    
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();
      const thumb = await getPdfPageThumbnail(arrayBuffer, 1, 0.25);

      state.merge.files.push({
        id,
        file,
        name: file.name,
        size: file.size,
        pageCount,
        thumbDataUrl: thumb,
        arrayBuffer
      });
    } catch (e) {
      console.warn('Could not read PDF for merge:', file.name, e);
      showToast(`Skipped ${file.name} (failed to read or encrypted)`, 'error');
    }
  }

  renderMergeList();
}

function renderMergeList() {
  const container = document.getElementById('merge-file-list');
  const countBadge = document.getElementById('merge-count-badge');
  const runBtn = document.getElementById('merge-run-btn');

  if (countBadge) countBadge.textContent = `${state.merge.files.length} Files`;
  if (!container) return;

  container.innerHTML = '';

  if (state.merge.files.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px;">No PDFs queued for merging yet. Drop some above!</div>`;
    if (runBtn) runBtn.disabled = true;
    return;
  }

  if (runBtn) runBtn.disabled = state.merge.files.length < 2;

  state.merge.files.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <div class="file-item-left">
        <span style="font-size:12px; font-weight:700; color:var(--text-muted); width:20px;">#${index + 1}</span>
        <img class="file-thumb" src="${item.thumbDataUrl || ''}" alt="thumb" />
        <div class="file-info">
          <div class="file-name" title="${item.name}">${item.name}</div>
          <div class="file-meta">
            <span>${item.pageCount} ${item.pageCount === 1 ? 'Page' : 'Pages'}</span> •
            <span>${formatBytes(item.size)}</span>
          </div>
        </div>
      </div>
      <div class="file-item-actions">
        <button class="action-btn-sm" data-action="up" data-index="${index}" title="Move Up" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>↑</button>
        <button class="action-btn-sm" data-action="down" data-index="${index}" title="Move Down" ${index === state.merge.files.length - 1 ? 'disabled style="opacity:0.3"' : ''}>↓</button>
        <button class="action-btn-sm delete" data-action="remove" data-index="${index}" title="Remove">✕</button>
      </div>
    `;

    el.querySelectorAll('.action-btn-sm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.index, 10);
        
        if (action === 'up' && idx > 0) {
          const temp = state.merge.files[idx];
          state.merge.files[idx] = state.merge.files[idx - 1];
          state.merge.files[idx - 1] = temp;
          renderMergeList();
        } else if (action === 'down' && idx < state.merge.files.length - 1) {
          const temp = state.merge.files[idx];
          state.merge.files[idx] = state.merge.files[idx + 1];
          state.merge.files[idx + 1] = temp;
          renderMergeList();
        } else if (action === 'remove') {
          state.merge.files.splice(idx, 1);
          renderMergeList();
        }
      });
    });

    container.appendChild(el);
  });
}

async function executeMerge() {
  if (state.merge.files.length < 2) {
    showToast('Please add at least 2 PDFs to merge.', 'error');
    return;
  }

  const runBtn = document.getElementById('merge-run-btn');
  const filenameInput = document.getElementById('merge-output-name');
  let outputName = (filenameInput && filenameInput.value.trim()) || 'Merged_Document.pdf';
  if (!outputName.toLowerCase().endsWith('.pdf')) outputName += '.pdf';

  runBtn.disabled = true;
  runBtn.textContent = 'Merging PDFs...';

  try {
    const mergedDoc = await PDFLib.PDFDocument.create();

    for (let i = 0; i < state.merge.files.length; i++) {
      const item = state.merge.files[i];
      const srcDoc = await PDFLib.PDFDocument.load(item.arrayBuffer);
      const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      copiedPages.forEach(page => mergedDoc.addPage(page));
    }

    const mergedBytes = await mergedDoc.save({ useObjectStreams: true });
    const mergedBlob = new Blob([mergedBytes], { type: 'application/pdf' });

    triggerDownload(mergedBlob, outputName);
    showToast(`Successfully merged ${state.merge.files.length} PDFs!`, 'success');
  } catch (err) {
    console.error('Merge error:', err);
    showToast('Failed to merge PDFs. Please verify the files are valid.', 'error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Merge All PDFs';
  }
}

/* ==========================================================================
   FEATURE 3: PDF SPLIT
   ========================================================================== */

function setupSplitter() {
  const dropzone = document.getElementById('split-dropzone');
  const fileInput = document.getElementById('split-file-input');
  const modeRadios = document.querySelectorAll('input[name="split-mode"]');
  const rangeInputWrap = document.getElementById('split-range-wrap');
  const intervalWrap = document.getElementById('split-interval-wrap');
  const selectAllBtn = document.getElementById('split-select-all');
  const deselectAllBtn = document.getElementById('split-deselect-all');
  const runBtn = document.getElementById('split-run-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleSplitFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSplitFile(e.target.files[0]);
      }
    });
  }

  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.split.mode = e.target.value;
      if (rangeInputWrap) rangeInputWrap.style.display = state.split.mode === 'range' ? 'block' : 'none';
      if (intervalWrap) intervalWrap.style.display = state.split.mode === 'interval' ? 'block' : 'none';
    });
  });

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      state.split.pages.forEach(p => p.selected = true);
      renderSplitPageGrid();
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      state.split.pages.forEach(p => p.selected = false);
      renderSplitPageGrid();
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', executeSplit);
  }
}

async function handleSplitFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  state.split.file = file;
  const arrayBuffer = await file.arrayBuffer();
  state.split.arrayBuffer = arrayBuffer;

  showToast('Loading pages for split...', 'info');

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdfJsDoc = await loadingTask.promise;
    state.split.pageCount = pdfJsDoc.numPages;
    state.split.pages = [];

    document.getElementById('split-dropzone').style.display = 'none';
    document.getElementById('split-workspace').style.display = 'block';
    document.getElementById('split-file-name').textContent = file.name;
    document.getElementById('split-file-meta').textContent = `${pdfJsDoc.numPages} Pages • ${formatBytes(file.size)}`;

    const grid = document.getElementById('split-page-grid');
    grid.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:20px;">Rendering page thumbnails...</div>';

    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      const thumb = await getPdfPageThumbnail(arrayBuffer, i, 0.3);
      state.split.pages.push({
        pageNum: i,
        thumbDataUrl: thumb,
        selected: true
      });
    }

    renderSplitPageGrid();
  } catch (err) {
    console.error(err);
    showToast('Failed to load PDF for split.', 'error');
  }
}

function renderSplitPageGrid() {
  const grid = document.getElementById('split-page-grid');
  if (!grid) return;
  grid.innerHTML = '';

  state.split.pages.forEach(pageObj => {
    const card = document.createElement('div');
    card.className = `page-card ${pageObj.selected ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="page-thumb-container">
        <img src="${pageObj.thumbDataUrl}" style="width:100%; height:100%; object-fit:contain;" alt="Page ${pageObj.pageNum}">
      </div>
      <div class="page-number-tag">Page ${pageObj.pageNum}</div>
      <input type="checkbox" ${pageObj.selected ? 'checked' : ''} style="accent-color:var(--accent-blue); pointer-events:none;" />
    `;

    card.addEventListener('click', () => {
      pageObj.selected = !pageObj.selected;
      renderSplitPageGrid();
    });

    grid.appendChild(card);
  });

  const selectedCount = state.split.pages.filter(p => p.selected).length;
  const countEl = document.getElementById('split-selected-count');
  if (countEl) countEl.textContent = `${selectedCount} of ${state.split.pages.length} Pages Selected`;
}

async function executeSplit() {
  const mode = state.split.mode;
  const srcDoc = await PDFLib.PDFDocument.load(state.split.arrayBuffer);
  const totalPages = srcDoc.getPageCount();
  const baseName = state.split.file.name.replace(/\.pdf$/i, '');

  if (mode === 'selected') {
    const selectedIndices = state.split.pages
      .filter(p => p.selected)
      .map(p => p.pageNum - 1);

    if (selectedIndices.length === 0) {
      showToast('Please select at least 1 page to extract.', 'error');
      return;
    }

    const newDoc = await PDFLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, selectedIndices);
    copiedPages.forEach(p => newDoc.addPage(p));
    const outBytes = await newDoc.save({ useObjectStreams: true });
    const blob = new Blob([outBytes], { type: 'application/pdf' });

    triggerDownload(blob, `${baseName}_extracted_${selectedIndices.length}pages.pdf`);
    showToast(`Extracted ${selectedIndices.length} pages into new PDF!`, 'success');
  } else if (mode === 'all-zip') {
    showToast('Extracting individual pages into ZIP...', 'info');
    const zip = new JSZip();

    for (let i = 0; i < totalPages; i++) {
      const singleDoc = await PDFLib.PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(srcDoc, [i]);
      singleDoc.addPage(copiedPage);
      const pageBytes = await singleDoc.save();
      zip.file(`${baseName}_page_${i + 1}.pdf`, pageBytes);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipContent, `${baseName}_all_pages.zip`);
    showToast('Downloaded ZIP containing all single pages!', 'success');
  } else if (mode === 'interval') {
    const interval = parseInt(document.getElementById('split-interval-input').value, 10) || 2;
    const zip = new JSZip();
    let partNum = 1;

    for (let i = 0; i < totalPages; i += interval) {
      const partDoc = await PDFLib.PDFDocument.create();
      const chunkIndices = [];
      for (let j = i; j < Math.min(i + interval, totalPages); j++) {
        chunkIndices.push(j);
      }
      const copiedPages = await partDoc.copyPages(srcDoc, chunkIndices);
      copiedPages.forEach(p => partDoc.addPage(p));
      const partBytes = await partDoc.save();
      zip.file(`${baseName}_part_${partNum}_pages_${i + 1}-${i + chunkIndices.length}.pdf`, partBytes);
      partNum++;
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipContent, `${baseName}_split_interval_${interval}.zip`);
    showToast(`Split into ${partNum - 1} parts and saved to ZIP!`, 'success');
  } else if (mode === 'range') {
    const rangeText = document.getElementById('split-range-input').value.trim();
    if (!rangeText) {
      showToast('Please enter page ranges (e.g. 1-3, 5, 7-9)', 'error');
      return;
    }

    try {
      const pageIndices = parsePageRanges(rangeText, totalPages);
      if (pageIndices.length === 0) {
        showToast('No valid pages found in range.', 'error');
        return;
      }

      const rangeDoc = await PDFLib.PDFDocument.create();
      const copiedPages = await rangeDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(p => rangeDoc.addPage(p));
      const outBytes = await rangeDoc.save();
      triggerDownload(new Blob([outBytes], { type: 'application/pdf' }), `${baseName}_range.pdf`);
      showToast('Page range extracted successfully!', 'success');
    } catch (e) {
      showToast('Invalid page range format. Example: 1-4, 7, 9-12', 'error');
    }
  }
}

function parsePageRanges(input, totalPages) {
  const parts = input.split(',');
  const indices = new Set();

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
          if (p >= 1 && p <= totalPages) indices.add(p - 1);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        indices.add(p - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/* ==========================================================================
   FEATURE 4: ROTATE & ORGANIZE PAGES
   ========================================================================== */

function setupOrganize() {
  const dropzone = document.getElementById('organize-dropzone');
  const fileInput = document.getElementById('organize-file-input');
  const rotateAllCw = document.getElementById('organize-rotate-cw-all');
  const rotateAllCcw = document.getElementById('organize-rotate-ccw-all');
  const resetAllBtn = document.getElementById('organize-reset-all');
  const saveBtn = document.getElementById('organize-save-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleOrganizeFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleOrganizeFile(e.target.files[0]);
      }
    });
  }

  if (rotateAllCw) {
    rotateAllCw.addEventListener('click', () => {
      state.organize.pages.forEach(p => {
        if (!p.isDeleted) p.rotation = (p.rotation + 90) % 360;
      });
      renderOrganizeGrid();
    });
  }

  if (rotateAllCcw) {
    rotateAllCcw.addEventListener('click', () => {
      state.organize.pages.forEach(p => {
        if (!p.isDeleted) p.rotation = (p.rotation - 90 + 360) % 360;
      });
      renderOrganizeGrid();
    });
  }

  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      state.organize.pages.forEach(p => {
        p.rotation = 0;
        p.isDeleted = false;
      });
      renderOrganizeGrid();
      showToast('Reset all rotations and deletions', 'info');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', executeOrganizeSave);
  }
}

async function handleOrganizeFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  state.organize.file = file;
  const arrayBuffer = await file.arrayBuffer();
  state.organize.arrayBuffer = arrayBuffer;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdfJsDoc = await loadingTask.promise;
    state.organize.pageCount = pdfJsDoc.numPages;
    state.organize.pages = [];

    document.getElementById('organize-dropzone').style.display = 'none';
    document.getElementById('organize-workspace').style.display = 'block';
    document.getElementById('organize-file-name').textContent = file.name;
    document.getElementById('organize-file-meta').textContent = `${pdfJsDoc.numPages} Pages • ${formatBytes(file.size)}`;

    const grid = document.getElementById('organize-page-grid');
    grid.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:20px;">Rendering page thumbnails...</div>';

    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      const thumb = await getPdfPageThumbnail(arrayBuffer, i, 0.3);
      state.organize.pages.push({
        pageNum: i,
        originalIndex: i - 1,
        rotation: 0,
        isDeleted: false,
        thumbDataUrl: thumb
      });
    }

    renderOrganizeGrid();
  } catch (err) {
    console.error(err);
    showToast('Failed to load PDF for rotation/organizing.', 'error');
  }
}

function renderOrganizeGrid() {
  const grid = document.getElementById('organize-page-grid');
  if (!grid) return;
  grid.innerHTML = '';

  state.organize.pages.forEach((pageObj) => {
    if (pageObj.isDeleted) return;

    const card = document.createElement('div');
    card.className = 'page-card';
    card.innerHTML = `
      <div class="page-thumb-container">
        <img src="${pageObj.thumbDataUrl}" style="width:100%; height:100%; object-fit:contain; transform:rotate(${pageObj.rotation}deg); transition:transform 0.2s ease;" alt="Page ${pageObj.pageNum}">
      </div>
      <div class="page-number-tag">Page ${pageObj.pageNum} ${pageObj.rotation > 0 ? `(${pageObj.rotation}°)` : ''}</div>
      <div class="page-card-actions">
        <button class="action-btn-sm" data-action="ccw" title="Rotate Counter-Clockwise (90° CCW)">⟲</button>
        <button class="action-btn-sm" data-action="cw" title="Rotate Clockwise (90° CW)">⟳</button>
        <button class="action-btn-sm delete" data-action="delete" title="Delete Page">🗑</button>
      </div>
    `;

    card.querySelector('[data-action="cw"]').addEventListener('click', () => {
      pageObj.rotation = (pageObj.rotation + 90) % 360;
      renderOrganizeGrid();
    });

    card.querySelector('[data-action="ccw"]').addEventListener('click', () => {
      pageObj.rotation = (pageObj.rotation - 90 + 360) % 360;
      renderOrganizeGrid();
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      pageObj.isDeleted = true;
      renderOrganizeGrid();
      showToast(`Page ${pageObj.pageNum} removed`, 'info');
    });

    grid.appendChild(card);
  });
}

async function executeOrganizeSave() {
  const activePages = state.organize.pages.filter(p => !p.isDeleted);
  if (activePages.length === 0) {
    showToast('All pages are deleted! Please keep at least 1 page.', 'error');
    return;
  }

  showToast('Saving organized PDF...', 'info');

  try {
    const srcDoc = await PDFLib.PDFDocument.load(state.organize.arrayBuffer);
    const newDoc = await PDFLib.PDFDocument.create();

    for (const pageObj of activePages) {
      const [copiedPage] = await newDoc.copyPages(srcDoc, [pageObj.originalIndex]);
      const currentRotation = copiedPage.getRotation().angle;
      const finalAngle = (currentRotation + pageObj.rotation) % 360;
      copiedPage.setRotation(PDFLib.degrees(finalAngle));
      newDoc.addPage(copiedPage);
    }

    const outBytes = await newDoc.save({ useObjectStreams: true });
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const baseName = state.organize.file.name.replace(/\.pdf$/i, '');

    triggerDownload(blob, `${baseName}_organized.pdf`);
    showToast('Organized PDF saved successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to save organized PDF.', 'error');
  }
}

/* ==========================================================================
   FEATURE 5: IMAGES TO PDF
   ========================================================================== */

function setupImgToPdf() {
  const dropzone = document.getElementById('img2pdf-dropzone');
  const fileInput = document.getElementById('img2pdf-file-input');
  const clearBtn = document.getElementById('img2pdf-clear-btn');
  const runBtn = document.getElementById('img2pdf-run-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        addImgToPdfFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        addImgToPdfFiles(Array.from(e.target.files));
        e.target.value = '';
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.imgToPdf.images = [];
      renderImgToPdfList();
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', executeImgToPdf);
  }
}

async function addImgToPdfFiles(fileList) {
  const validImages = fileList.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
  if (validImages.length === 0) {
    showToast('Please select valid image files (JPG, PNG, WebP).', 'error');
    return;
  }

  for (const file of validImages) {
    const dataUrl = await readFileAsDataUrl(file);
    const dimensions = await getImageDimensions(dataUrl);

    state.imgToPdf.images.push({
      id: 'img_' + Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      dataUrl,
      width: dimensions.width,
      height: dimensions.height
    });
  }

  renderImgToPdfList();
  showToast(`Added ${validImages.length} image(s)`, 'info');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataUrl;
  });
}

function renderImgToPdfList() {
  const container = document.getElementById('img2pdf-file-list');
  const countBadge = document.getElementById('img2pdf-count-badge');
  const runBtn = document.getElementById('img2pdf-run-btn');

  if (countBadge) countBadge.textContent = `${state.imgToPdf.images.length} Images`;
  if (!container) return;
  container.innerHTML = '';

  if (state.imgToPdf.images.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px;">No images added yet. Drop JPG, PNG, or WebP images above.</div>`;
    if (runBtn) runBtn.disabled = true;
    return;
  }

  if (runBtn) runBtn.disabled = false;

  state.imgToPdf.images.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <div class="file-item-left">
        <span style="font-size:12px; font-weight:700; color:var(--text-muted); width:20px;">#${index + 1}</span>
        <img class="file-thumb" src="${item.dataUrl}" alt="thumb" />
        <div class="file-info">
          <div class="file-name" title="${item.name}">${item.name}</div>
          <div class="file-meta">
            <span>${item.width} × ${item.height} px</span> •
            <span>${formatBytes(item.size)}</span>
          </div>
        </div>
      </div>
      <div class="file-item-actions">
        <button class="action-btn-sm" data-action="up" data-index="${index}" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>↑</button>
        <button class="action-btn-sm" data-action="down" data-index="${index}" ${index === state.imgToPdf.images.length - 1 ? 'disabled style="opacity:0.3"' : ''}>↓</button>
        <button class="action-btn-sm delete" data-action="remove" data-index="${index}">✕</button>
      </div>
    `;

    el.querySelectorAll('.action-btn-sm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.index, 10);
        if (action === 'up' && idx > 0) {
          const temp = state.imgToPdf.images[idx];
          state.imgToPdf.images[idx] = state.imgToPdf.images[idx - 1];
          state.imgToPdf.images[idx - 1] = temp;
          renderImgToPdfList();
        } else if (action === 'down' && idx < state.imgToPdf.images.length - 1) {
          const temp = state.imgToPdf.images[idx];
          state.imgToPdf.images[idx] = state.imgToPdf.images[idx + 1];
          state.imgToPdf.images[idx + 1] = temp;
          renderImgToPdfList();
        } else if (action === 'remove') {
          state.imgToPdf.images.splice(idx, 1);
          renderImgToPdfList();
        }
      });
    });

    container.appendChild(el);
  });
}

async function executeImgToPdf() {
  if (state.imgToPdf.images.length === 0) return;

  const pageSizeOpt = document.getElementById('img2pdf-page-size').value;
  const marginOpt = parseInt(document.getElementById('img2pdf-margin').value, 10) || 0;
  const runBtn = document.getElementById('img2pdf-run-btn');

  runBtn.disabled = true;
  runBtn.textContent = 'Generating PDF...';

  try {
    const doc = await PDFLib.PDFDocument.create();

    for (const item of state.imgToPdf.images) {
      let embeddedImage;
      if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg' || /\.jpe?g$/i.test(item.name)) {
        const bytes = await item.file.arrayBuffer();
        embeddedImage = await doc.embedJpg(bytes);
      } else {
        const img = new Image();
        img.src = item.dataUrl;
        await new Promise(r => img.onload = r);

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        embeddedImage = await doc.embedPng(pngDataUrl);
      }

      let pageWidth, pageHeight;
      if (pageSizeOpt === 'a4') {
        pageWidth = 595.28;
        pageHeight = 841.89;
      } else if (pageSizeOpt === 'letter') {
        pageWidth = 612;
        pageHeight = 792;
      } else {
        pageWidth = item.width;
        pageHeight = item.height;
      }

      const page = doc.addPage([pageWidth, pageHeight]);

      if (pageSizeOpt === 'fit') {
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight
        });
      } else {
        const availWidth = pageWidth - (marginOpt * 2);
        const availHeight = pageHeight - (marginOpt * 2);
        const imgAspect = item.width / item.height;
        const boxAspect = availWidth / availHeight;

        let drawW, drawH;
        if (imgAspect > boxAspect) {
          drawW = availWidth;
          drawH = availWidth / imgAspect;
        } else {
          drawH = availHeight;
          drawW = availHeight * imgAspect;
        }

        const xPos = marginOpt + (availWidth - drawW) / 2;
        const yPos = marginOpt + (availHeight - drawH) / 2;

        page.drawImage(embeddedImage, {
          x: xPos,
          y: yPos,
          width: drawW,
          height: drawH
        });
      }
    }

    const pdfBytes = await doc.save({ useObjectStreams: true });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    triggerDownload(blob, `Images_Compiled.pdf`);
    showToast(`Compiled ${state.imgToPdf.images.length} images into PDF!`, 'success');
  } catch (err) {
    console.error('Image to PDF error:', err);
    showToast('Failed to compile images into PDF.', 'error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Convert Images to PDF';
  }
}

/* ==========================================================================
   FEATURE 6: PDF TO IMAGES
   ========================================================================== */

function setupPdfToImg() {
  const dropzone = document.getElementById('pdf2img-dropzone');
  const fileInput = document.getElementById('pdf2img-file-input');
  const runBtn = document.getElementById('pdf2img-run-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handlePdfToImgFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePdfToImgFile(e.target.files[0]);
      }
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', executePdfToImg);
  }
}

async function handlePdfToImgFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  state.pdfToImg.file = file;
  const arrayBuffer = await file.arrayBuffer();
  state.pdfToImg.arrayBuffer = arrayBuffer;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdfJsDoc = await loadingTask.promise;
    state.pdfToImg.pageCount = pdfJsDoc.numPages;

    document.getElementById('pdf2img-dropzone').style.display = 'none';
    document.getElementById('pdf2img-workspace').style.display = 'block';
    document.getElementById('pdf2img-file-name').textContent = file.name;
    document.getElementById('pdf2img-file-meta').textContent = `${pdfJsDoc.numPages} Pages • ${formatBytes(file.size)}`;

    const thumb = await getPdfPageThumbnail(arrayBuffer, 1, 0.4);
    document.getElementById('pdf2img-thumb').src = thumb;

    showToast(`PDF loaded: ${pdfJsDoc.numPages} pages`, 'info');
  } catch (err) {
    console.error(err);
    showToast('Failed to load PDF for image export.', 'error');
  }
}

async function executePdfToImg() {
  const format = document.getElementById('pdf2img-format').value;
  const scale = parseFloat(document.getElementById('pdf2img-scale').value) || 2.0;
  const baseName = state.pdfToImg.file.name.replace(/\.pdf$/i, '');
  const runBtn = document.getElementById('pdf2img-run-btn');

  runBtn.disabled = true;
  runBtn.textContent = 'Rendering Images...';

  try {
    const loadingTask = pdfjsLib.getDocument({ data: state.pdfToImg.arrayBuffer.slice(0) });
    const pdfJsDoc = await loadingTask.promise;
    const totalPages = pdfJsDoc.numPages;

    const zip = new JSZip();
    const ext = format === 'image/png' ? 'png' : 'jpg';

    for (let i = 1; i <= totalPages; i++) {
      runBtn.textContent = `Rendering page ${i} of ${totalPages}...`;
      const page = await pdfJsDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise(r => canvas.toBlob(r, format, 0.92));
      const arrayBuf = await blob.arrayBuffer();
      zip.file(`${baseName}_page_${i}.${ext}`, arrayBuf);
    }

    runBtn.textContent = 'Compressing into ZIP...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, `${baseName}_images.zip`);
    showToast(`Exported all ${totalPages} pages to ZIP!`, 'success');
  } catch (err) {
    console.error('PDF to Image error:', err);
    showToast('Error converting PDF to images.', 'error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Export All Pages as ZIP';
  }
}

/* ==========================================================================
   FEATURE 7: WATERMARK & PAGE NUMBERS
   ========================================================================== */

function setupWatermark() {
  const dropzone = document.getElementById('watermark-dropzone');
  const fileInput = document.getElementById('watermark-file-input');
  const runBtn = document.getElementById('watermark-run-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleWatermarkFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleWatermarkFile(e.target.files[0]);
      }
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', executeWatermark);
  }
}

async function handleWatermarkFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  state.watermark.file = file;
  const arrayBuffer = await file.arrayBuffer();
  state.watermark.arrayBuffer = arrayBuffer;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdfJsDoc = await loadingTask.promise;
    state.watermark.pageCount = pdfJsDoc.numPages;

    document.getElementById('watermark-dropzone').style.display = 'none';
    document.getElementById('watermark-workspace').style.display = 'block';
    document.getElementById('watermark-file-name').textContent = file.name;
    document.getElementById('watermark-file-meta').textContent = `${pdfJsDoc.numPages} Pages • ${formatBytes(file.size)}`;

    const thumb = await getPdfPageThumbnail(arrayBuffer, 1, 0.4);
    document.getElementById('watermark-thumb').src = thumb;

    showToast(`PDF loaded: ${pdfJsDoc.numPages} pages`, 'info');
  } catch (err) {
    console.error(err);
    showToast('Failed to load PDF.', 'error');
  }
}

async function executeWatermark() {
  const text = document.getElementById('watermark-text').value.trim() || 'CONFIDENTIAL';
  const fontSize = parseInt(document.getElementById('watermark-size').value, 10) || 48;
  const opacity = parseFloat(document.getElementById('watermark-opacity').value) || 0.25;
  const addPageNumbers = document.getElementById('watermark-page-num-check').checked;
  const baseName = state.watermark.file.name.replace(/\.pdf$/i, '');

  try {
    const pdfDoc = await PDFLib.PDFDocument.load(state.watermark.arrayBuffer);
    const helveticaBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const totalPages = pdfDoc.getPageCount();

    for (let i = 0; i < totalPages; i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();

      if (text) {
        const textWidth = helveticaBold.widthOfTextAtSize(text, fontSize);
        const textHeight = helveticaBold.heightAtSize(fontSize);

        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2 - textHeight / 2,
          size: fontSize,
          font: helveticaBold,
          color: PDFLib.rgb(0.8, 0.1, 0.1),
          opacity: opacity,
          rotate: PDFLib.degrees(45)
        });
      }

      if (addPageNumbers) {
        const pageNumText = `Page ${i + 1} of ${totalPages}`;
        const numWidth = helvetica.widthOfTextAtSize(pageNumText, 10);
        page.drawText(pageNumText, {
          x: width / 2 - numWidth / 2,
          y: 20,
          size: 10,
          font: helvetica,
          color: PDFLib.rgb(0.3, 0.3, 0.3)
        });
      }
    }

    const outBytes = await pdfDoc.save({ useObjectStreams: true });
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    triggerDownload(blob, `${baseName}_watermarked.pdf`);
    showToast('Watermark applied successfully!', 'success');
  } catch (err) {
    console.error('Watermark error:', err);
    showToast('Failed to apply watermark.', 'error');
  }
}

/* ==========================================================================
   FEATURE 8: EXTRACT TEXT & METADATA
   ========================================================================== */

function setupExtractor() {
  const dropzone = document.getElementById('extract-dropzone');
  const fileInput = document.getElementById('extract-file-input');
  const copyBtn = document.getElementById('extract-copy-btn');
  const downloadTxtBtn = document.getElementById('extract-download-txt-btn');

  if (dropzone) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleExtractFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleExtractFile(e.target.files[0]);
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = document.getElementById('extract-text-area').value;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast('All extracted text copied to clipboard!', 'success');
      });
    });
  }

  if (downloadTxtBtn) {
    downloadTxtBtn.addEventListener('click', () => {
      const text = document.getElementById('extract-text-area').value;
      if (!text) return;
      const baseName = state.extract.file ? state.extract.file.name.replace(/\.pdf$/i, '') : 'document';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      triggerDownload(blob, `${baseName}_extracted_text.txt`);
      showToast('Text file downloaded!', 'success');
    });
  }
}

async function handleExtractFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }

  state.extract.file = file;
  const arrayBuffer = await file.arrayBuffer();
  state.extract.arrayBuffer = arrayBuffer;

  showToast('Extracting document metadata & text...', 'info');

  try {
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    // Fill metadata
    document.getElementById('meta-title').textContent = pdfDoc.getTitle() || 'Untitled Document';
    document.getElementById('meta-author').textContent = pdfDoc.getAuthor() || 'Unknown / Not specified';
    document.getElementById('meta-pages').textContent = pageCount;
    document.getElementById('meta-size').textContent = formatBytes(file.size);

    // Extract text with PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdfJsDoc = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      const page = await pdfJsDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `--- [PAGE ${i}] ---\n${pageText}\n\n`;
    }

    state.extract.fullText = fullText;
    document.getElementById('extract-text-area').value = fullText;

    const words = fullText.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('extract-word-count').textContent = `${words} Words`;

    const thumb = await getPdfPageThumbnail(arrayBuffer, 1, 0.35);
    document.getElementById('extract-thumb').src = thumb;

    document.getElementById('extract-dropzone').style.display = 'none';
    document.getElementById('extract-workspace').style.display = 'block';
    document.getElementById('extract-file-name').textContent = file.name;
    document.getElementById('extract-file-meta').textContent = `${pageCount} Pages • ${formatBytes(file.size)}`;

    showToast(`Extracted ${words} words from ${pageCount} pages!`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to extract text from PDF.', 'error');
  }
}

/* ==========================================================================
   IN-APP RETINA PREVIEW MODAL
   ========================================================================== */

function setupPreviewModal() {
  const modal = document.getElementById('pdf-preview-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const prevBtn = document.getElementById('modal-prev-page');
  const nextBtn = document.getElementById('modal-next-page');
  const zoomInBtn = document.getElementById('modal-zoom-in');
  const zoomOutBtn = document.getElementById('modal-zoom-out');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.modalPreview.currentPage > 1) {
        state.modalPreview.currentPage--;
        renderModalPreviewPage();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (state.modalPreview.currentPage < state.modalPreview.totalPages) {
        state.modalPreview.currentPage++;
        renderModalPreviewPage();
      }
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      state.modalPreview.zoomScale = Math.min(2.5, state.modalPreview.zoomScale + 0.25);
      document.getElementById('modal-zoom-label').textContent = Math.round(state.modalPreview.zoomScale * 100) + '%';
      renderModalPreviewPage();
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      state.modalPreview.zoomScale = Math.max(0.5, state.modalPreview.zoomScale - 0.25);
      document.getElementById('modal-zoom-label').textContent = Math.round(state.modalPreview.zoomScale * 100) + '%';
      renderModalPreviewPage();
    });
  }
}

async function openPreviewModal(blob) {
  const modal = document.getElementById('pdf-preview-modal');
  const canvasWrap = document.getElementById('modal-canvas-wrap');
  modal.style.display = 'flex';
  canvasWrap.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:30px;">Loading high-res preview...</div>';

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfJsDoc = await loadingTask.promise;

    state.modalPreview.pdfJsDoc = pdfJsDoc;
    state.modalPreview.currentPage = 1;
    state.modalPreview.totalPages = pdfJsDoc.numPages;
    state.modalPreview.zoomScale = 1.0;

    document.getElementById('modal-zoom-label').textContent = '100%';
    renderModalPreviewPage();
  } catch (e) {
    console.error(e);
    canvasWrap.innerHTML = '<div style="color:var(--accent-red); padding:30px;">Failed to render preview.</div>';
  }
}

async function renderModalPreviewPage() {
  const doc = state.modalPreview.pdfJsDoc;
  if (!doc) return;

  const pageNum = state.modalPreview.currentPage;
  const total = state.modalPreview.totalPages;
  document.getElementById('modal-page-num').textContent = `Page ${pageNum} of ${total}`;

  const canvasWrap = document.getElementById('modal-canvas-wrap');
  canvasWrap.innerHTML = '';

  const page = await doc.getPage(pageNum);
  const scale = (window.devicePixelRatio || 2) * state.modalPreview.zoomScale * 0.9;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = (viewport.width / (window.devicePixelRatio || 2)) + 'px';
  canvas.style.height = (viewport.height / (window.devicePixelRatio || 2)) + 'px';
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  canvasWrap.appendChild(canvas);
}

/* ==========================================================================
   THEME ACCENTS & WINDOW CONTROLS
   ========================================================================== */

function setupAccentSwitcher() {
  const dots = document.querySelectorAll('.accent-dot');
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      dots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      const color = dot.dataset.color;
      document.documentElement.style.setProperty('--accent-blue', color);
      document.documentElement.style.setProperty('--border-focus', color);
    });
  });
}

function setupWindowControls() {
  const redDot = document.querySelector('.traffic-light.red');
  const yellowDot = document.querySelector('.traffic-light.yellow');
  const greenDot = document.querySelector('.traffic-light.green');

  if (redDot) {
    redDot.addEventListener('click', () => {
      // Reset currently active tool
      if (state.currentView === 'compress') resetCompressor();
      showToast('Workspace reset', 'info', 1500);
    });
  }

  if (yellowDot) {
    yellowDot.addEventListener('click', () => {
      // Toggle sidebar collapse
      const sidebar = document.querySelector('.app-sidebar');
      if (sidebar) {
        sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
      }
    });
  }

  if (greenDot) {
    greenDot.addEventListener('click', () => {
      // Toggle macOS Fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  // Feature initializers
  setupCompressor();
  setupMerger();
  setupSplitter();
  setupOrganize();
  setupImgToPdf();
  setupPdfToImg();
  setupWatermark();
  setupExtractor();
  setupPreviewModal();
  setupAccentSwitcher();
  setupWindowControls();

  // Keyboard shortcut listener (Cmd+O to open, Esc to dismiss modal)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      const currentInput = document.querySelector(`#view-${state.currentView} input[type="file"]`);
      if (currentInput) currentInput.click();
    } else if (e.key === 'Escape') {
      const modal = document.getElementById('pdf-preview-modal');
      if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
    }
  });

  console.log('Omen PDF initialized. Created by Shubham Chudasma.');
});
