/** "2 of 3 on shelf" / "Checked out" / "All 4 out". PLACEHOLDER copy (Phil). */
export function shelfText(available: number, copies: number): string {
	if (available > 0) return `${available} of ${copies} on shelf`;
	return copies === 1 ? 'Checked out' : `All ${copies} out`;
}
