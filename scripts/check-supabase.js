// scripts/check-supabase.js
// Simple Node script to verify SUPABASE_URL is configured and reachable.
const fs = require('fs');
const https = require('https');

function getConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_ANON_KEY;
  let appJson = null;
  try {
    appJson = JSON.parse(fs.readFileSync('./app.json', 'utf8'));
  } catch (e) {
    appJson = null;
  }
  const expoExtra = appJson && ((appJson.expo && appJson.expo.extra) || null);
  const url = envUrl || (expoExtra && (expoExtra.SUPABASE_URL || expoExtra.supabaseUrl)) || null;
  const key = envKey || (expoExtra && (expoExtra.SUPABASE_ANON_KEY || expoExtra.supabaseAnonKey)) || null;
  return { url, key };
}

function checkUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('No URL provided'));
    try {
      const u = new URL(url);
      const opts = { method: 'GET', hostname: u.hostname, path: u.pathname || '/', port: u.port || undefined };
      const req = https.request({ hostname: opts.hostname, path: opts.path, method: 'GET', port: opts.port }, (res) => {
        resolve({ statusCode: res.statusCode, headers: res.headers });
      });
      req.on('error', (err) => reject(err));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function main() {
  const { url, key } = getConfig();
  console.log('Resolved SUPABASE_URL:', url || '(none)');
  console.log('Resolved SUPABASE_ANON_KEY:', key ? (key.slice(0,8) + '...') : '(none)');
  if (!url) {
    console.error('No SUPABASE_URL found. Set SUPABASE_URL in env or app.json expo.extra.');
    process.exit(2);
  }
  try {
    const res = await checkUrl(url);
    console.log('Reachable. HTTP status:', res.statusCode);
    process.exit(0);
  } catch (e) {
    console.error('Network error while reaching SUPABASE_URL:', e.message);
    process.exit(3);
  }
}

main();
