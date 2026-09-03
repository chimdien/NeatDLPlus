(() => {
  'use strict';

  // ===== DOM References =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    tabs: $$('.tab'),
    panels: {
      websites: $('#panel-websites'),
      filetypes: $('#panel-filetypes'),
      sizelimits: $('#panel-sizelimits'),
      backup: $('#panel-backup'),
    },
    websites: {
      input: $('#website-input'),
      btnAdd: $('#btn-add-website'),
      list: $('#website-list'),
      empty: $('#website-empty'),
      validation: $('#website-validation'),
    },
    filetypes: {
      input: $('#filetype-input'),
      btnAdd: $('#btn-add-filetype'),
      list: $('#filetype-list'),
      empty: $('#filetype-empty'),
      validation: $('#filetype-validation'),
    },
    sizeLimits: {
      toggleMin: $('#toggle-min-size'),
      valMin: $('#min-size-val'),
      unitPillsMin: $('#min-unit-pills'),
      controlsMin: $('#min-size-controls'),

      toggleMax: $('#toggle-max-size'),
      valMax: $('#max-size-val'),
      unitPillsMax: $('#max-unit-pills'),
      controlsMax: $('#max-size-controls'),

      statusText: $('#size-status-text'),
      statusIndicator: $('.status-indicator'),
      btnSave: $('#btn-save-sizes'),
      feedback: $('#size-save-feedback'),
    },
    backup: {
      btnExport: $('#btn-export-json'),
      btnImport: $('#btn-import-json'),
      fileInput: $('#file-import-json'),
      notification: $('#backup-notification'),
      statSites: $('#stat-sites-num'),
      statFiles: $('#stat-files-num'),
      statSize: $('#stat-size-num'),
    },
  };

  // ===== State =====
  let excludedWebsites = [];
  let excludedFileTypes = [];
  let sizeLimits = {
    minEnabled: false,
    minValue: 5,
    minUnit: 'MB',
    maxEnabled: false,
    maxValue: 500,
    maxUnit: 'MB',
  };

  // ===== Tab Switching =====
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      els.tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      Object.values(els.panels).forEach((p) => p.classList.remove('active'));
      if (els.panels[target]) {
        els.panels[target].classList.add('active');
      }

      if (target === 'backup') {
        updateSummaryStats();
      }
    });
  });

  // ===== Helpers =====
  function extractHostname(input) {
    let value = input.trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        return url.hostname.toLowerCase();
      } catch {
        // Fall through to manual extraction
      }
    }

    value = value.replace(/^[a-z]+:\/\//i, '');
    value = value.split(/[/?#]/)[0];
    value = value.split(':')[0];
    return value.toLowerCase();
  }

  function normalizeFileType(input) {
    let value = input.trim().toLowerCase();
    if (!value) return '';

    value = value.replace(/^\*\./, '').replace(/^\./, '');
    value = value.replace(/[*]/g, '');
    if (!value) return '';

    return `*.${value}`;
  }

  function showValidation(el, msg) {
    el.textContent = msg;
    setTimeout(() => {
      el.textContent = '';
    }, 3000);
  }

  function setInputInvalid(input) {
    input.classList.add('invalid');
    input.addEventListener(
      'input',
      () => input.classList.remove('invalid'),
      { once: true }
    );
  }

  // ===== Rendering Lists =====
  function renderList(items, listEl, emptyEl, onDelete) {
    listEl.innerHTML = '';

    if (items.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    items.forEach((item, index) => {
      const li = document.createElement('li');

      const span = document.createElement('span');
      span.className = 'item-text';
      span.textContent = item;

      const btn = document.createElement('button');
      btn.className = 'btn-delete';
      btn.setAttribute('aria-label', `Remove ${item}`);
      btn.title = `Remove ${item}`;
      btn.textContent = '✕';
      btn.addEventListener('click', () => {
        li.classList.add('removing');
        li.addEventListener('transitionend', () => {
          onDelete(index);
        }, { once: true });
        setTimeout(() => onDelete(index), 250);
      });

      li.appendChild(span);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function renderWebsites() {
    renderList(
      excludedWebsites,
      els.websites.list,
      els.websites.empty,
      deleteWebsite
    );
    updateSummaryStats();
  }

  function renderFileTypes() {
    renderList(
      excludedFileTypes,
      els.filetypes.list,
      els.filetypes.empty,
      deleteFileType
    );
    updateSummaryStats();
  }

  // ===== Storage Operations =====
  function saveWebsites() {
    chrome.storage.sync.set({ excludedWebsites });
  }

  function saveFileTypes() {
    chrome.storage.sync.set({ excludedFileTypes });
  }

  function saveSizeLimitsStorage(callback) {
    chrome.storage.sync.set({ sizeLimits }, () => {
      if (callback) callback();
      updateSummaryStats();
    });
  }

  function loadAll() {
    chrome.storage.sync.get(['excludedWebsites', 'excludedFileTypes', 'sizeLimits'], (result) => {
      excludedWebsites = result.excludedWebsites || [];
      excludedFileTypes = result.excludedFileTypes || [];
      if (result.sizeLimits) {
        sizeLimits = Object.assign({}, sizeLimits, result.sizeLimits);
      }
      renderWebsites();
      renderFileTypes();
      renderSizeLimits();
      updateSummaryStats();
    });
  }

  // ===== Websites: Add / Delete =====
  function addWebsite() {
    const raw = els.websites.input.value;
    const hostname = extractHostname(raw);

    if (!hostname) {
      showValidation(els.websites.validation, 'Please enter a valid website.');
      setInputInvalid(els.websites.input);
      els.websites.input.focus();
      return;
    }

    if (excludedWebsites.includes(hostname)) {
      showValidation(els.websites.validation, `"${hostname}" is already excluded.`);
      els.websites.input.value = '';
      els.websites.input.focus();
      return;
    }

    excludedWebsites.push(hostname);
    saveWebsites();
    renderWebsites();
    els.websites.input.value = '';
    els.websites.input.focus();
  }

  let deletingWebsite = false;
  function deleteWebsite(index) {
    if (deletingWebsite) return;
    deletingWebsite = true;
    excludedWebsites.splice(index, 1);
    saveWebsites();
    renderWebsites();
    deletingWebsite = false;
  }

  // ===== File Types: Add / Delete =====
  function addFileType() {
    const raw = els.filetypes.input.value;
    const pattern = normalizeFileType(raw);

    if (!pattern) {
      showValidation(els.filetypes.validation, 'Please enter a valid file extension.');
      setInputInvalid(els.filetypes.input);
      els.filetypes.input.focus();
      return;
    }

    if (excludedFileTypes.includes(pattern)) {
      showValidation(els.filetypes.validation, `"${pattern}" is already excluded.`);
      els.filetypes.input.value = '';
      els.filetypes.input.focus();
      return;
    }

    excludedFileTypes.push(pattern);
    saveFileTypes();
    renderFileTypes();
    els.filetypes.input.value = '';
    els.filetypes.input.focus();
  }

  let deletingFileType = false;
  function deleteFileType(index) {
    if (deletingFileType) return;
    deletingFileType = true;
    excludedFileTypes.splice(index, 1);
    saveFileTypes();
    renderFileTypes();
    deletingFileType = false;
  }

  // ===== Size Limits UI Logic =====
  function renderSizeLimits() {
    els.sizeLimits.toggleMin.checked = Boolean(sizeLimits.minEnabled);
    els.sizeLimits.valMin.value = sizeLimits.minValue || 5;
    setActiveUnit(els.sizeLimits.unitPillsMin, sizeLimits.minUnit || 'MB');
    els.sizeLimits.controlsMin.classList.toggle('disabled', !sizeLimits.minEnabled);

    els.sizeLimits.toggleMax.checked = Boolean(sizeLimits.maxEnabled);
    els.sizeLimits.valMax.value = sizeLimits.maxValue || 500;
    setActiveUnit(els.sizeLimits.unitPillsMax, sizeLimits.maxUnit || 'MB');
    els.sizeLimits.controlsMax.classList.toggle('disabled', !sizeLimits.maxEnabled);

    updateSizeStatusDisplay();
  }

  function setActiveUnit(pillsContainer, unit) {
    const buttons = pillsContainer.querySelectorAll('.btn-unit');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.unit === unit);
    });
  }

  function getActiveUnit(pillsContainer) {
    const activeBtn = pillsContainer.querySelector('.btn-unit.active');
    return activeBtn ? activeBtn.dataset.unit : 'MB';
  }

  function updateSizeStatusDisplay() {
    const minOn = els.sizeLimits.toggleMin.checked;
    const maxOn = els.sizeLimits.toggleMax.checked;
    const minVal = parseFloat(els.sizeLimits.valMin.value) || 0;
    const minUnit = getActiveUnit(els.sizeLimits.unitPillsMin);
    const maxVal = parseFloat(els.sizeLimits.valMax.value) || 0;
    const maxUnit = getActiveUnit(els.sizeLimits.unitPillsMax);

    if (minOn && maxOn) {
      els.sizeLimits.statusText.textContent = `Ignoring files < ${minVal} ${minUnit} and > ${maxVal} ${maxUnit} (catching ${minVal} ${minUnit} – ${maxVal} ${maxUnit})`;
      els.sizeLimits.statusIndicator.classList.add('active');
    } else if (minOn) {
      els.sizeLimits.statusText.textContent = `Ignoring files smaller than ${minVal} ${minUnit}`;
      els.sizeLimits.statusIndicator.classList.add('active');
    } else if (maxOn) {
      els.sizeLimits.statusText.textContent = `Ignoring files larger than ${maxVal} ${maxUnit}`;
      els.sizeLimits.statusIndicator.classList.add('active');
    } else {
      els.sizeLimits.statusText.textContent = 'No size limits active (all file sizes intercepted)';
      els.sizeLimits.statusIndicator.classList.remove('active');
    }
  }

  function gatherSizeLimitsFromUI() {
    return {
      minEnabled: els.sizeLimits.toggleMin.checked,
      minValue: parseFloat(els.sizeLimits.valMin.value) || 5,
      minUnit: getActiveUnit(els.sizeLimits.unitPillsMin),
      maxEnabled: els.sizeLimits.toggleMax.checked,
      maxValue: parseFloat(els.sizeLimits.valMax.value) || 500,
      maxUnit: getActiveUnit(els.sizeLimits.unitPillsMax),
    };
  }

  function saveSizeLimitsUI() {
    sizeLimits = gatherSizeLimitsFromUI();
    saveSizeLimitsStorage(() => {
      showActionFeedback(els.sizeLimits.feedback, 'Saved!');
    });
    updateSizeStatusDisplay();
  }

  function showActionFeedback(el, msg) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.textContent = ''; }, 200);
    }, 2000);
  }

  // Size limit event listeners
  els.sizeLimits.toggleMin.addEventListener('change', () => {
    els.sizeLimits.controlsMin.classList.toggle('disabled', !els.sizeLimits.toggleMin.checked);
    updateSizeStatusDisplay();
    saveSizeLimitsUI();
  });

  els.sizeLimits.toggleMax.addEventListener('change', () => {
    els.sizeLimits.controlsMax.classList.toggle('disabled', !els.sizeLimits.toggleMax.checked);
    updateSizeStatusDisplay();
    saveSizeLimitsUI();
  });

  function setupUnitSelector(container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-unit');
      if (!btn) return;
      const buttons = container.querySelectorAll('.btn-unit');
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateSizeStatusDisplay();
      saveSizeLimitsUI();
    });
  }

  setupUnitSelector(els.sizeLimits.unitPillsMin);
  setupUnitSelector(els.sizeLimits.unitPillsMax);

  els.sizeLimits.valMin.addEventListener('input', () => {
    updateSizeStatusDisplay();
  });

  els.sizeLimits.valMin.addEventListener('change', () => {
    saveSizeLimitsUI();
  });

  els.sizeLimits.valMax.addEventListener('input', () => {
    updateSizeStatusDisplay();
  });

  els.sizeLimits.valMax.addEventListener('change', () => {
    saveSizeLimitsUI();
  });

  els.sizeLimits.btnSave.addEventListener('click', saveSizeLimitsUI);

  // ===== Backup & Restore Logic =====
  function updateSummaryStats() {
    els.backup.statSites.textContent = excludedWebsites.length;
    els.backup.statFiles.textContent = excludedFileTypes.length;

    const minOn = sizeLimits.minEnabled;
    const maxOn = sizeLimits.maxEnabled;
    if (minOn && maxOn) {
      els.backup.statSize.textContent = `${sizeLimits.minValue}${sizeLimits.minUnit}–${sizeLimits.maxValue}${sizeLimits.maxUnit}`;
    } else if (minOn) {
      els.backup.statSize.textContent = `≥${sizeLimits.minValue}${sizeLimits.minUnit}`;
    } else if (maxOn) {
      els.backup.statSize.textContent = `≤${sizeLimits.maxValue}${sizeLimits.maxUnit}`;
    } else {
      els.backup.statSize.textContent = 'Off';
    }
  }

  function showBackupNotification(msg, type = 'success') {
    const el = els.backup.notification;
    el.textContent = msg;
    el.className = `backup-notification ${type}`;
    el.style.display = 'block';

    setTimeout(() => {
      el.style.display = 'none';
      el.textContent = '';
    }, 4500);
  }

  function exportConfig() {
    chrome.storage.sync.get(['excludedWebsites', 'excludedFileTypes', 'sizeLimits'], (data) => {
      const exportData = {
        app: 'Neat DL+',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        excludedWebsites: data.excludedWebsites || [],
        excludedFileTypes: data.excludedFileTypes || [],
        sizeLimits: data.sizeLimits || sizeLimits,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `neat-dl-plus-config-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);

      showBackupNotification('Configuration exported successfully as JSON file!', 'success');
    });
  }

  function importConfig(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid JSON structure');
        }

        const updates = {};
        let siteCount = 0;
        let typeCount = 0;

        // Restore excluded websites
        if (Array.isArray(data.excludedWebsites)) {
          const validSites = data.excludedWebsites
            .map((s) => extractHostname(String(s)))
            .filter(Boolean);
          updates.excludedWebsites = Array.from(new Set(validSites));
          siteCount = updates.excludedWebsites.length;
        }

        // Restore excluded file types
        if (Array.isArray(data.excludedFileTypes)) {
          const validTypes = data.excludedFileTypes
            .map((t) => normalizeFileType(String(t)))
            .filter(Boolean);
          updates.excludedFileTypes = Array.from(new Set(validTypes));
          typeCount = updates.excludedFileTypes.length;
        }

        // Restore size limits
        if (data.sizeLimits && typeof data.sizeLimits === 'object') {
          updates.sizeLimits = {
            minEnabled: Boolean(data.sizeLimits.minEnabled),
            minValue: parseFloat(data.sizeLimits.minValue) || 5,
            minUnit: ['KB', 'MB', 'GB'].includes(data.sizeLimits.minUnit) ? data.sizeLimits.minUnit : 'MB',
            maxEnabled: Boolean(data.sizeLimits.maxEnabled),
            maxValue: parseFloat(data.sizeLimits.maxValue) || 500,
            maxUnit: ['KB', 'MB', 'GB'].includes(data.sizeLimits.maxUnit) ? data.sizeLimits.maxUnit : 'MB',
          };
        }

        chrome.storage.sync.set(updates, () => {
          loadAll();
          showBackupNotification(
            `Import successful! Restored ${siteCount} websites, ${typeCount} file types, and size limits.`,
            'success'
          );
        });
      } catch (err) {
        showBackupNotification('Failed to import: The selected file is not valid JSON.', 'error');
      }
    };
    reader.readAsText(file);
  }

  els.backup.btnExport.addEventListener('click', exportConfig);

  els.backup.btnImport.addEventListener('click', () => {
    els.backup.fileInput.value = '';
    els.backup.fileInput.click();
  });

  els.backup.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      importConfig(file);
    }
  });

  // ===== Websites & File Types Input Listeners =====
  els.websites.btnAdd.addEventListener('click', addWebsite);
  els.websites.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWebsite();
    }
  });

  els.filetypes.btnAdd.addEventListener('click', addFileType);
  els.filetypes.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFileType();
    }
  });

  // ===== Cross-tab Sync =====
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    if (changes.excludedWebsites) {
      excludedWebsites = changes.excludedWebsites.newValue || [];
      renderWebsites();
    }

    if (changes.excludedFileTypes) {
      excludedFileTypes = changes.excludedFileTypes.newValue || [];
      renderFileTypes();
    }

    if (changes.sizeLimits) {
      sizeLimits = Object.assign({}, sizeLimits, changes.sizeLimits.newValue || {});
      renderSizeLimits();
      updateSummaryStats();
    }
  });

  // ===== Init =====
  loadAll();
})();
