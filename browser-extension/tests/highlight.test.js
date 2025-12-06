/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

// Load fixtures
const fixturesDir = path.join(__dirname, 'fixtures');
const htmlContent = fs.readFileSync(path.join(fixturesDir, 'self_hosting_photos.html'), 'utf-8');
const gptzeroResponse = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'gptzero_response.json'), 'utf-8'));

/**
 * BLACK BOX FUNCTION - DO NOT IMPLEMENT
 *
 * This function should locate sentences from the GPTZero response in the HTML DOM.
 *
 * @param {Document} document - The parsed HTML document
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
function locateSentences(document, sentences) {
    // BLACK BOX - NOT IMPLEMENTED
    throw new Error('locateSentences is a black box function - implement it before running tests');
}

describe('Sentence Location in HTML', () => {
    let doc;

    beforeAll(() => {
        // Parse the HTML fixture into a DOM
        document.body.innerHTML = htmlContent;
        doc = document;
    });

    describe('locateSentences returns valid structure', () => {
        // Skip these tests until locateSentences is implemented
        test.skip('should return an array with the same length as input sentences', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(gptzeroResponse.sentences.length);
        });

        test.skip('each result should contain the original sentence and generated_prob', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach((item, index) => {
                expect(item.sentence).toBe(gptzeroResponse.sentences[index].sentence);
                expect(item.generated_prob).toBe(gptzeroResponse.sentences[index].generated_prob);
            });
        });

        test.skip('each result should have a locations array', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                expect(Array.isArray(item.locations)).toBe(true);
            });
        });
    });

    describe('word location accuracy', () => {
        test.skip('every word in each sentence should be locatable in the HTML', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                const words = item.sentence.split(/\s+/).filter(w => w.length > 0);
                const locatedWords = item.locations.map(loc => loc.word);

                words.forEach(word => {
                    // Normalize the word for comparison (handle punctuation differences)
                    const normalizedWord = word.replace(/[.,!?;:'"()-]/g, '').toLowerCase();
                    const foundMatch = locatedWords.some(located => {
                        const normalizedLocated = located.replace(/[.,!?;:'"()-]/g, '').toLowerCase();
                        return normalizedLocated === normalizedWord ||
                               normalizedLocated.includes(normalizedWord) ||
                               normalizedWord.includes(normalizedLocated);
                    });

                    expect(foundMatch).toBe(true);
                });
            });
        });

        test.skip('located words should have valid text node references', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    expect(loc.textNode).toBeInstanceOf(Text);
                    expect(typeof loc.startOffset).toBe('number');
                    expect(typeof loc.endOffset).toBe('number');
                    expect(loc.startOffset).toBeGreaterThanOrEqual(0);
                    expect(loc.endOffset).toBeGreaterThan(loc.startOffset);
                    expect(loc.endOffset).toBeLessThanOrEqual(loc.textNode.length);
                });
            });
        });

        test.skip('located words should have valid container element references', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    expect(loc.containerElement).toBeInstanceOf(Element);
                    // Container should be an ancestor of the text node
                    expect(loc.containerElement.contains(loc.textNode)).toBe(true);
                });
            });
        });

        test.skip('extracting text at located positions should match the word', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    const extractedText = loc.textNode.textContent.substring(loc.startOffset, loc.endOffset);
                    // The extracted text should match the word (possibly with slight normalization)
                    expect(extractedText.toLowerCase()).toContain(loc.word.toLowerCase().replace(/[.,!?;:'"()-]/g, ''));
                });
            });
        });
    });

    describe('specific sentence location tests', () => {
        test.skip('should locate "Self-hosting my photos with Immich" in the page title', () => {
            const result = locateSentences(doc, [gptzeroResponse.sentences[0]]);

            expect(result[0].locations.length).toBeGreaterThan(0);
            // The title should be found in an h1 element
            const titleLocation = result[0].locations.find(loc =>
                loc.containerElement.tagName === 'H1' ||
                loc.containerElement.closest('h1')
            );
            expect(titleLocation).toBeDefined();
        });

        test.skip('should locate "published 2025-11-29" in the date element', () => {
            const result = locateSentences(doc, [gptzeroResponse.sentences[1]]);

            expect(result[0].locations.length).toBeGreaterThan(0);
            // Should be found in the date div
            const dateLocation = result[0].locations.find(loc =>
                loc.containerElement.id === 'ms_date' ||
                loc.containerElement.closest('#ms_date')
            );
            expect(dateLocation).toBeDefined();
        });

        test.skip('should locate paragraph content in <p> elements', () => {
            // Test the first main paragraph: "For every cloud service..."
            const paragraphSentence = gptzeroResponse.sentences[3];
            const result = locateSentences(doc, [paragraphSentence]);

            expect(result[0].locations.length).toBeGreaterThan(0);
            // Content should be found in a <p> element
            const paragraphLocation = result[0].locations.find(loc =>
                loc.containerElement.tagName === 'P' ||
                loc.containerElement.closest('p')
            );
            expect(paragraphLocation).toBeDefined();
        });

        test.skip('should handle "Step 1." and "Hardware" which appear as separate sentences but are together in HTML', () => {
            // These sentences appear in an h2 together as "Step 1. Hardware"
            const step1 = gptzeroResponse.sentences.find(s => s.sentence === 'Step 1.');
            const hardware = gptzeroResponse.sentences.find(s => s.sentence === 'Hardware');

            const result = locateSentences(doc, [step1, hardware]);

            // Both should be locatable
            expect(result[0].locations.length).toBeGreaterThan(0);
            expect(result[1].locations.length).toBeGreaterThan(0);

            // Both should be in heading elements
            const step1InHeading = result[0].locations.some(loc =>
                loc.containerElement.tagName.match(/^H[1-6]$/) ||
                loc.containerElement.closest('h1, h2, h3, h4, h5, h6')
            );
            const hardwareInHeading = result[1].locations.some(loc =>
                loc.containerElement.tagName.match(/^H[1-6]$/) ||
                loc.containerElement.closest('h1, h2, h3, h4, h5, h6')
            );

            expect(step1InHeading).toBe(true);
            expect(hardwareInHeading).toBe(true);
        });

        test.skip('should handle character differences like "Read more -" vs "Read more →"', () => {
            // GPTZero returns "Read more -" but HTML has "Read more →"
            const readMoreSentence = gptzeroResponse.sentences.find(s => s.sentence === 'Read more -');
            const result = locateSentences(doc, [readMoreSentence]);

            // Should still find "Read more" portion
            expect(result[0].locations.length).toBeGreaterThan(0);
            const readLocation = result[0].locations.find(loc => loc.word.toLowerCase() === 'read');
            const moreLocation = result[0].locations.find(loc => loc.word.toLowerCase() === 'more');

            expect(readLocation).toBeDefined();
            expect(moreLocation).toBeDefined();
        });
    });

    describe('container element proximity', () => {
        test.skip('containerElement should be the closest meaningful container to each word', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    // The container should be a block-level or semantic element
                    // not just any inline wrapper
                    const meaningfulTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                                           'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD',
                                           'BLOCKQUOTE', 'PRE', 'A', 'SPAN', 'STRONG',
                                           'EM', 'CODE'];
                    expect(meaningfulTags).toContain(loc.containerElement.tagName);
                });
            });
        });
    });
});
