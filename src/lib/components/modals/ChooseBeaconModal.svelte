<!-- src/lib/components/AddBeaconModal.svelte -->
<script lang="ts">
	import {beaconInstances, currentBeaconInstance} from '$lib/stores/config';
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '$lib/stores/config';
	import { Button } from '$lib/components/ui/button/index.js';
	import AddBeaconModal from './AddBeaconModal.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';

	export let onClose: () => void;

	let beaconInstanceArray = $beaconInstances;
	let currentBeaconInstanceValue: BeaconInstance | null = $currentBeaconInstance;
    let editingInstance: BeaconInstance | null = null;
    let showFormModal = false;

	if(currentBeaconInstanceValue == null && beaconInstanceArray.length > 0) {
        // If no current instance is set, set the first one
        pickInstance(beaconInstanceArray[0]);
    }

	/** Initialize form if editing */
	onMount(() => {

		return () => {
			//destructor
		}
	});

	function pickInstance(instance: BeaconInstance, e: Event|null = null) {
        if(e) e.stopPropagation(); // Prevent event bubbling if necessary

        currentBeaconInstanceValue = instance;

        currentBeaconInstance.set(instance);
    }

	function openBeaconFormModal(instance: BeaconInstance | null = null, e: Event|null = null) {
        if(e) e.stopPropagation(); // Prevent event bubbling if necessary

        editingInstance = instance;
        showFormModal = true;
    }

	function handleFormSave(instance: BeaconInstance) {
		console.log('Saving Beacon instance:', instance);
        showFormModal = false;
        
        //find instanc ein beaconInstanceArray
        const existingIndex = beaconInstanceArray.findIndex(i => i.id === instance.id);

        if (existingIndex !== -1) {
            // Update existing instance
            beaconInstanceArray[existingIndex] = instance;
        } else {
            // Add new instance
            beaconInstanceArray.push(instance);
        }

        beaconInstanceArray = [...beaconInstanceArray]; // trigger reactivity

        beaconInstances.set(beaconInstanceArray);

		if(beaconInstanceArray.length === 1) {
			pickInstance(instance);
		}
    }

    function handleFormClose() {
        showFormModal = false;
    }


</script>

<Modal title="Choose Beacon instance" onClose={onClose}>
	<p>Here are the currently configured Beacon instances:</p>

    <div class="beacon-instances">
		{#if beaconInstanceArray.length === 0}
			<div class="fake-beacon-instance">
				<p>No Beacon instances configured. Please add one.</p>
			</div>
		{/if}
        {#each beaconInstanceArray as instance}
            <button class="beacon-instance" data-id="{instance.id}" onclick={pickInstance.bind(null, instance)} >
                <h3>
                    {instance.name} 
                    {#if currentBeaconInstanceValue?.id === instance.id}
                        <span class="selected">(Selected)</span>
                    {/if}
                </h3>
                <p>URL: <a href={instance.url} target="_blank">{instance.url}</a></p>
                {#if instance.description.length > 0 }
                    <p>{instance.description}</p>                   
                {/if}
                <p>Last update: {instance.updatedAt}</p>
                <Button onclick={(e) => openBeaconFormModal(instance, e)}>Edit</Button>
                <Button onclick={(e) => pickInstance(instance, e)}  disabled={currentBeaconInstanceValue?.id === instance.id}>Select</Button>
            </button>
        {/each}
    </div>

	<Button onclick={() => openBeaconFormModal(null)}>
        Add instance
		<PlusIcon class="ml-2" />
    </Button>
</Modal>

{#if showFormModal}
	<AddBeaconModal onSave={handleFormSave} onClose={handleFormClose} instance={editingInstance}/>
{/if}



<style lang="scss">
	.beacon-instances {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
		margin-bottom: 1rem;

		.fake-beacon-instance,
        .beacon-instance {
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 1rem;
            width: calc(33.333% - 1rem);
			min-width: 250px;
            box-sizing: border-box;
            text-align: left;

            h3 {
                margin-top: 0;
                span.selected {
                    color: gray;
                    font-size: 0.9em;
                    font-style: italic;
                }
            }

            

            p {
                margin: 0.5rem 0;
            }
        }

		.fake-beacon-instance {
			min-height: 100px;
			border-style: dashed;
			// opacity: 0;
		}
    }
</style>
