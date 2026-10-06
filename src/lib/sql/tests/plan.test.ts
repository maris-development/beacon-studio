import { describe, expect, it } from 'vitest';
import { planRoot, viewOf } from '../plan';

describe('plan view', () => {
	const plan = [
		{
			Plan: {
				'Node Type': 'ProjectionExec',
				'Actual Rows': 42,
				'Actual Total Time': 1.5,
				Output: ['n'],
				Details: 'expr=[n]',
				Plans: [{ 'Node Type': 'DataSourceExec' }]
			}
		}
	];

	it('finds the root in the [{ Plan }] shape and in a bare node', () => {
		expect(planRoot(plan)?.['Node Type']).toBe('ProjectionExec');
		expect(planRoot({ 'Node Type': 'X' })?.['Node Type']).toBe('X');
		expect(planRoot(null)).toBeNull();
		expect(planRoot([])).toBeNull();
	});

	it('builds the view of one node', () => {
		const view = viewOf(planRoot(plan)!);
		expect(view.type).toBe('ProjectionExec');
		expect(view.badges).toEqual(['42 rows', 'compute 1.5 ms']);
		expect(view.fields).toEqual([['Output', '["n"]']]);
		expect(view.details).toBe('expr=[n]');
		expect(view.children).toHaveLength(1);
	});

	it('names a node with no type', () => {
		expect(viewOf({}).type).toBe('Node');
	});
});
