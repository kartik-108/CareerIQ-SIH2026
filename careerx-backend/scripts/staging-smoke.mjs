const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const checks = [
  ['/health', 200],
  ['/ready', 200],
  ['/health/ollama', 200],
];

let failed = false;
for (const [route, expectedStatus] of checks) {
  try {
    const response = await fetch(`${baseUrl}${route}`);
    const body = await response.text();
    const passed = response.status === expectedStatus;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${route} (${response.status}) ${body.slice(0, 240)}`);
    if (!passed) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FAIL ${route}: ${error.message}`);
  }
}

if (failed) process.exitCode = 1;
