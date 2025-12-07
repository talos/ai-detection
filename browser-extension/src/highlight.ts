import type { WordLocation, SentenceWithLocations, GPTZeroSentence } from './types';

/**
 * Get all text nodes within an element
 */
function getTextNodes(node: Node): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (textNode: Text) => {
        const parent = textNode.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        if (textNode.textContent?.trim() === '') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let current: Text | null;
  while ((current = walker.nextNode() as Text | null)) {
    textNodes.push(current);
  }
  return textNodes;
}

/**
 * Get the closest meaningful container element for a text node
 */
function getContainerElement(textNode: Text): Element {
  const meaningfulTags = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'TH',
    'BLOCKQUOTE', 'PRE', 'A', 'SPAN', 'STRONG',
    'EM', 'CODE', 'LABEL', 'FIGCAPTION', 'SUMMARY', 'DETAILS',
    'TITLE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'IMG'
  ]);

  let element = textNode.parentElement;

  if (element && meaningfulTags.has(element.tagName)) {
    return element;
  }

  while (element) {
    if (meaningfulTags.has(element.tagName)) {
      return element;
    }
    element = element.parentElement;
  }

  return textNode.parentElement || document.body;
}

/**
 * Normalize text for matching (handle character variations)
 */
function normalizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract words from a sentence, preserving their positions
 */
function extractWords(sentence: string): Array<{ word: string; index: number }> {
  const words: Array<{ word: string; index: number }> = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sentence)) !== null) {
    words.push({
      word: match[0],
      index: match.index
    });
  }
  return words;
}

/**
 * Find a word in text nodes, returning all matches
 */
function findWordInTextNodes(
  textNodes: Text[],
  word: string,
  textNodeCache: Map<Text, string>
): WordLocation[] {
  const matches: WordLocation[] = [];
  const normalizedWord = normalizeText(word).toLowerCase();
  const strippedWord = normalizedWord.replace(/[.,!?;:'"()\[\]]/g, '');

  if (strippedWord.length === 0) {
    return matches;
  }

  const noHyphenWord = strippedWord.replace(/-/g, '');

  for (const textNode of textNodes) {
    let normalizedContent = textNodeCache.get(textNode);
    if (normalizedContent === undefined) {
      normalizedContent = normalizeText(textNode.textContent || '').toLowerCase();
      textNodeCache.set(textNode, normalizedContent);
    }

    const searchTerms = [strippedWord];
    if (strippedWord !== noHyphenWord && noHyphenWord.length > 0) {
      searchTerms.push(noHyphenWord);
    }

    for (const searchTerm of searchTerms) {
      // Skip empty search terms
      if (searchTerm.length === 0) {
        continue;
      }

      let searchPos = 0;
      while (searchPos < normalizedContent.length) {
        const foundIndex = normalizedContent.indexOf(searchTerm, searchPos);
        if (foundIndex === -1) break;

        const charBefore = foundIndex > 0 ? normalizedContent[foundIndex - 1] : ' ';
        const charAfter = foundIndex + searchTerm.length < normalizedContent.length
          ? normalizedContent[foundIndex + searchTerm.length]
          : ' ';

        const isWordBoundaryBefore = /[\s.,!?;:'"()\[\]]/.test(charBefore) || foundIndex === 0;
        const isWordBoundaryAfter = /[\s.,!?;:'"()\[\]]/.test(charAfter) || foundIndex + searchTerm.length === normalizedContent.length;

        if (isWordBoundaryBefore && isWordBoundaryAfter) {
          const originalText = textNode.textContent || '';

          let origPos = 0;
          let normPos = 0;
          let actualStart = -1;

          while (origPos < originalText.length && normPos <= foundIndex) {
            if (normPos === foundIndex) {
              actualStart = origPos;
              break;
            }
            if (/\s/.test(originalText[origPos])) {
              while (origPos < originalText.length - 1 && /\s/.test(originalText[origPos + 1])) {
                origPos++;
              }
            }
            origPos++;
            normPos++;
          }

          if (actualStart === -1) {
            actualStart = foundIndex;
          }

          let actualEnd = actualStart;
          let matchedChars = 0;
          while (actualEnd < originalText.length && matchedChars < searchTerm.length) {
            const char = originalText[actualEnd].toLowerCase();
            if (!/[.,!?;:'"()\[\]\s]/.test(char)) {
              matchedChars++;
            }
            actualEnd++;
          }

          matches.push({
            word: word,
            textNode: textNode,
            startOffset: Math.max(0, actualStart),
            endOffset: Math.min(actualEnd, originalText.length),
            containerElement: getContainerElement(textNode)
          });
        }

        searchPos = foundIndex + 1;
      }
    }
  }

  return matches;
}

/**
 * Locate sentences from GPTZero response in the HTML DOM
 */
export function locateSentences(doc: Document, sentences: GPTZeroSentence[]): SentenceWithLocations[] {
  const textNodes = getTextNodes(doc.body);
  const textNodeCache = new Map<Text, string>();
  const results: SentenceWithLocations[] = [];

  for (const sentenceObj of sentences) {
    const { sentence, generated_prob } = sentenceObj;
    const words = extractWords(sentence);
    const locations: WordLocation[] = [];

    for (const { word } of words) {
      const wordMatches = findWordInTextNodes(textNodes, word, textNodeCache);

      if (wordMatches.length > 0) {
        locations.push(wordMatches[0]);
      }
    }

    results.push({
      sentence,
      generated_prob,
      locations
    });
  }

  return results;
}

// Make available globally for content scripts
declare global {
  interface Window {
    locateSentences: typeof locateSentences;
  }
}

if (typeof window !== 'undefined') {
  window.locateSentences = locateSentences;
}

// Export for Node.js/testing
export {
  getTextNodes,
  getContainerElement,
  normalizeText,
  extractWords,
  findWordInTextNodes
};
