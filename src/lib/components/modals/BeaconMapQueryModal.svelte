<!-- src/lib/components/BeaconMapQueryModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { BeaconClient } from '@/beacon-api/client';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { format } from 'date-fns';
	import TomSelect from 'tom-select';
	import 'tom-select/dist/css/tom-select.css';

	/** Parent passes these in to handle save/close; optionally an instance for editing */
	let {
		query = $bindable({
			query_parameters: [],
			filters: [],
			output: {}
		}),
		onClose = () => {}
	} = $props();

    let currentBeaconInstanceValue: BeaconInstance | null = null;
	let client: BeaconClient;

	// form fields
	let input: boolean = false;
	const inputIds = ['value','time','depth','latitude','longitude'];

	/** Initialize form if editing */
	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;

		client = BeaconClient.new(currentBeaconInstanceValue);

		fetchAvailableColumns();

		document.addEventListener('keydown', handleKeydown);

		return () => document.removeEventListener('keydown', handleKeydown);
	});

	function closeModal(){
		// do stuff
		if(input) {
			let confirmation = confirm('You have unsaved changes. Are you sure you want to close?');

			if (!confirmation) {
				return;
			}
		}

		onClose();
	}

	/** Close when Escape is pressed */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
			return;
		} 

		input = true;
	}

	function submit(e) {
		if(e) e.preventDefault();

		const formData = new FormData(document.getElementById('query-form') as HTMLFormElement);


		inputIds.forEach((id, index) => {
			const column = formData.get(id) as string;

			if(column) {
				query.query_parameters[index].column_name = column;
			} 
		});
		
		const timeFrom = formData.get('time_filter_min') as string;

		if(timeFrom) {
			const timeFromUnix = new Date(timeFrom).getTime() / 1000; // convert to Unix timestamp
			query.filters[0].min = timeFromUnix;
		}

		const timeTo = formData.get('time_filter_max') as string;

		if(timeTo) {
			const timeToUnix = new Date(timeTo).getTime() / 1000; // convert to Unix timestamp
			query.filters[0].max = timeToUnix;
		}



		const depthFrom = formData.get('depth_filter_min') as string;

		if(depthFrom) {
			query.filters[1].min = Number(depthFrom);
		}

		const depthTo = formData.get('depth_filter_max') as string;

		if(depthTo) {
			query.filters[1].max = Number(depthTo);
		}

		query = query;
		
		onClose();
	}


	// fetch & normalize
	async function getOptions() {
		const schema = await client.getDefaultTableSchema();
		return schema.fields
			.filter(f => f.data_type !== 'Utf8')
			.map(f => ({ value: f.name, text: `${f.name}` }));
	}

	async function fetchAvailableColumns() {
		const options = await getOptions();

		inputIds.forEach((id, index) => {
			const existingValue = query.query_parameters[index]?.column_name || '';
			let initialValue = null;

			if(existingValue){
				//find existing option in options:
				initialValue = options.find(option => option.value === existingValue);
			}

			if(!initialValue){
				initialValue = options.find(option => {
					return option.text.toLowerCase() == id.toLowerCase();
				});
			}
			
			// Clear existing options
			const ts = new TomSelect(`#${id}`, {
				options,
				valueField: 'value',
				labelField: 'text',
				searchField: ['text'],
				create: false
			});

			if(ts && initialValue) {
				ts.setValue(initialValue.value);
			}
		});
	}

	

</script>

<Modal title="Edit map query" onClose={closeModal}>

	<form onsubmit={submit} id="query-form">

		<label>
			Value column
			<select name="value" id="value"></select>
		</label>

		<label>
			Time column
			<select name="time" id="time"></select>
		</label>

		<label>
			Depth column
			<select name="depth" id="depth"></select>
		</label>

		<label>
			Latitude column
			<select name="latitude" id="latitude"></select>
		</label>

		<label>
			Longitude column
			<select name="longitude" id="longitude"></select>
		</label>

		<hr>

		<label>
			Time filter (min/max)
			<input type="date" name="time_filter_min" id="time_filter_min" value="2020-01-01">
			<input type="date" name="time_filter_max" id="time_filter_max" value="{format(new Date(), 'yyyy-MM-dd')}">
		</label>

		<label>
			Depth filter (min/max)
			<input type="number" name="depth_filter_min" id="depth_filter_min" min="0" max="100000000" value="0">
			<input type="number" name="depth_filter_max" id="depth_filter_max" min="0" max="100000000" value="5">
		</label>

	</form>

	<div slot="footer">
		<Button type="button" variant="destructive" onclick={closeModal}>Cancel</Button>
		<Button type="submit" onclick={submit}>Save</Button>
	</div>
		
</Modal>


<style lang="scss">
	form {
		label {
			display: block;
			margin-bottom: 0.75rem;
			font-weight: 500;
		}
	}
</style>
