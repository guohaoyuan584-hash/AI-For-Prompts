# AI for Prompts

This folder now contains a small local web app that uses Gemini to turn rough image ideas into clearer prompts.

## Main files

- `flysmallpig-prompt-ai.html`: the UI page
- `app.js`: frontend session logic and API calls
- `server.js`: local Node server and Gemini API endpoint
- `.env.example`: example environment variable file

## First-time setup

1. Create your local env file:

```bash
cd /Users/flysmallpig/Downloads/codex
cp .env.example .env
```

2. Open `.env` and replace the placeholder with your real Gemini key:

```text
GEMINI_API_KEY=your_real_key_here
```

## Run the app

```bash
cd /Users/flysmallpig/Downloads/codex
npm start
```

Then open:

`http://localhost:3000`

## Notes

- Keep `.env` private and never commit it.
- The UI stores chat sessions in your browser `localStorage`.
- `Refine Again` requests a stronger second-pass prompt without asking more questions.
