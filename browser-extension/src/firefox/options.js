const DB_NAME = 'ai-detect-logs';
const DB_VERSION = 1;

let db = null;
let currentProviderId = 'sapling';
let apiKeys = {};

async function openDB() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('logs')) {
                const store = database.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp');
                store.createIndex('url', 'url');
            }
        };
    });
}

async function getAllLogs() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction('logs', 'readonly');
        const store = tx.objectStore('logs');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function clearLogs() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction('logs', 'readwrite');
        const store = tx.objectStore('logs');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function updateLogCount() {
    const logs = await getAllLogs();
    document.getElementById('logCount').textContent = `${logs.length} log entries`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const providerSelect = document.getElementById('provider');
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('save');
    const status = document.getElementById('status');
    const exportButton = document.getElementById('export');
    const clearButton = document.getElementById('clear');

    // Populate provider dropdown
    const providerList = getProviderList();
    for (const p of providerList) {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        providerSelect.appendChild(option);
    }

    // Load saved settings
    const storage = await browser.storage.local.get(['providerId', 'apiKeys']);
    currentProviderId = storage.providerId || 'sapling';
    apiKeys = storage.apiKeys || {};

    providerSelect.value = currentProviderId;
    apiKeyInput.value = apiKeys[currentProviderId] || '';
    apiKeyInput.placeholder = getProvider(currentProviderId).keyPlaceholder || 'Enter API key';

    // Update API key field when provider changes
    providerSelect.addEventListener('change', () => {
        currentProviderId = providerSelect.value;
        apiKeyInput.value = apiKeys[currentProviderId] || '';
        apiKeyInput.placeholder = getProvider(currentProviderId).keyPlaceholder || 'Enter API key';
    });

    // Load log count
    await updateLogCount();

    saveButton.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            status.textContent = 'Please enter an API key';
            status.className = 'status error';
            return;
        }

        apiKeys[currentProviderId] = key;

        await browser.storage.local.set({
            providerId: currentProviderId,
            apiKeys: apiKeys
        });

        status.textContent = 'Saved!';
        status.className = 'status success';
        setTimeout(() => { status.className = 'status'; }, 2000);
    });

    exportButton.addEventListener('click', async () => {
        const logs = await getAllLogs();
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-detect-logs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    clearButton.addEventListener('click', async () => {
        if (confirm('Delete all logs?')) {
            await clearLogs();
            await updateLogCount();
        }
    });
});