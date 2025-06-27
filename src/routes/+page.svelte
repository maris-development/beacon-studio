<script>
    import {beaconInstances} from '$lib/stores/config';
    import { onMount } from 'svelte';
    import { Button } from "$lib/components/ui/button/index.js";

    const beaconInstanceArray = $beaconInstances;

    onMount(() => {


    });


</script>

<svelte:head>
	<title>Beacon Studio</title>
</svelte:head>

<div class="page-container">
	<h1 class="text-red-100">Welcome to Beacon Studio</h1>

	<p>
		Visit <a href="https://maris-development.github.io/beacon/">maris-development.github.io/beacon/</a> to read the documentation.
	</p>

    <h2>Beacon instances</h2>

    <Button href="/add-instance">
        Add instance
    </Button>

    <p>Here are the currently configured Beacon instances:</p>

    <div class="beacon-instances">
        {#each beaconInstanceArray as instance}
            <div class="beacon-instance" data-id="{instance.id}">
                <h3>{instance.name}</h3>
                <p>URL: <a href={instance.url} target="_blank">{instance.url}</a></p>
                {#if instance.description.length > 0 }
                    <p>{instance.description}</p>                   
                {/if}
                <p>Last update: {instance.updatedAt}</p>
            </div>
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

            h3 {
                margin-top: 0;
            }

            p {
                margin: 0.5rem 0;
            }
        }
    }

</style>