// Browser extension API types (Firefox WebExtensions)
declare const browser: typeof chrome;

// Usage stats types
export interface UsageStats {
  used: number;
  total: number | null; // null for unlimited/metered plans
  unit: string; // 'words', 'credits', etc.
  cycleStart: Date | null;
  cycleEnd: Date | null;
  plan: string | null;
}

// Provider types
export interface Provider {
  id: string;
  name: string;
  keyPlaceholder: string;
  buildRequest(text: string, apiKey: string): { url: string; options: RequestInit };
  parseResponse(json: unknown): SentenceScore[];
  // Optional: Get usage statistics for this provider
  getUsageStats?(apiKey: string): Promise<UsageStats>;
}

export interface SentenceScore {
  sentence: string;
  score: number; // 0 = AI, 1 = human
}

export interface ProviderInfo {
  id: string;
  name: string;
}

// Detection result types
export interface DetectionResult {
  sentences: SentenceScore[];
  providerName: string;
}

// Capture history types
export interface Capture {
  id: string;
  url: string;
  title: string;
  timestamp: string;
  result: DetectionResult;
  text: string;
}

// Highlight location types
export interface WordLocation {
  word: string;
  textNode: Text;
  startOffset: number;
  endOffset: number;
  containerElement: Element;
}

export interface SentenceWithLocations {
  sentence: string;
  generated_prob: number;
  locations: WordLocation[];
}

export interface GPTZeroSentence {
  sentence: string;
  generated_prob: number;
}

// Storage types
export interface StorageData {
  providerId?: string;
  apiKeys?: Record<string, string>;
  captures?: Capture[];
}

// Message types
export type Message =
  | { action: 'toggle' }
  | { action: 'clearHighlights' }
  | { action: 'openCapture'; result: DetectionResult; text: string }
  | { action: 'detectAI'; text: string }
  | { action: 'getProviders' }
  | { action: 'getActiveProvider' };

export interface DetectAIResponse {
  success: boolean;
  data?: SentenceScore[];
  providerId?: string;
  providerName?: string;
  error?: string;
}

// Log entry types
export interface LogEntry {
  id?: number;
  timestamp: number;
  url: string;
  provider: string;
  textLength: number;
  textPreview: string;
  sentenceCount: number;
  sentences: SentenceScore[];
}
