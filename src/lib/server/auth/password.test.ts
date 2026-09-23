import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

// A hash produced by Python `bcrypt` (the library dash-viewer used to write
// core.users). Guards the interop that makes reusing that table safe.
const PYTHON_HASH = '$2b$12$QZWf2wQA97ggZzbY9nkdke7ASvNe/t29kCrv0N9wft0vttWOpFAda';

describe('password', () => {
	it('verifies a Python-bcrypt hash from core.users', async () => {
		expect(await verifyPassword('spike-test-password', PYTHON_HASH)).toBe(true);
		expect(await verifyPassword('wrong-password', PYTHON_HASH)).toBe(false);
	});

	it('round-trips a freshly hashed password', async () => {
		const hash = hashPassword('hunter2');
		expect(hash.startsWith('$2')).toBe(true);
		expect(await verifyPassword('hunter2', hash)).toBe(true);
		expect(await verifyPassword('hunter3', hash)).toBe(false);
	});

	it('returns false for an empty/garbage hash instead of throwing', async () => {
		expect(await verifyPassword('x', '')).toBe(false);
		expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
	});
});
