'use strict';

const toggleEnabled = document.getElementById('toggleEnabled');
const excludeSite = document.getElementById('excludeSite');
const hostnameDisplay = document.getElementById('hostnameDisplay');
const openSettings = document.getElementById('openSettings');
const headerSettings = document.getElementById('headerSettings');
const checkboxLabel = excludeSite.closest('.checkbox-label');

let currentHostname = '';

// ── Initialize popup state ──
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Fallback: show as disabled if background is unreachable
      toggleEnabled.checked = false;
      setExcludeDisabled(true);
      return;
    }

    toggleEnabled.checked = response.enabled;
    currentHostname = response.currentHostname || '';

    if (!currentHostname) {
      setExcludeDisabled(true);
    } else {
      excludeSite.checked = response.currentSiteExcluded;
      hostnameDisplay.textContent = `(${currentHostname})`;
      setExcludeDisabled(false);
    }
  });
});

// ── Toggle: Download Catcher on/off ──
toggleEnabled.addEventListener('change', () => {
  chrome.runtime.sendMessage({ action: 'toggle' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    toggleEnabled.checked = response.enabled;
  });
});

// ── Checkbox: Exclude current site ──
excludeSite.addEventListener('change', () => {
  if (!currentHostname) return;

  chrome.runtime.sendMessage(
    { action: 'toggleSiteExclusion', hostname: currentHostname },
    (response) => {
      if (chrome.runtime.lastError || !response) return;
      excludeSite.checked = response.excluded;
    }
  );
});

// ── Settings buttons ──
function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

openSettings.addEventListener('click', openOptionsPage);
headerSettings.addEventListener('click', openOptionsPage);

// ── Helpers ──
function setExcludeDisabled(disabled) {
  excludeSite.disabled = disabled;
  if (disabled) {
    checkboxLabel.classList.add('disabled');
    hostnameDisplay.textContent = '(N/A)';
    excludeSite.checked = false;
  } else {
    checkboxLabel.classList.remove('disabled');
  }
}
