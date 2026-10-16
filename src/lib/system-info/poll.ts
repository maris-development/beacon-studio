/** Runs `read` now, and again `every` ms after each read ends. Returns a stop function. */
export function poll(read: () => Promise<void>, every: number): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const tick = async () => {
		try {
			await read();
		} finally {
			if (!stopped) timer = setTimeout(tick, every);
		}
	};

	void tick();

	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}
