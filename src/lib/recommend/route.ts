/**
 * Recommend's addresses. Discover folded into Recommend as its "Help me find a game" tab; the
 * questions are the same `Scope` as before, in the same querystring params, so an old Discover
 * link lands on the same answers.
 */
export const RECOMMEND_PATH = '/recommend';

/** The Start tab param: `tab=find` is "Help me find a game"; absent is "I want games like…". */
export const TAB_PARAM = 'tab';
export const FIND_TAB = 'find';

/** "Help me find a game" with a querystring of Scope params (a Discover URL's, say). */
export function findHref(search: string | URLSearchParams = ''): string {
	const params = new URLSearchParams(search);
	params.delete(TAB_PARAM);
	const rest = params.toString();
	return `${RECOMMEND_PATH}?${TAB_PARAM}=${FIND_TAB}${rest ? `&${rest}` : ''}`;
}
