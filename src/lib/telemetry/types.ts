/**
 * The event shapes that Beacon Studio sends to beacon-datalake.org.
 *
 * The server holds the same closed lists in `TelemetryValidator`. It drops an
 * event with a name it does not know. Add a name on both sides.
 */

/** The three kinds of event. */
export type TelemetryCategory = 'action' | 'console' | 'toast';

/** A user action, or a lifecycle moment of the app. */
export type ActionName =
	| 'app.start'
	| 'page.view'
	| 'query.execute'
	| 'query.error'
	| 'query.visualise'
	| 'query.download'
	| 'query.share'
	| 'query.save'
	| 'node.select'
	| 'node.add';

export type ConsoleName = 'console.log' | 'console.warn' | 'console.error';

export type ToastName = 'toast.info' | 'toast.success' | 'toast.warning' | 'toast.error';

export type TelemetryName = ActionName | ConsoleName | ToastName;

export type TelemetryLevel = 'log' | 'info' | 'success' | 'warn' | 'warning' | 'error';

/** The build target. `desktop` is the Tauri app. */
export type TelemetryPlatform = 'web' | 'desktop';

/** The fields that a caller supplies. The queue adds the rest. */
export interface TelemetryFields {
	level?: TelemetryLevel;
	/** The route path, without the query string. */
	route?: string;
	/** The URL of the Beacon node. The event keeps the origin, and drops the path. */
	nodeHost?: string;
	/** The server-assigned query id, from the `x-beacon-query-id` response header. */
	queryId?: string | null;
	/** Free text. The server cuts it to 500 characters. */
	message?: string;
	durationMs?: number;
	rowCount?: number;
	/** Small, non-personal extras. The server drops the object above 2000 bytes. */
	props?: Record<string, unknown>;
}

/** One event, as it goes on the wire. The server reads these key names. */
export interface TelemetryEvent {
	event_id: string;
	install_id: string;
	session_id: string;
	studio_version: string;
	platform: TelemetryPlatform;
	/** Milliseconds since the epoch, from the client clock. */
	occurred_at: number;
	category: TelemetryCategory;
	name: TelemetryName;
	level: TelemetryLevel | null;
	route: string | null;
	node_host: string | null;
	/** Joins one row to the run of that query in the Beacon node log. */
	query_id: string | null;
	message: string | null;
	duration_ms: number | null;
	row_count: number | null;
	props: Record<string, unknown> | null;
}

/** The body of one POST to the collect endpoint. */
export interface TelemetryBatch {
	events: TelemetryEvent[];
}

/** Derives the category from the event name. */
export function categoryOf(name: TelemetryName): TelemetryCategory {
	if (name.startsWith('console.')) return 'console';
	if (name.startsWith('toast.')) return 'toast';
	return 'action';
}
