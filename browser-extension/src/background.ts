import type { SentenceScore, StorageData, LogEntry } from './types';
import { getProvider, getProviderList } from './providers';

declare const browser: typeof chrome;

const DB_NAME = 'ai-detect-logs';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains('logs')) {
        const store = database.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('url', 'url');
      }
    };
  });
}

async function logResult(url: string, text: string, result: SentenceScore[], providerId: string): Promise<void> {
  const database = await openDB();
  const tx = database.transaction('logs', 'readwrite');
  const store = tx.objectStore('logs');

  const entry: Omit<LogEntry, 'id'> = {
    timestamp: Date.now(),
    url: url,
    provider: providerId,
    textLength: text.length,
    textPreview: text.slice(0, 200),
    sentenceCount: result.length,
    sentences: result
  };

  store.add(entry);
}

interface DetectResult {
  sentences: SentenceScore[];
  providerId: string;
  providerName: string;
}

async function detectAIContent(text: string): Promise<DetectResult> {
  const storage = await browser.storage.local.get(['providerId', 'apiKeys']) as StorageData;
  const providerId = storage.providerId || 'sapling';
  const apiKeys = storage.apiKeys || {};
  const apiKey = apiKeys[providerId];

  if (!apiKey) {
    throw new Error(`API key not configured for ${providerId}. Go to extension options.`);
  }

  const provider = getProvider(providerId);
  const { url, options } = provider.buildRequest(text, apiKey);

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const sentences = provider.parseResponse(json);

  return { sentences, providerId, providerName: provider.name };
}

browser.runtime.onMessage.addListener((
  message: { action: string; text?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  if (message.action === 'toggle') {
    if (sender.tab?.id) {
      browser.tabs.sendMessage(sender.tab.id, { action: 'toggle' });
    }
  } else if (message.action === 'detectAI') {
    const url = sender.tab?.url || 'unknown';
    detectAIContent(message.text!)
      .then(result => {
        logResult(url, message.text!, result.sentences, result.providerId);
        sendResponse({
          success: true,
          data: result.sentences,
          providerId: result.providerId,
          providerName: result.providerName
        });
      })
      .catch(err => sendResponse({ success: false, error: (err as Error).message }));
    return true;
  } else if (message.action === 'getProviders') {
    sendResponse(getProviderList());
  } else if (message.action === 'getActiveProvider') {
    browser.storage.local.get(['providerId']).then((storage: StorageData) => {
      const providerId = storage.providerId || 'sapling';
      const provider = getProvider(providerId);
      sendResponse({ providerId, providerName: provider.name });
    });
    return true;
  }
});
