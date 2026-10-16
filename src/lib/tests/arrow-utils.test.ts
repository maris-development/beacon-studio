import { describe, expect, it } from 'vitest';
import * as ApacheArrow from 'apache-arrow';
import { ApacheArrowUtils } from '../arrow-utils';

const toText = ApacheArrowUtils.typedValueToString;

describe('typedValueToString', () => {
	it('shows a timestamp as an ISO string', () => {
		const millis = Date.UTC(1991, 1, 3, 19, 14, 0, 2);
		expect(toText(millis, new ApacheArrow.TimestampMillisecond())).toBe('1991-02-03T19:14:00.002Z');
	});

	it('shows a date as YYYY-MM-DD', () => {
		expect(toText(Date.UTC(2020, 5, 16), new ApacheArrow.DateDay())).toBe('2020-06-16');
	});

	it('keeps an out-of-range timestamp as a number', () => {
		expect(toText(Number.MAX_VALUE, new ApacheArrow.TimestampMillisecond())).toBe(
			String(Number.MAX_VALUE)
		);
	});

	it('shows a 32-bit float without float noise', () => {
		const type = new ApacheArrow.Float32();
		expect(toText(Math.fround(0.6), type)).toBe('0.6');
		expect(toText(Math.fround(47.5467), type)).toBe('47.5467');
		expect(toText(Math.fround(-1.5499999523162842), type)).toBe('-1.55');
	});

	it('keeps every digit of a 64-bit float', () => {
		expect(toText(0.6000000238418579, new ApacheArrow.Float64())).toBe('0.6000000238418579');
	});

	it('reads the value type of a dictionary', () => {
		const type = new ApacheArrow.Dictionary(new ApacheArrow.Float32(), new ApacheArrow.Int32());
		expect(toText(Math.fround(0.6), type)).toBe('0.6');
	});

	it('shows null as empty, and a bigint and an object as text', () => {
		expect(toText(null, new ApacheArrow.Utf8())).toBe('');
		expect(toText(12n, new ApacheArrow.Int64())).toBe('12');
		expect(toText({ a: 1n }, new ApacheArrow.Null())).toBe('{"a":"1"}');
	});

	it('keeps a null cell as null in a record', () => {
		const schema = new ApacheArrow.Schema([
			new ApacheArrow.Field('name', new ApacheArrow.Utf8()),
			new ApacheArrow.Field('depth', new ApacheArrow.Float32())
		]);
		expect(ApacheArrowUtils.arrayToRecord([null, Math.fround(0.6)], schema)).toEqual({
			name: null,
			depth: '0.6'
		});
		expect(ApacheArrowUtils.arrayToRecord(['', undefined], schema)).toEqual({
			name: '',
			depth: null
		});
	});

	it('shows a struct as JSON', () => {
		const type = new ApacheArrow.Struct([]);
		expect(toText({ x: 1, y: 2 }, type)).toBe('{"x":1,"y":2}');
	});
});
