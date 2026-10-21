import type { CSSProperties } from 'react';

export const MAX_TAG_LENGTH = 40;
export const TAG_TINTS = 5;

/** Same rule as clean_tag in library.rs: single spaces, no edges; '' when nothing is left. */
export function cleanTag(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ');
}

/** Same tag, same colour: a small string hash of the lowercase name picks one of the tints. */
export function tagTint(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (Math.imul(hash, 31) + name.charCodeAt(i)) | 0;
	}
	// >>> 0 makes the hash unsigned, so the modulo never picks a negative tint.
	return ((hash >>> 0) % TAG_TINTS) + 1;
}

/** Inline style every tag chip/pill/row shares; the cast is for the custom property key. */
export function tagStyle(name: string): CSSProperties {
	return { '--tag-tint': `var(--kg-tag-${tagTint(name)})` } as CSSProperties;
}
