import { formatSize } from '@/data-browser/datasets';

export interface Usage {
	used: number;
	total: number;
	percent: number;
}

export interface HostView {
	hostName: string | null;
	osName: string | null;
	kernel: string | null;
	uptimeSecs: number | null;
	cpuBrand: string | null;
	physicalCores: number | null;
	/** Already a percentage in the server answer. */
	cpuPercent: number | null;
	cores: { name: string; percent: number }[];
	memory: Usage | null;
	availableMemory: number | null;
	swap: Usage | null;
	load: { one: number; five: number; fifteen: number } | null;
}

export interface InfoView {
	version: string | null;
	host: HostView | null;
}

function text(value: unknown): string | null {
	if (typeof value === 'string' && value !== '') return value;
	return null;
}

function count(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return null;
}

export function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/** Null when the total is not above zero, so a missing swap shows no `NaN%`. */
export function usage(used: unknown, total: unknown): Usage | null {
	const usedValue = count(used);
	const totalValue = count(total);
	if (usedValue === null || totalValue === null || totalValue <= 0) return null;

	return {
		used: usedValue,
		total: totalValue,
		percent: clampPercent((usedValue / totalValue) * 100)
	};
}

function readLoad(value: unknown): HostView['load'] {
	if (!value || typeof value !== 'object') return null;

	const record = value as Record<string, unknown>;
	const one = count(record.one);
	const five = count(record.five);
	const fifteen = count(record.fifteen);
	if (one === null || five === null || fifteen === null) return null;

	return { one, five, fifteen };
}

function readHost(value: Record<string, unknown>): HostView {
	let cpus: unknown[] = [];
	if (Array.isArray(value.cpus)) cpus = value.cpus;

	const cores = cpus
		.filter((cpu): cpu is Record<string, unknown> => cpu !== null && typeof cpu === 'object')
		.map((cpu, index) => ({
			name: text(cpu.name) ?? `#${index + 1}`,
			percent: clampPercent(count(cpu.cpu_usage) ?? 0)
		}));

	let cpuBrand: string | null = null;
	const first = cpus[0];
	if (first && typeof first === 'object') cpuBrand = text((first as Record<string, unknown>).brand);

	let cpuPercent: number | null = null;
	const global = count(value.global_cpu_usage);
	if (global !== null) cpuPercent = clampPercent(global);

	return {
		hostName: text(value.host_name),
		osName: text(value.long_os_version) ?? text(value.name),
		kernel: text(value.kernel_version),
		uptimeSecs: count(value.uptime),
		cpuBrand,
		physicalCores: count(value.physical_core_count),
		cpuPercent,
		cores,
		memory: usage(value.used_memory, value.total_memory),
		availableMemory: count(value.available_memory),
		swap: usage(value.used_swap, value.total_swap),
		load: readLoad(value.load_average)
	};
}

/** Reads `GET /api/info`. It never throws: a missing field gives `null`. */
export function readInfo(raw: unknown): InfoView {
	if (!raw || typeof raw !== 'object') return { version: null, host: null };

	const record = raw as Record<string, unknown>;
	let host: HostView | null = null;
	if (record.system_info && typeof record.system_info === 'object') {
		host = readHost(record.system_info as Record<string, unknown>);
	}

	return { version: text(record.beacon_version), host };
}

export function formatUptime(secs: number | null): string {
	if (secs === null) return '—';

	const days = Math.floor(secs / 86400);
	const hours = Math.floor((secs % 86400) / 3600);
	const minutes = Math.floor((secs % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatPercent(value: number | null): string {
	if (value === null) return '—';
	return `${value.toFixed(1)}%`;
}

export function formatBytesOrDash(bytes: number | null): string {
	if (bytes === null) return '—';
	return formatSize(bytes);
}
