/**
 * The translation layer of Beacon Studio, on top of svelte-i18n.
 *
 * Every user-visible string lives in a catalog under `locales/`. Read a string
 * with `$t('key')` in a component, or with {@link translate} in plain code. Domain
 * code returns a {@link Message} and leaves the translation to the component.
 *
 * This module sits in the bottom layer. It imports only svelte-i18n and its
 * catalogs, so every other layer can import it.
 */

import {
	_,
	addMessages,
	date as dateFormat,
	init,
	locale,
	number as numberFormat,
	time as timeFormat
} from 'svelte-i18n';
import { derived, get, type Readable } from 'svelte/store';
import en from './locales/en.json';
import nl from './locales/nl.json';

/** The setting value that follows the browser language. */
export const AUTO_LANGUAGE = 'auto';

/** The locale of the source catalog. A missing key falls back to it. */
export const FALLBACK_LOCALE = 'en';

/** The languages that the app ships. The name is the native name and is never translated. */
export const SUPPORTED_LOCALES: ReadonlyArray<{ code: string; name: string }> = [
	{ code: 'en', name: 'English' },
	{ code: 'nl', name: 'Nederlands' }
];

type Leaves<T, Prefix extends string = ''> = {
	[K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every key of the English catalog. A wrong key fails the type check. */
export type MessageKey = Leaves<typeof en>;

export type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

/** A string that is not translated yet: a key and its values. Domain code returns this. */
export interface Message {
	key: MessageKey;
	values?: MessageValues;
}

export type Translate = (message: MessageKey | Message, values?: MessageValues) => string;

addMessages(FALLBACK_LOCALE, en);
// A key that is missing in a catalog fails the type check.
addMessages('nl', nl satisfies typeof en);
// The English catalog is bundled, so the formatter works from the first import.
init({ fallbackLocale: FALLBACK_LOCALE, initialLocale: FALLBACK_LOCALE });

/** The code of a supported locale for a setting value. `auto` reads the browser. */
export function resolveLocale(setting: string): string {
	let wanted = setting;
	if (setting === AUTO_LANGUAGE && typeof navigator !== 'undefined') {
		wanted = navigator.language;
	}

	const exact = SUPPORTED_LOCALES.find((entry) => entry.code === wanted);
	if (exact) return exact.code;

	// `nl-BE` takes `nl` when the app has no regional catalog.
	const base = wanted.split('-')[0];
	const partial = SUPPORTED_LOCALES.find((entry) => entry.code === base);
	if (partial) return partial.code;

	return FALLBACK_LOCALE;
}

/** Switch the app to the language of a setting value. */
export function setLanguage(setting: string): void {
	const code = resolveLocale(setting);
	void locale.set(code);

	if (typeof document !== 'undefined') {
		document.documentElement.lang = code;
	}
}

/** The formatter for components: `$t('nav.item.settings')` or `$t(message)`. */
export const t: Readable<Translate> = derived(_, (format) => {
	return (message, values) => {
		if (typeof message === 'string') return format(message, { values });
		return format(message.key, { values: { ...message.values, ...values } });
	};
});

/** The formatter for plain code. It formats once, so call it at the point of use. */
export function translate(message: MessageKey | Message, values?: MessageValues): string {
	return get(t)(message, values);
}

/** Make a {@link Message}. Domain code uses this, so it holds no locale state. */
export function message(key: MessageKey, values?: MessageValues): Message {
	return { key, values };
}

/** Formatters in the current locale. Use `$formatNumber(n)` in a component. */
export const formatNumber = numberFormat;
export const formatDate = dateFormat;
export const formatTime = timeFormat;

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
	['year', 365 * 24 * 60 * 60 * 1000],
	['month', 30 * 24 * 60 * 60 * 1000],
	['week', 7 * 24 * 60 * 60 * 1000],
	['day', 24 * 60 * 60 * 1000],
	['hour', 60 * 60 * 1000],
	['minute', 60 * 1000],
	['second', 1000]
];

type RelativeFormatter = (value: Date | number, now?: number) => string;

/** "3 minutes ago" or "in 2 days" in the current locale. Use `$formatRelative(date)`. */
export const formatRelative: Readable<RelativeFormatter> = derived(locale, (code) => {
	const format = new Intl.RelativeTimeFormat(code ?? FALLBACK_LOCALE, { numeric: 'auto' });

	return (value, now = Date.now()) => {
		let time = value;
		if (time instanceof Date) time = time.getTime();
		const delta = time - now;

		for (const [unit, size] of RELATIVE_UNITS) {
			if (Math.abs(delta) >= size) return format.format(Math.round(delta / size), unit);
		}

		return format.format(0, 'second');
	};
});
