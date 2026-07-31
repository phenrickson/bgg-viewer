/**
 * Create a local `.env` from `.env.example`, filling in the values that can be
 * generated. Idempotent: an existing `.env` is never overwritten, and blank keys in
 * it get topped up. Invoked by `just env`.
 *
 * Lives in a script (not the justfile) because it needs conditionals and crypto —
 * recipes have to run identically under bash and PowerShell, so they stay one-liners.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const EXAMPLE = '.env.example';
const TARGET = '.env';

/** Values we can produce without asking the user. */
const GENERATED = {
	// 64 hex chars of CSPRNG output — used to HMAC-sign the session cookie.
	SESSION_SECRET: () => randomBytes(32).toString('hex')
};

/** Keys the app can't run without, which only a human can supply. */
const NEEDS_YOU = [
	['DEV_AUTH_EMAIL', 'any email — skips the login screen in dev'],
	['GCP_PROJECT_ID', 'BigQuery project (pre-filled from the example)']
];

/** Set `KEY=` to a value, but only when it's currently empty. */
function fillBlank(text, key, value) {
	const line = new RegExp(`^${key}=\\s*$`, 'm');
	return line.test(text) ? text.replace(line, `${key}=${value}`) : text;
}

function valueOf(text, key) {
	return text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1].trim() ?? '';
}

if (!existsSync(EXAMPLE)) {
	console.error(`✗ ${EXAMPLE} is missing — are you in the repo root?`);
	process.exit(1);
}

const fresh = !existsSync(TARGET);
let env = readFileSync(fresh ? EXAMPLE : TARGET, 'utf8');

// Top up generated values that are still blank. On an existing .env this only fills
// gaps — it never rotates a secret you're already using.
const filled = [];
for (const [key, generate] of Object.entries(GENERATED)) {
	if (valueOf(env, key) === '') {
		env = fillBlank(env, key, generate());
		filled.push(key);
	}
}

writeFileSync(TARGET, env);

console.log(fresh ? `✓ created ${TARGET} from ${EXAMPLE}` : `✓ ${TARGET} already exists — kept it`);
if (filled.length) console.log(`✓ generated ${filled.join(', ')}`);

const missing = NEEDS_YOU.filter(([key]) => valueOf(env, key) === '');
if (missing.length) {
	console.log(`\nStill needs a value from you in ${TARGET}:`);
	for (const [key, hint] of missing) console.log(`  ${key}  — ${hint}`);
}

console.log('\nNext: gcloud auth application-default login   (then `just doctor`)');
