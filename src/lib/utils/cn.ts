import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Snippet } from 'svelte';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

/**
 * Standard shadcn-svelte boilerplate — generated components (Button, Sheet, …) import these
 * two from the path their `utils` alias points at. `components.json` points that alias at
 * this file (the app's own, pre-existing `cn`) rather than letting the CLI generate a second
 * one, so they land here instead of a separate `utils.ts`.
 */
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & { ref?: E | null };
export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type { Snippet };
