# AI Content Detection Browser Extension

Detect AI-generated content in web pages using the Sapling AI Detection API.

## Project Structure

```
browser-extension/
├── src/
│   └── firefox/
│       ├── manifest.json
│       ├── background.js
│       ├── content_script.js
│       └── icon.svg
└── README.md
```

## Setup

1. **Set your API key**: Edit `src/firefox/content_script.js` and replace `YOUR_API_KEY_HERE` with your Sapling API key.

2. **Load in Firefox**:
   - Open Firefox and go to `about:debugging`
   - Click "This Firefox" in the sidebar
   - Click "Load Temporary Add-on..."
   - Select the `manifest.json` file from `src/firefox/`

## Usage

1. Click the extension icon in the toolbar to activate selection mode
2. Hover over elements to highlight them (blue outline)
3. Click on an element to analyze its text content
4. Sentences are highlighted on a gradient:
   - **Red** = AI-generated (score near 0)
   - **Green** = Human-written (score near 1)
5. Hover over highlighted sentences to see the exact score

## Limitations

- Maximum 5000 characters per analysis
- Requires Sapling API key
- Currently Firefox only (Chrome support planned)

## API Response Format

The Sapling API returns:
```json
{
  "score": 0.99,
  "sentence_scores": [
    {"sentence": "First sentence.", "score": 0.0},
    {"sentence": "Second sentence.", "score": 0.95}
  ]
}
```

Where `score` is 0 (AI) to 1 (human).