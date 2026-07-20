export type QuerySelectionStatus = {
	dataTable: string;
	columns: number;
	filters: number;
	selection: number;
	// outputFormat: string;
};

export function makeEmptyQuerySelectionStatus(): QuerySelectionStatus {
	return {
		dataTable: '',
		columns: 0,
		filters: 0,
		selection: 0,
		// outputFormat: ''
	};
}
