const fs = require('fs');
const path = require('path');

const apiBase = String(process.env.MDT_API_BASE_URL || '').trim().replace(/\/$/, '');
const target = path.join(__dirname, '..', 'public', 'runtime-config.js');
const source = `// Generated at deploy time. Do not put secrets in this file.\nwindow.MDT_CONFIG = ${JSON.stringify({ apiBase })};\n`;
fs.writeFileSync(target, source, 'utf8');
console.log(`Wrote runtime API config: ${apiBase || '(same-origin/local)'}`);
