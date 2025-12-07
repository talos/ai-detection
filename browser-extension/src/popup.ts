import type { Capture, StorageData, ProviderInfo } from './types';
import { getProvider, getProviderList } from './providers';

declare const browser: typeof chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider') as HTMLSelectElement;
  const analyzeButton = document.getElementById('analyze') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;
  const openSettings = document.getElementById('openSettings') as HTMLAnchorElement;
  const historyList = document.getElementById('historyList') as HTMLDivElement;

  // Populate provider dropdown
  const providerList = getProviderList();
  for (const p of providerList) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    providerSelect.appendChild(option);
  }

  // Load current provider and captures
  const storage = await browser.storage.local.get(['providerId', 'apiKeys', 'captures']) as StorageData;
  const currentProviderId = storage.providerId || 'sapling';
  const apiKeys = storage.apiKeys || {};
  const captures = storage.captures || [];
  providerSelect.value = currentProviderId;

  // Display capture history
  function formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname.length > 30
        ? parsed.pathname.substring(0, 30) + '...'
        : parsed.pathname);
    } catch {
      return url.substring(0, 40);
    }
  }

  function renderHistory(): void {
    if (captures.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No captures yet</div>';
      return;
    }

    historyList.innerHTML = '';
    for (const capture of captures.slice(0, 10)) {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="url">${formatUrl(capture.url)}</div>
        <div class="timestamp">${formatTimestamp(capture.timestamp)}</div>
      `;
      item.addEventListener('click', async () => {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          await browser.tabs.sendMessage(tabs[0].id, {
            action: 'openCapture',
            result: capture.result,
            text: capture.text
          });
        }
        window.close();
      });
      historyList.appendChild(item);
    }
  }

  renderHistory();

  // Switch provider immediately on change
  providerSelect.addEventListener('change', async () => {
    const newProviderId = providerSelect.value;
    await browser.storage.local.set({ providerId: newProviderId });

    if (!apiKeys[newProviderId]) {
      status.textContent = `No API key for ${getProvider(newProviderId).name}`;
      status.className = 'status error';
    } else {
      status.className = 'status';
    }
  });

  // Analyze button triggers selection mode
  analyzeButton.addEventListener('click', async () => {
    const providerId = providerSelect.value;
    if (!apiKeys[providerId]) {
      status.textContent = `Set API key in settings first`;
      status.className = 'status error';
      return;
    }

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, { action: 'toggle' });
    }
    window.close();
  });

  // Open settings
  openSettings.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
    window.close();
  });
});
