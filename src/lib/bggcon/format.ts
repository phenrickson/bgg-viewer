/** "2/3 available": copies available over copies in the library. */
export function shelfText(available: number, copies: number): string {
	return `${Math.max(0, available)}/${copies} available`;
}

/** "2 of 3 copies available": the words behind `shelfText`, for a tooltip and screen readers. */
export function shelfLabel(available: number, copies: number): string {
	return `${Math.max(0, available)} of ${copies} ${copies === 1 ? 'copy' : 'copies'} available`;
}
