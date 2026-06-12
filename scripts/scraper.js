import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Configure dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SERPAPI_KEY || !GEMINI_API_KEY) {
  console.error('Missing API keys in .env');
  process.exit(1);
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const QUERIES = [
  'Entry level Data Analyst New York',
  'Entry level Business Analyst New York',
  'Junior Data Analyst New York',
  'Junior Business Analyst New York'
];

const BANNED_WORDS = ['senior', 'lead', 'manager', 'principal', 'director', 'vp', 'head', 'staff'];
const ALLOWED_WORDS = ['junior', 'jr', 'associate', 'i', '1', 'rotational', 'early career', 'graduate', 'entry level'];

const RESUME_TEXT = fs.readFileSync(path.join(__dirname, '../resume.txt'), 'utf8');

async function fetchJobsFromSerpApi(query) {
  const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(query)}&hl=en&api_key=${SERPAPI_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.jobs_results || [];
  } catch (error) {
    console.error(`Error fetching jobs for query "${query}":`, error);
    return [];
  }
}

function filterJob(job) {
  const title = (job.title || '').toLowerCase();
  
  // Exclude senior positions
  if (BANNED_WORDS.some(word => title.includes(word))) {
    return false;
  }
  
  // Optionally, enforce it must contain an allowed word or not be obviously senior
  // Since we use "Entry level" in the query, most should be fine.
  
  return true;
}

async function scoreJobWithGemini(job) {
  const prompt = `
You are an expert technical recruiter evaluating a candidate's resume for a specific job posting.

Candidate Resume:
---
${RESUME_TEXT}
---

Job Posting:
Title: ${job.title}
Company: ${job.company_name}
Location: ${job.location}
Description:
${job.description}

Analyze the job posting against the candidate's resume. 
CRITICAL CONSTRAINTS:
1. If the job requires MORE than 2 years of experience, penalize the score heavily.
2. If the job specifically requires a Bachelor's degree in Business or Computer Science, give a bonus. If it requires a Master's degree, penalize heavily.
3. Give high priority to roles that explicitly welcome 0 years of experience or "entry level" candidates.

Provide a JSON response with the following format exactly:
{
  "score": <number between 0 and 100 representing how well the candidate matches the job>,
  "reasoning": "<A brief 2-3 sentence explanation of why this score was given, highlighting matching skills, degrees, or gaps>"
}
Do NOT wrap the response in markdown blocks like \`\`\`json. Just return the raw JSON object.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
         responseMimeType: 'application/json',
      }
    });
    
    let text = response.text.trim();
    if (text.startsWith('```json')) {
       text = text.replace(/^```json/, '').replace(/```$/, '').trim();
    }
    
    const result = JSON.parse(text);
    return {
      score: result.score || 0,
      reasoning: result.reasoning || 'Could not evaluate.'
    };
  } catch (error) {
    console.error(`Error scoring job ${job.title}:`, error);
    return { score: 0, reasoning: 'Error during evaluation.' };
  }
}

async function runScraper() {
  console.log('Starting job scrape...');
  let allJobs = [];

  for (const query of QUERIES) {
    console.log(`Fetching: ${query}`);
    const jobs = await fetchJobsFromSerpApi(query);
    console.log(`Found ${jobs.length} jobs.`);
    allJobs = allJobs.concat(jobs);
  }

  // Deduplicate by job_id
  const seenIds = new Set();
  const uniqueJobs = [];
  for (const job of allJobs) {
    if (!seenIds.has(job.job_id)) {
      seenIds.add(job.job_id);
      uniqueJobs.push(job);
    }
  }

  console.log(`Total unique jobs before filtering: ${uniqueJobs.length}`);

  const filteredJobs = uniqueJobs.filter(filterJob);
  console.log(`Total jobs after basic filtering: ${filteredJobs.length}`);

  const scoredJobs = [];
  
  // Score jobs (limit to 15 for safety/speed to avoid rate limits initially)
  const jobsToProcess = filteredJobs.slice(0, 15);
  
  // Read existing jobs to preserve scores
  const fsPromises = await import('fs/promises');
  let existingJobs = [];
  try {
    const data = await fsPromises.readFile('./src/jobs.json', 'utf8');
    existingJobs = JSON.parse(data);
  } catch (e) {
    console.log("No existing jobs found to preserve scores.");
  }

  for (let i = 0; i < jobsToProcess.length; i++) {
    const job = jobsToProcess[i];
    console.log(`[${i+1}/${jobsToProcess.length}] Processing: ${job.title} at ${job.company_name}...`);
    
    // Look up existing score
    const existingJob = existingJobs.find(j => j.id === job.job_id || (j.title === job.title && j.company === job.company_name));
    
    let score = existingJob ? existingJob.score : 0;
    let reasoning = existingJob ? existingJob.reasoning : "Newly discovered job (awaiting tomorrow's AI run to score).";
    
    scoredJobs.push({
      id: job.job_id,
      title: job.title,
      company: job.company_name,
      location: job.location,
      description: job.description,
      apply_link: job.apply_options && job.apply_options.length > 0 ? job.apply_options[0].link : (job.related_links && job.related_links.length > 0 ? job.related_links[0].link : '#'),
      via: job.via || 'Unknown',
      score: score,
      reasoning: reasoning,
      posted_at: job.detected_extensions && job.detected_extensions.posted_at ? job.detected_extensions.posted_at : 'Unknown',
      schedule_type: job.detected_extensions && job.detected_extensions.schedule_type ? job.detected_extensions.schedule_type : 'Unknown',
    });
    
    // No need to delay since we are skipping Gemini
  }
  
  // Sort by score descending
  scoredJobs.sort((a, b) => b.score - a.score);

  const outputPath = path.join(__dirname, '../src/jobs.json');
  fs.writeFileSync(outputPath, JSON.stringify(scoredJobs, null, 2));
  console.log(`Saved ${scoredJobs.length} scored jobs to src/jobs.json`);
}

runScraper().catch(console.error);
