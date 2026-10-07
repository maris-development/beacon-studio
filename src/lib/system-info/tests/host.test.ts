import { describe, expect, it } from 'vitest';
import {
	clampPercent,
	formatBytesOrDash,
	formatPercent,
	formatUptime,
	readInfo,
	usage
} from '../host';

const host = {
	host_name: 'beacon-1',
	long_os_version: 'Linux 22.04 Ubuntu',
	kernel_version: '6.5.0',
	uptime: 273120,
	physical_core_count: 4,
	global_cpu_usage: 12.5,
	cpus: [
		{ name: 'cpu0', brand: 'AMD EPYC', cpu_usage: 20 },
		{ name: 'cpu1', brand: 'AMD EPYC', cpu_usage: 5 }
	],
	total_memory: 1000,
	used_memory: 250,
	available_memory: 700,
	total_swap: 200,
	used_swap: 50,
	load_average: { one: 0.5, five: 0.25, fifteen: 0.1 }
};

describe('readInfo', () => {
	it('reads a full answer', () => {
		const view = readInfo({ beacon_version: '2.0.0', system_info: host });
		expect(view.version).toBe('2.0.0');
		expect(view.host).toEqual({
			hostName: 'beacon-1',
			osName: 'Linux 22.04 Ubuntu',
			kernel: '6.5.0',
			uptimeSecs: 273120,
			cpuBrand: 'AMD EPYC',
			physicalCores: 4,
			cpuPercent: 12.5,
			cores: [
				{ name: 'cpu0', percent: 20 },
				{ name: 'cpu1', percent: 5 }
			],
			memory: { used: 250, total: 1000, percent: 25 },
			availableMemory: 700,
			swap: { used: 50, total: 200, percent: 25 },
			load: { one: 0.5, five: 0.25, fifteen: 0.1 }
		});
	});

	it('gives no host for system_info null', () => {
		expect(readInfo({ beacon_version: '2.0.0', system_info: null })).toEqual({
			version: '2.0.0',
			host: null
		});
	});

	it('does not multiply the CPU usage, and clamps it', () => {
		const view = readInfo({ system_info: { ...host, global_cpu_usage: 140 } });
		expect(view.host?.cpuPercent).toBe(100);
	});

	it('survives missing and odd fields', () => {
		const view = readInfo({
			system_info: { cpus: [], total_swap: 0, used_swap: 0, load_average: 'x' }
		});
		expect(view.version).toBeNull();
		expect(view.host).toMatchObject({
			hostName: null,
			cpuBrand: null,
			cpuPercent: null,
			cores: [],
			memory: null,
			swap: null,
			load: null
		});
	});

	it('names a core with no name by its position', () => {
		const view = readInfo({ system_info: { cpus: [{ cpu_usage: 3 }] } });
		expect(view.host?.cores).toEqual([{ name: '#1', percent: 3 }]);
	});

	it('gives an empty view for a value of the wrong shape', () => {
		expect(readInfo('junk')).toEqual({ version: null, host: null });
	});
});

describe('formatting', () => {
	it('builds a usage only for a total above zero', () => {
		expect(usage(1, 4)).toEqual({ used: 1, total: 4, percent: 25 });
		expect(usage(0, 0)).toBeNull();
		expect(usage('a', 4)).toBeNull();
	});

	it('clamps a percentage', () => {
		expect(clampPercent(-3)).toBe(0);
		expect(clampPercent(250)).toBe(100);
	});

	it('writes the uptime', () => {
		expect(formatUptime(273120)).toBe('3d 3h 52m');
		expect(formatUptime(18000)).toBe('5h 0m');
		expect(formatUptime(720)).toBe('12m');
		expect(formatUptime(null)).toBe('—');
	});

	it('writes a percentage and bytes, with a dash for no value', () => {
		expect(formatPercent(12.54)).toBe('12.5%');
		expect(formatPercent(null)).toBe('—');
		expect(formatBytesOrDash(null)).toBe('—');
		expect(formatBytesOrDash(1536)).toBe('1.5 KB');
	});
});
