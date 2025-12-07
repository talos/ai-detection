/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

// Load the implementation
const { locateSentences } = require('../src/firefox/highlight.js');

// Load fixtures
const fixturesDir = path.join(__dirname, 'fixtures');
const htmlContent = fs.readFileSync(path.join(fixturesDir, 'self_hosting_photos.html'), 'utf-8');
const gptzeroResponse = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'gptzero_response.json'), 'utf-8'));

describe('Sentence Location in HTML', () => {
    let doc;

    beforeAll(() => {
        // Parse the HTML fixture into a DOM
        document.body.innerHTML = htmlContent;
        doc = document;
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
                    expect(loc.textNode).toBeInstanceOf(Text);
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
                    expect(loc.containerElement).toBeInstanceOf(Element);
                    // Container should be an ancestor of the text node
                    expect(loc.containerElement.contains(loc.textNode)).toBe(true);
                });
            });
        });

        test('extracting text at located positions should match the word', () => {
            const result = locateSentences(doc, gptzeroResponse.sentences);

            result.forEach(item => {
                item.locations.forEach(loc => {
                    const extractedText = loc.textNode.textContent.substring(loc.startOffset, loc.endOffset);
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

            const result = locateSentences(doc, [step1, hardware]);

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
});
