# Career Match

A daily-updating job board for entry-level Data Analyst and Business Analyst roles in the NYC metro area. A scheduled scraper pulls postings, scores each one against my resume using Gemini and a React frontend displays the ranked results as a static site on GitHub Pages.

## How it works

A GitHub Actions workflow runs every day at 9 AM EDT (and can also be triggered manually). It:

1. Queries SerpAPI's Google Jobs engine for entry-level Data Analyst and Business Analyst roles in New York.
2. Filters out postings with senior-level keywords (senior, lead, manager, principal, etc).
3. Scores each remaining job against my resume using Gemini, returning a match score (0-100) and a short explanation.
4. Saves the results to `src/jobs.json` and commits the update back to the repo.
5. Builds the Vite app and deploys it to GitHub Pages.

The frontend is a single-page React app that reads `jobs.json` and renders each job as a card. Cards are color-coded by match score and expand on click to show the AI's reasoning, full description, and an apply link.

## Tech stack

- React 19 + Vite for the frontend
- `@google/genai` (Gemini) for resume-to-job scoring
- SerpAPI for job listing data
- GitHub Actions for the daily scrape/build/deploy pipeline
- GitHub Pages for hosting

## Local development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Running the scraper locally

The scraper needs two environment variables, set in a `.env` file at the project root:

```
SERPAPI_KEY=your_serpapi_key
GEMINI_API_KEY=your_gemini_key
```

Then run:

```bash
node scripts/scraper.js
```

This regenerates `src/jobs.json`. Note that the scraper currently scores up to 15 new jobs per run to stay within rate limits, and preserves scores for jobs it has already evaluated.

## Project structure

```
scripts/scraper.js     # Daily scrape + scoring logic
resume.txt              # Resume text fed to Gemini for scoring
src/App.jsx             # Main UI, renders job cards from jobs.json
src/jobs.json           # Generated job data (overwritten by scraper)
src/index.css           # App styling
.github/workflows/deploy.yml  # CI pipeline (scrape, commit, build, deploy)
```

## Notes

- `resume.txt` is the version of my resume used for scoring. Update it whenever I update my actual resume so the scores stay accurate.
- The job filter list (`BANNED_WORDS` / `ALLOWED_WORDS` in `scripts/scraper.js`) can be tuned if too many irrelevant roles slip through.
