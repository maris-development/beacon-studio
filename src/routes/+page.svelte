<script lang="ts">
    import {beaconInstances, currentBeaconInstance} from '$lib/stores/config';
    import { Button } from "$lib/components/ui/button/index.js";
    import AddBeaconModal from '$lib/components/modals/AddBeaconModal.svelte';
	import type { BeaconInstance } from '$lib/stores/config';

    let beaconInstanceArray = $beaconInstances;
    let currentBeaconInstanceValue: BeaconInstance | null = $currentBeaconInstance;
    let showModal = false;
    let editingInstance: BeaconInstance | null = null;

    if(currentBeaconInstanceValue == null && beaconInstanceArray.length > 0) {
        // If no current instance is set, set the first one
        pickInstance(beaconInstanceArray[0]);
    }

    function openModal(instance: BeaconInstance | null = null, e: Event|null = null) {
        if(e) e.stopPropagation(); // Prevent event bubbling if necessary

        editingInstance = instance;
        showModal = true;
        console.log('Opening modal to add new Beacon instance');
    }

    function handleSave(instance: BeaconInstance) {
        showModal = false;
        
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
    }

    function handleClose() {
        showModal = false;
        console.log('Closing modal');
    }

    function pickInstance(instance: BeaconInstance, e: Event|null = null) {
        if(e) e.stopPropagation(); // Prevent event bubbling if necessary

        currentBeaconInstanceValue = instance;

        currentBeaconInstance.set(instance);
    }

    

</script>

<svelte:head>
	<title>Beacon Studio</title>
</svelte:head>

<div class="page-container">
	<h1 class="">Welcome to Beacon Studio</h1>

	<p>
		Visit <a href="https://maris-development.github.io/beacon/">maris-development.github.io/beacon/</a> to read the documentation.
	</p>

    <h2>Beacon instances</h2>

    <Button onclick={() => openModal(null)}>
        Add instance
    </Button>

    {#if showModal}
        <AddBeaconModal onSave={handleSave} onClose={handleClose} instance={editingInstance}/>
    {/if}

    <p>Here are the currently configured Beacon instances:</p>

    <div class="beacon-instances">
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
                <Button onclick={(e) => openModal(instance, e)}>Edit</Button>
                <Button onclick={(e) => pickInstance(instance, e)}  disabled={currentBeaconInstanceValue?.id === instance.id}>Select</Button>
            </button>
        {/each}
    </div>
</div>


<style lang="scss">
    .beacon-instances {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;

        .beacon-instance {
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 1rem;
            width: calc(33.333% - 1rem);
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
    }

</style>