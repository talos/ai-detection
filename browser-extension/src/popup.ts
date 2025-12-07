import type { Capture, StorageData, ProviderInfo, UsageStats } from './types';
import { getProvider, getProviderList } from './providers';

declare const browser: typeof chrome;

interface UsageStatsResponse {
  success: boolean;
  stats?: UsageStats;
  error?: string;
}

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider') as HTMLSelectElement;
  const analyzeButton = document.getElementById('analyze') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;
  const openSettings = document.getElementById('openSettings') as HTMLAnchorElement;
  const historyList = document.getElementById('historyList') as HTMLDivElement;
  const usageBarContainer = document.getElementById('usageBarContainer') as HTMLDivElement;
  const usageBarFill = document.getElementById('usageBarFill') as HTMLDivElement;
  const usageBarText = document.getElementById('usageBarText') as HTMLDivElement;
  const apiKeySetup = document.getElementById('apiKeySetup') as HTMLDivElement;
  const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
  const saveApiKeyButton = document.getElementById('saveApiKey') as HTMLButtonElement;
  const getKeyLink = document.getElementById('getKeyLink') as HTMLAnchorElement;

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
  let apiKeys = storage.apiKeys || {};
  const captures = storage.captures || [];
  providerSelect.value = currentProviderId;

  // Update UI based on whether API key exists for current provider
  function updateApiKeyUI(providerId: string): void {
    const provider = getProvider(providerId);
    const hasKey = !!apiKeys[providerId];

    if (hasKey) {
      apiKeySetup.classList.remove('visible');
      analyzeButton.style.display = 'block';
      status.className = 'status';
    } else {
      apiKeySetup.classList.add('visible');
      analyzeButton.style.display = 'none';
      apiKeyInput.placeholder = provider.keyPlaceholder;
      getKeyLink.href = provider.apiKeyUrl;
      getKeyLink.textContent = `Get a ${provider.name} API key`;
      status.className = 'status';
    }
  }

  // Initial UI update
  updateApiKeyUI(currentProviderId);

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
      const providerName = capture.result?.providerName || 'Unknown';
      item.innerHTML = `
        <div class="url">${formatUrl(capture.url)}</div>
        <div class="timestamp">${providerName} · ${formatTimestamp(capture.timestamp)}</div>
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

  // Usage stats display
  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function updateUsageStats(): Promise<void> {
    const response = await browser.runtime.sendMessage({ action: 'getUsageStats' }) as UsageStatsResponse;

    if (!response.success || !response.stats) {
      usageBarContainer.classList.remove('visible');
      return;
    }

    const stats = response.stats;

    // Handle unlimited plans (total is null)
    if (stats.total === null) {
      usageBarContainer.classList.add('visible');
      usageBarFill.style.width = '100%';
      usageBarFill.className = 'usage-bar-fill';
      usageBarText.textContent = `${formatNumber(stats.used)} ${stats.unit} used (unlimited)`;

      // Build tooltip
      let tooltip = `Plan: ${stats.plan || 'Unknown'}\nUsed: ${stats.used.toLocaleString()} ${stats.unit}`;
      if (stats.cycleStart && stats.cycleEnd) {
        tooltip += `\nCycle: ${formatDate(new Date(stats.cycleStart))} - ${formatDate(new Date(stats.cycleEnd))}`;
      }
      usageBarContainer.title = tooltip;
      return;
    }

    // Calculate percentage remaining
    const remaining = stats.total - stats.used;
    const percentRemaining = (remaining / stats.total) * 100;

    usageBarContainer.classList.add('visible');
    usageBarFill.style.width = `${percentRemaining}%`;

    // Color based on remaining percentage
    usageBarFill.classList.remove('warning', 'danger');
    if (percentRemaining <= 10) {
      usageBarFill.classList.add('danger');
    } else if (percentRemaining <= 30) {
      usageBarFill.classList.add('warning');
    }

    usageBarText.textContent = `${formatNumber(remaining)} ${stats.unit} left`;

    // Build tooltip
    let tooltip = `Plan: ${stats.plan || 'Unknown'}`;
    tooltip += `\nUsed: ${stats.used.toLocaleString()} / ${stats.total.toLocaleString()} ${stats.unit}`;
    tooltip += `\nRemaining: ${remaining.toLocaleString()} ${stats.unit} (${percentRemaining.toFixed(1)}%)`;
    if (stats.cycleStart && stats.cycleEnd) {
      tooltip += `\nCycle: ${formatDate(new Date(stats.cycleStart))} - ${formatDate(new Date(stats.cycleEnd))}`;
    }
    usageBarContainer.title = tooltip;
  }

  // Load usage stats on startup
  updateUsageStats();

  // Switch provider immediately on change
  providerSelect.addEventListener('change', async () => {
    const newProviderId = providerSelect.value;
    await browser.storage.local.set({ providerId: newProviderId });

    // Update UI for new provider
    updateApiKeyUI(newProviderId);
    apiKeyInput.value = '';

    // Refresh usage stats for new provider
    updateUsageStats();
  });

  // Save API key
  saveApiKeyButton.addEventListener('click', async () => {
    const providerId = providerSelect.value;
    const newKey = apiKeyInput.value.trim();

    if (!newKey) {
      status.textContent = 'Please enter an API key';
      status.className = 'status error';
      return;
    }

    // Save the key
    apiKeys[providerId] = newKey;
    await browser.storage.local.set({ apiKeys });

    // Update UI
    apiKeyInput.value = '';
    updateApiKeyUI(providerId);
    updateUsageStats();

    status.textContent = 'API key saved!';
    status.className = 'status';
    status.style.display = 'block';
    status.style.background = '#d4edda';
    status.style.color = '#155724';
    setTimeout(() => {
      status.style.display = '';
      status.style.background = '';
      status.style.color = '';
      status.className = 'status';
    }, 2000);
  });

  // Analyze button triggers selection mode
  analyzeButton.addEventListener('click', async () => {
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
