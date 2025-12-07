const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlContent = fs.readFileSync(path.join(__dirname, 'fixtures/self_hosting_photos.html'), 'utf-8');
const gptzeroResponse = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gptzero_response.json'), 'utf-8'));

const dom = new JSDOM(htmlContent);
global.document = dom.window.document;
global.NodeFilter = dom.window.NodeFilter;
global.Text = dom.window.Text;
global.Element = dom.window.Element;

const { locateSentences } = require('../src/firefox/highlight.js');

// Check alt text sentences
const altSentences = ['Edit Icon', 'screenshot of Immich in a web browser'];
altSentences.forEach(s => {
    const sentence = gptzeroResponse.sentences.find(sent => sent.sentence === s);
    if (sentence) {
        const result = locateSentences(document, [sentence]);
        console.log('Sentence:', s);
        console.log('Locations found:', result[0].locations.length);
        result[0].locations.forEach(loc => {
            console.log('  Word:', loc.word, '- Found in:', loc.containerElement.tagName, '- Text:', loc.textNode.textContent.substring(0, 50));
        });
    }
});

console.log('\n--- Words not found ---');

// Find which words are not being found
const locatableSentences = gptzeroResponse.sentences.filter(s => altSentences.indexOf(s.sentence) === -1);
const result = locateSentences(document, locatableSentences);

result.forEach(item => {
    const words = item.sentence.split(/\s+/).filter(w => w.length > 0);
    const locatedWords = item.locations.map(loc => loc.word);

    words.forEach(word => {
        const normalizedWord = word.replace(/[.,!?;:'"()\-]/g, '').toLowerCase();
        const foundMatch = locatedWords.some(located => {
            const normalizedLocated = located.replace(/[.,!?;:'"()\-]/g, '').toLowerCase();
            return normalizedLocated === normalizedWord ||
                   normalizedLocated.includes(normalizedWord) ||
                   normalizedWord.includes(normalizedLocated);
        });
        if (!foundMatch) {
            console.log('NOT FOUND - Sentence:', item.sentence, '| Word:', word);
        }
    });
});
