import type { Provider, SentenceScore, ProviderInfo, UsageStats } from './types';

interface SaplingResponse {
  sentence_scores?: SentenceScore[];
}

interface GPTZeroResponse {
  documents?: Array<{
    sentences?: Array<{
      sentence: string;
      generated_prob: number;
    }>;
  }>;
}

interface GPTZeroUsageResponse {
  data: {
    words_left: number | null;
    words_used: number;
    cycle_start: number;
    cycle_end: number;
    plan: string;
  };
}

const providers: Record<string, Provider> = {
  sapling: {
    id: 'sapling',
    name: 'Sapling AI',
    keyPlaceholder: 'Enter Sapling API key',

    buildRequest(text: string, apiKey: string) {
      return {
        url: 'https://api.sapling.ai/api/v1/aidetect',
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: apiKey,
            text: text,
            session_id: 'browser_extension'
          })
        }
      };
    },

    parseResponse(json: unknown): SentenceScore[] {
      const response = json as SaplingResponse;
      return response.sentence_scores || [];
    }
  },

  gptzero: {
    id: 'gptzero',
    name: 'GPTZero',
    keyPlaceholder: 'Enter GPTZero API key',

    buildRequest(text: string, apiKey: string) {
      return {
        url: 'https://api.gptzero.me/v2/predict/text',
        options: {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            document: text,
            multilingual: false
          })
        }
      };
    },

    parseResponse(json: unknown): SentenceScore[] {
      const response = json as GPTZeroResponse;
      const doc = response.documents?.[0];
      if (!doc?.sentences) {
        return [];
      }
      return doc.sentences.map(s => ({
        sentence: s.sentence,
        score: 1 - s.generated_prob // invert: gptzero 1=AI -> 0=AI for display
      }));
    },

    async getUsageStats(apiKey: string): Promise<UsageStats> {
      const response = await fetch('https://api.gptzero.me/v3/usage-stats', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch usage stats: ${response.status}`);
      }

      const json = await response.json() as GPTZeroUsageResponse;
      const { words_left, words_used, cycle_start, cycle_end, plan } = json.data;

      return {
        used: words_used,
        total: words_left !== null ? words_used + words_left : null,
        unit: 'words',
        cycleStart: cycle_start ? new Date(cycle_start * 1000) : null,
        cycleEnd: cycle_end ? new Date(cycle_end * 1000) : null,
        plan: plan || null
      };
    }
  }
};

export function getProvider(id: string): Provider {
  return providers[id] || providers.sapling;
}

export function getProviderList(): ProviderInfo[] {
  return Object.values(providers).map(p => ({ id: p.id, name: p.name }));
}

// Make available globally for content scripts
declare global {
  interface Window {
    getProvider: typeof getProvider;
    getProviderList: typeof getProviderList;
  }
}

if (typeof window !== 'undefined') {
  window.getProvider = getProvider;
  window.getProviderList = getProviderList;
}
