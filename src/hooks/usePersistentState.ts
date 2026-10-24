import { useCallback, useState } from 'react';

/** Converts a value to and from its stored string. Undefined from parse means fallback. */
interface Codec<T> {
	parse: (raw: string) => T | undefined;
	format: (value: T) => string;
}

export const booleanCodec: Codec<boolean> = {
	parse: (raw) => raw === '1',
	format: (value) => (value ? '1' : '0'),
};

export const numberCodec: Codec<number> = {
	parse: (raw) => {
		const parsed = Number(raw);
		return Number.isNaN(parsed) ? undefined : parsed;
	},
	format: String,
};

function readValue<T>(key: string, fallback: T, codec: Codec<T>): T {
	try {
		const stored = localStorage.getItem(key);
		if (stored === null) return fallback;
		const parsed = codec.parse(stored);
		return parsed === undefined ? fallback : parsed;
	} catch {
		return fallback;
	}
}

function writeValue<T>(key: string, value: T, codec: Codec<T>) {
	try {
		localStorage.setItem(key, codec.format(value));
	} catch {
		// Blocked storage only costs the remembered state.
	}
}

/** A value kept in localStorage for this viewer. Works without storage. */
export function usePersistentState<T>(
	key: string,
	fallback: T,
	codec: Codec<T>,
): readonly [T, (next: T) => void] {
	const [value, setValue] = useState(() => readValue(key, fallback, codec));

	const set = useCallback(
		(next: T) => {
			setValue(next);
			writeValue(key, next, codec);
		},
		[key, codec],
	);

	return [value, set] as const;
}
