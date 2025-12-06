// AI Content Detection - Background Script
const SAPLING_API_ENDPOINT = 'https://api.sapling.ai/api/v1/aidetect';
const DB_NAME = 'ai-detect-logs';
const DB_VERSION = 1;

let db = null;

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

async function logResult(url, text, result) {
    const database = await openDB();
    const tx = database.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');

    store.add({
        timestamp: Date.now(),
        url: url,
        textLength: text.length,
        textPreview: text.slice(0, 200),
        sentenceCount: result.length,
        sentences: result
    });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
        browser.tabs.sendMessage(sender.tab.id, { action: 'toggle' });
    } else if (message.action === 'detectAI') {
        const url = sender.tab?.url || 'unknown';
        detectAIContent(message.text)
            .then(result => {
                logResult(url, message.text, result);
                sendResponse({ success: true, data: result });
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

browser.browserAction.onClicked.addListener((tab) => {
    browser.tabs.sendMessage(tab.id, { action: 'toggle' });
});

async function detectAIContent(text) {
    const { saplingApiKey } = await browser.storage.local.get('saplingApiKey');

    if (!saplingApiKey) {
        throw new Error('API key not configured. Right-click extension icon → Options');
    }

    const response = await fetch(SAPLING_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key: saplingApiKey,
            text: text,
            session_id: 'browser_extension'
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.sentence_scores || [];
}