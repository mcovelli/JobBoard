import dotenv from 'dotenv';
dotenv.config();

const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function test() {
  const url = `https://serpapi.com/search.json?engine=google_jobs&q=Entry+level+Data+Analyst+New+York&hl=en&api_key=${SERPAPI_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.jobs_results && data.jobs_results.length > 0) {
    console.log(JSON.stringify(data.jobs_results[0], null, 2));
  } else {
    console.log("No jobs found");
  }
}

test();
