# ginaxams-player

ginaxams-player is a browser-first exam practice platform focused on fast import, structured practice, and measurable progress.

It is a static single-page application (no backend, no build step) designed to run locally or on GitHub Pages.

## Why this project matters

- **Product mindset**: Designed for real user flow (import → organize → practice → review → improve)
- **Frontend engineering**: Vanilla JavaScript SPA with modular architecture and responsive UI
- **Data handling**: Local-first persistence with IndexedDB and backup/restore workflows
- **Internationalization**: Built-in bilingual interface (English / Spanish)

## Core capabilities

- Import exam files in JSON format via click or drag & drop
- Organize content into folders
- Practice with optional question/answer shuffling
- Get instant feedback and final score summaries
- Review all questions or only failed ones
- Track last/best score and number of attempts
- Export and restore complete local library

## Tech stack

- HTML5 + CSS3
- Vanilla JavaScript (ES6+)
- IndexedDB for local persistence
- Static hosting compatible (GitHub Pages)

## Run locally

1. Clone this repository
2. Open `index.html` in your browser

No installation or build step required.

## Deploy to GitHub Pages

1. Push repository to GitHub
2. Go to **Settings → Pages**
3. Select source: branch root (`/`)
4. Save and open the generated URL

## Exam JSON format (minimum)

```json
{
  "exam_id": "sample-exam",
  "title": "Sample Exam",
  "total_questions": 2,
  "questions": [
    {
      "number": 1,
      "text": "Question text",
      "answers": [
        { "letter": "A", "text": "Option A", "isCorrect": false },
        { "letter": "B", "text": "Option B", "isCorrect": true }
      ]
    }
  ]
}
```

## Project structure

```
ginaxams-player/
├── index.html
├── src/js/
│   ├── app.js
│   ├── db.js
│   └── practice.js
├── practice/
│   ├── examples/
│   │   └── example_exam.json
│   └── lang/
│       ├── en.js
└──     └── es.js

```

## License

MIT
