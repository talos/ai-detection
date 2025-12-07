/**
 * Sentence location utilities for highlighting AI-detected content in HTML
 */

/**
 * Get all text nodes within an element
 * @param {Node} node - Root node to search
 * @returns {Text[]} Array of text nodes
 */
function getTextNodes(node) {
    const textNodes = [];
    const walker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip empty text nodes and script/style content
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.textContent.trim() === '') {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let current;
    while ((current = walker.nextNode())) {
        textNodes.push(current);
    }
    return textNodes;
}

/**
 * Get the closest meaningful container element for a text node
 * @param {Text} textNode - The text node
 * @returns {Element} The closest meaningful container
 */
function getContainerElement(textNode) {
    const meaningfulTags = new Set([
        'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'TH',
        'BLOCKQUOTE', 'PRE', 'A', 'SPAN', 'STRONG',
        'EM', 'CODE', 'LABEL', 'FIGCAPTION', 'SUMMARY', 'DETAILS',
        'TITLE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'IMG'
    ]);

    let element = textNode.parentElement;

    // First, just return the immediate parent if it's meaningful
    if (element && meaningfulTags.has(element.tagName)) {
        return element;
    }

    // Otherwise walk up to find a meaningful container
    while (element) {
        if (meaningfulTags.has(element.tagName)) {
            return element;
        }
        element = element.parentElement;
    }

    // Fallback to immediate parent
    return textNode.parentElement || document.body;
}

/**
 * Normalize text for matching (handle character variations)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
    return text
        .replace(/[\u2018\u2019]/g, "'")  // Smart quotes to regular
        .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes
        .replace(/[\u2013\u2014]/g, '-')  // En/em dash to hyphen
        .replace(/\u2192/g, '-')          // Arrow to hyphen (→)
        .replace(/\s+/g, ' ')             // Normalize whitespace
        .trim();
}

/**
 * Extract words from a sentence, preserving their positions
 * @param {string} sentence - The sentence to parse
 * @returns {Array<{word: string, index: number}>} Words with their positions
 */
function extractWords(sentence) {
    const words = [];
    const regex = /\S+/g;
    let match;
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
 * @param {Text[]} textNodes - Text nodes to search
 * @param {string} word - Word to find
 * @param {Map} textNodeCache - Cache of normalized text node content
 * @returns {Array<{textNode: Text, startOffset: number, endOffset: number, containerElement: Element}>}
 */
function findWordInTextNodes(textNodes, word, textNodeCache) {
    const matches = [];
    const normalizedWord = normalizeText(word).toLowerCase();
    // For hyphenated words, keep the hyphens for exact matching first
    const strippedWord = normalizedWord.replace(/[.,!?;:'"()\[\]]/g, '');

    if (strippedWord.length === 0) {
        return matches;
    }

    // Also try without hyphens as fallback
    const noHyphenWord = strippedWord.replace(/-/g, '');

    for (const textNode of textNodes) {
        let normalizedContent = textNodeCache.get(textNode);
        if (normalizedContent === undefined) {
            normalizedContent = normalizeText(textNode.textContent).toLowerCase();
            textNodeCache.set(textNode, normalizedContent);
        }

        // Try exact match first (with hyphens), then without hyphens
        const searchTerms = [strippedWord];
        if (strippedWord !== noHyphenWord) {
            searchTerms.push(noHyphenWord);
        }

        for (const searchTerm of searchTerms) {
            // Try to find the word in this text node
            let searchPos = 0;
            while (searchPos < normalizedContent.length) {
                const foundIndex = normalizedContent.indexOf(searchTerm, searchPos);
                if (foundIndex === -1) break;

                // Check word boundaries (not part of a larger word)
                const charBefore = foundIndex > 0 ? normalizedContent[foundIndex - 1] : ' ';
                const charAfter = foundIndex + searchTerm.length < normalizedContent.length
                    ? normalizedContent[foundIndex + searchTerm.length]
                    : ' ';

                // Allow hyphens as valid word characters (for compound words)
                const isWordBoundaryBefore = /[\s.,!?;:'"()\[\]]/.test(charBefore) || foundIndex === 0;
                const isWordBoundaryAfter = /[\s.,!?;:'"()\[\]]/.test(charAfter) || foundIndex + searchTerm.length === normalizedContent.length;

                if (isWordBoundaryBefore && isWordBoundaryAfter) {
                    // Map normalized position back to original text
                    // This is approximate - we need to find corresponding position in original
                    const originalText = textNode.textContent;

                    // Find the actual position in original text
                    let origPos = 0;
                    let normPos = 0;
                    let actualStart = -1;

                    while (origPos < originalText.length && normPos <= foundIndex) {
                        if (normPos === foundIndex) {
                            actualStart = origPos;
                            break;
                        }
                        // Skip extra whitespace in normalization
                        if (/\s/.test(originalText[origPos])) {
                            while (origPos < originalText.length - 1 && /\s/.test(originalText[origPos + 1])) {
                                origPos++;
                            }
                        }
                        origPos++;
                        normPos++;
                    }

                    if (actualStart === -1) {
                        actualStart = foundIndex; // Fallback
                    }

                    // Find actual end by matching the search term in original
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
                        endOffset: Math.min(actualEnd, textNode.textContent.length),
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
 *
 * @param {Document} doc - The parsed HTML document
 * @param {Array<{sentence: string, generated_prob: number}>} sentences - Sentences from GPTZero response
 * @returns {Array<{
 *   sentence: string,
 *   generated_prob: number,
 *   locations: Array<{
 *     word: string,
 *     textNode: Text,
 *     startOffset: number,
 *     endOffset: number,
 *     containerElement: Element
 *   }>
 * }>} Each sentence with word locations and their closest containing elements
 */
function locateSentences(doc, sentences) {
    const textNodes = getTextNodes(doc.body);
    const textNodeCache = new Map();
    const results = [];

    for (const sentenceObj of sentences) {
        const { sentence, generated_prob } = sentenceObj;
        const words = extractWords(sentence);
        const locations = [];

        for (const { word } of words) {
            const wordMatches = findWordInTextNodes(textNodes, word, textNodeCache);

            // Take the first match for each word (most likely correct one)
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

// Export for Node.js/testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        locateSentences,
        getTextNodes,
        getContainerElement,
        normalizeText,
        extractWords,
        findWordInTextNodes
    };
}
