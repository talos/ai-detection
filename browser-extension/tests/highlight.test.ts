import { describe, test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import { locateSentences } from '../src/highlight';
import type { GPTZeroSentence } from '../src/types';

// Load fixtures
const fixturesDir = join(__dirname, 'fixtures');
const htmlContent = readFileSync(join(fixturesDir, 'self_hosting_photos.html'), 'utf-8');
const gptzeroResponse = JSON.parse(readFileSync(join(fixturesDir, 'gptzero_response.json'), 'utf-8')) as { sentences: GPTZeroSentence[] };

describe('Sentence Location in HTML', () => {
    let doc: Document;

    beforeAll(() => {
        // Parse the HTML fixture into a DOM using jsdom
        const dom = new JSDOM(htmlContent);
        doc = dom.window.document;

        // Set up global DOM objects for the module
        global.document = doc as any;
        global.window = dom.window as any;
        global.Node = dom.window.Node as any;
        global.NodeFilter = dom.window.NodeFilter as any;
        global.Text = dom.window.Text as any;
        global.Element = dom.window.Element as any;
    });

    describe('locateSentences returns valid structure', () => {
        test('should return an array with the same length as input sentences', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(gptzeroResponse.sentences.length);
        });

        test('each result should contain the original sentence and generated_prob', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach((item, index) => {
                expect(item.sentence).toBe(gptzeroResponse.sentences[index].sentence);
                expect(item.generated_prob).toBe(gptzeroResponse.sentences[index].generated_prob);
            });
        });

        test('each result should have a locations array', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                expect(Array.isArray(item.locations)).toBe(true);
            });
        });
    });

    describe('word location accuracy', () => {
        // Sentences that are in alt/title attributes (not text nodes) and can't be located
        const ALT_TEXT_SENTENCES = [
            'Edit Icon',
            'screenshot of Immich in a web browser'
        ];

        test('every word in locatable sentences should be found in the HTML', () => {
            // Filter out sentences that are alt text (not in text nodes)
            const locatableSentences = gptzeroResponse.sentences.filter(
                s => !ALT_TEXT_SENTENCES.includes(s.sentence)
            );
            const result = locateSentences(doc, locatableSentences);

            result.forEach(item => {
                const words = item.sentence.split(/\s+/).filter(w => w.length > 0);
                const locatedWords = item.locations.map(loc => loc.word);

                words.forEach(word => {
                    // Normalize the word for comparison (handle punctuation differences)
                    const normalizedWord = word.replace(/[.,!?;:'"()\-]/g, '').toLowerCase();
                    const foundMatch = locatedWords.some(located => {
                        const normalizedLocated = located.replace(/[.,!?;:'"()\-]/g, '').toLowerCase();
                        return normalizedLocated === normalizedWord ||
                               normalizedLocated.includes(normalizedWord) ||
                               normalizedWord.includes(normalizedLocated);
                    });

                    expect(foundMatch).toBe(true);
                });
            });
        });

        test('alt text sentences may have partial matches but not full sentence matches', () => {
            // Alt text like "Edit Icon" or "screenshot of Immich in a web browser"
            // may have individual common words ("of", "in", "a", "Icon") found elsewhere
            // but won't have the full sentence found in a contiguous text node
            const altTextSentences = gptzeroResponse.sentences.filter(
                s => ALT_TEXT_SENTENCES.includes(s.sentence)
            );
            const result = locateSentences(doc, altTextSentences);

            result.forEach(item => {
                // Check that we don't have ALL words found in the same container
                // (which would indicate we found the actual alt text, which we shouldn't)
                if (item.locations.length > 0) {
                    const containers = new Set(item.locations.map(loc => loc.containerElement));
                    const words = item.sentence.split(/\s+/).filter(w => w.length > 0);
                    // If all words were found, they should NOT all be in a single container
                    // (since alt text isn't in text nodes)
                    if (item.locations.length === words.length) {
                        expect(containers.size).toBeGreaterThan(1);
                    }
                }
            });
        });

        test('located words should have valid text node references', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    expect(loc.textNode.nodeType).toBe(3); // TEXT_NODE
                    expect(typeof loc.startOffset).toBe('number');
                    expect(typeof loc.endOffset).toBe('number');
                    expect(loc.startOffset).toBeGreaterThanOrEqual(0);
                    expect(loc.endOffset).toBeGreaterThan(loc.startOffset);
                    expect(loc.endOffset).toBeLessThanOrEqual(loc.textNode.length);
                });
            });
        });

        test('located words should have valid container element references', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    expect(loc.containerElement.nodeType).toBe(1); // ELEMENT_NODE
                    // Container should be an ancestor of the text node
                    expect(loc.containerElement.contains(loc.textNode)).toBe(true);
                });
            });
        });

        test('extracting text at located positions should match the word', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    const extractedText = loc.textNode.textContent!.substring(loc.startOffset, loc.endOffset);
                    const normalizedExtracted = extractedText.toLowerCase().replace(/[.,!?;:'"()\-\s]/g, '');
                    const normalizedWord = loc.word.toLowerCase().replace(/[.,!?;:'"()\-\s]/g, '');
                    // The extracted text should contain the word (allowing for punctuation)
                    expect(normalizedExtracted).toContain(normalizedWord);
                });
            });
        });
    });

    describe('specific sentence location tests', () => {
        test('should locate "Self-hosting my photos with Immich" in the page', () => {
            const result = locateSentences(doc, [gptzeroResponse.sentences[0]]);

            expect(result[0].locations.length).toBeGreaterThan(0);
            // The title text appears in both <title> and <h1> elements
            // We should find it in either (TITLE is found first due to DOM order)
            const titleLocation = result[0].locations.find(loc =>
                loc.containerElement.tagName === 'H1' ||
                loc.containerElement.tagName === 'TITLE' ||
                loc.containerElement.closest('h1') ||
                loc.containerElement.closest('title')
            );
            expect(titleLocation).toBeDefined();
        });

        test('should locate "published 2025-11-29" in the date element', () => {
            const result = locateSentences(doc, [gptzeroResponse.sentences[1]]);

            expect(result[0].locations.length).toBeGreaterThan(0);
            // Should be found in the date div
            const dateLocation = result[0].locations.find(loc =>
                loc.containerElement.id === 'ms_date' ||
                loc.containerElement.closest('#ms_date')
            );
            expect(dateLocation).toBeDefined();
        });

        test('should locate paragraph content in <p> elements', () => {
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

        test('should handle "Step 1." and "Hardware" which appear as separate sentences but are together in HTML', () => {
            // These sentences appear in an h2 together as "Step 1. Hardware"
            const step1 = gptzeroResponse.sentences.find(s => s.sentence === 'Step 1.');
            const hardware = gptzeroResponse.sentences.find(s => s.sentence === 'Hardware');

            const result = locateSentences(doc, [step1!, hardware!]);

            // Both should be locatable
            expect(result[0].locations.length).toBeGreaterThan(0);
            expect(result[1].locations.length).toBeGreaterThan(0);

            // Both should be in heading elements or links to headings
            const step1InHeading = result[0].locations.some(loc =>
                loc.containerElement.tagName.match(/^H[1-6]$/) ||
                loc.containerElement.closest('h1, h2, h3, h4, h5, h6') ||
                loc.containerElement.closest('a[href^="#step"]')
            );
            const hardwareInHeading = result[1].locations.some(loc =>
                loc.containerElement.tagName.match(/^H[1-6]$/) ||
                loc.containerElement.closest('h1, h2, h3, h4, h5, h6') ||
                loc.containerElement.closest('a[href^="#step"]')
            );

            expect(step1InHeading).toBe(true);
            expect(hardwareInHeading).toBe(true);
        });

        test('should handle character differences like "Read more -" vs "Read more →"', () => {
            // GPTZero returns "Read more -" but HTML has "Read more →"
            const readMoreSentence = gptzeroResponse.sentences.find(s => s.sentence === 'Read more -');
            const result = locateSentences(doc, [readMoreSentence!]);

            // Should still find "Read more" portion
            expect(result[0].locations.length).toBeGreaterThan(0);
            const readLocation = result[0].locations.find(loc => loc.word.toLowerCase() === 'read');
            const moreLocation = result[0].locations.find(loc => loc.word.toLowerCase() === 'more');

            expect(readLocation).toBeDefined();
            expect(moreLocation).toBeDefined();
        });
    });

    describe('container element proximity', () => {
        test('containerElement should be the closest meaningful container to each word', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    // The container should be a block-level or semantic element
                    // not just any inline wrapper
                    const meaningfulTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                                           'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD',
                                           'BLOCKQUOTE', 'PRE', 'A', 'SPAN', 'STRONG',
                                           'EM', 'CODE', 'LABEL', 'FIGCAPTION', 'SUMMARY', 'DETAILS',
                                           'TITLE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'IMG'];
                    expect(meaningfulTags).toContain(loc.containerElement.tagName);
                });
            });
        });
    });

    describe('repeated word handling', () => {
        test('repeated words in different sentences should be highlighted in their respective locations', () => {
            // Create a simple HTML with "of" appearing in multiple sentences
            const testHtml = `
                <html><body>
                    <p id="p1">The end of the beginning.</p>
                    <p id="p2">A tale of two cities.</p>
                    <p id="p3">Best of times.</p>
                </body></html>
            `;
            const testDom = new JSDOM(testHtml);
            const testDoc = testDom.window.document;

            // Set up globals for this test
            const origDoc = global.document;
            const origWindow = global.window;
            global.document = testDoc as any;
            global.window = testDom.window as any;

            const sentences: GPTZeroSentence[] = [
                { sentence: 'The end of the beginning.', generated_prob: 0.5, perplexity: 10, highlight_sentence_for_ai: false },
                { sentence: 'A tale of two cities.', generated_prob: 0.5, perplexity: 10, highlight_sentence_for_ai: false },
                { sentence: 'Best of times.', generated_prob: 0.5, perplexity: 10, highlight_sentence_for_ai: false },
            ];

            const result = locateSentences(testDoc, sentences);

            // Restore globals
            global.document = origDoc;
            global.window = origWindow;

            // Each sentence should have its "of" located in its own paragraph
            // Sentence 1: "of" should be in p1
            const ofInSentence1 = result[0].locations.find(loc => loc.word === 'of');
            expect(ofInSentence1).toBeDefined();
            expect(ofInSentence1!.containerElement.id).toBe('p1');

            // Sentence 2: "of" should be in p2
            const ofInSentence2 = result[1].locations.find(loc => loc.word === 'of');
            expect(ofInSentence2).toBeDefined();
            expect(ofInSentence2!.containerElement.id).toBe('p2');

            // Sentence 3: "of" should be in p3
            const ofInSentence3 = result[2].locations.find(loc => loc.word === 'of');
            expect(ofInSentence3).toBeDefined();
            expect(ofInSentence3!.containerElement.id).toBe('p3');
        });

        test('words appearing multiple times in the same sentence should all be highlighted', () => {
            const testHtml = `
                <html><body>
                    <p id="p1">The cat and the dog and the bird.</p>
                </body></html>
            `;
            const testDom = new JSDOM(testHtml);
            const testDoc = testDom.window.document;

            const origDoc = global.document;
            const origWindow = global.window;
            global.document = testDoc as any;
            global.window = testDom.window as any;

            const sentences: GPTZeroSentence[] = [
                { sentence: 'The cat and the dog and the bird.', generated_prob: 0.5, perplexity: 10, highlight_sentence_for_ai: false },
            ];

            const result = locateSentences(testDoc, sentences);

            global.document = origDoc;
            global.window = origWindow;

            // Should have locations for all words including repeated ones
            // "The" appears 3 times, "and" appears 2 times
            const theLocations = result[0].locations.filter(loc => loc.word.toLowerCase() === 'the');
            const andLocations = result[0].locations.filter(loc => loc.word === 'and');

            expect(theLocations.length).toBe(3);
            expect(andLocations.length).toBe(2);

            // Each "the" should have a different startOffset
            const theOffsets = theLocations.map(loc => loc.startOffset);
            const uniqueTheOffsets = new Set(theOffsets);
            expect(uniqueTheOffsets.size).toBe(3);
        });
    });
});
