import type { ColorScale } from '@/plots/plot-config';

export const EXPONENTIAL_POWER = 2;

export interface ColorScaleDomain {
	min: number;
	max: number;
	scale: ColorScale;
}

export function colorScaleDomain(
	min: number,
	max: number,
	scale: ColorScale
): ColorScaleDomain | null {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
	if (scale === 'logarithmic' && !(min > 0)) return null;
	return { min, max, scale };
}

export function colorScalePosition(
	value: number,
	min: number,
	max: number,
	scale: ColorScale
): number {
	if (max === min) return 0.5;

	let position: number;
	if (scale === 'logarithmic') {
		if (!(value > 0) || !(min > 0) || !(max > min)) return value <= 0 ? 0 : 1;
		position = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
	} else {
		position = (value - min) / (max - min);
		if (!Number.isFinite(position)) return 0;
		if (position < 0) position = 0;
		if (position > 1) position = 1;
		if (scale === 'exponential') position **= EXPONENTIAL_POWER;
	}

	if (!Number.isFinite(position)) return 0;
	if (position < 0) return 0;
	if (position > 1) return 1;
	return position;
}

export function colorScaleValue(
	position: number,
	min: number,
	max: number,
	scale: ColorScale
): number {
	let valuePosition = Math.min(Math.max(position, 0), 1);
	if (scale === 'logarithmic') {
		if (!(min > 0) || !(max > min)) return min + valuePosition * (max - min);
		return Math.exp(Math.log(min) + valuePosition * (Math.log(max) - Math.log(min)));
	}
	if (scale === 'exponential') valuePosition = Math.sqrt(valuePosition);
	return min + valuePosition * (max - min);
}
