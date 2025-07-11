<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
</script>

<div class="@container/main flex flex-1 flex-col gap-2">
	<div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
		<div class="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
			<Card.Root class="@container/card">
				<Card.Header>
					<Card.Description>Beacon Version</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
						1.1.0
					</Card.Title>
				</Card.Header>
				<Card.Footer class="flex-col items-start gap-1.5 text-sm">
					<div class="line-clamp-1 flex gap-2 font-medium">Release Date: 2022-01-01</div>
					<div class="text-muted-foreground">Edition: Community</div>
					<div class="text-muted-foreground">License: Apache 2.0</div>
				</Card.Footer>
			</Card.Root>
			<Card.Root class="@container/card">
				<Card.Header>
					<Card.Description>CPU usage</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
						46%
					</Card.Title>
				</Card.Header>
				<Card.Footer class="flex-col items-start gap-1.5 text-sm">
					<div class="line-clamp-1 flex gap-2 font-medium">CPU brand: Intel</div>
					<div class="text-muted-foreground">Vendor: Intel Xeon Gold 6442Y</div>
					<div class="text-muted-foreground">Frequency: 4.0GHz</div>
				</Card.Footer>
			</Card.Root>
			<Card.Root class="@container/card">
				<Card.Header>
					<Card.Description>Total Memory</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
						128GB
					</Card.Title>
				</Card.Header>
				<Card.Footer class="flex-col items-start gap-1.5 text-sm">
					<div class="line-clamp-1 flex gap-2 font-medium">Free memory: 112.5GB</div>
					<div class="text-muted-foreground">Used Memory: 15.5GB</div>
				</Card.Footer>
			</Card.Root>
			<Card.Root class="@container/card">
				<Card.Header>
					<Card.Description>OS</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
						Linux
					</Card.Title>
				</Card.Header>
				<Card.Footer class="flex-col items-start gap-1.5 text-sm">
					<div class="line-clamp-1 flex gap-2 font-medium">OS version: Ubuntu 22.04</div>
					<div class="text-muted-foreground">Kernel: 5.15.0-46-generic</div>
				</Card.Footer>
			</Card.Root>
			<Card.Root class="@container/card">
				<Card.Header>
					<Card.Description>Uptime</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
						12 days
					</Card.Title>
				</Card.Header>
				<Card.Footer class="flex-col items-start gap-1.5 text-sm">
					<div class="text-muted-foreground">Startup Timestamp: 2025-01-01T12:00:00</div>
				</Card.Footer>
			</Card.Root>
			<Card.Root class="@container/card">
				<Card.Header>
					<Card.Description>Disk Usage</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
						1.76TB
					</Card.Title>
				</Card.Header>
				<Card.Footer class="flex-col items-start gap-1.5 text-sm">
					<div class="text-muted-foreground">Datasets: 1.56TB</div>
					<div class="text-muted-foreground">Data Tables: 200GB</div>
				</Card.Footer>
			</Card.Root>
		</div>
	</div>
	<div class="bg-muted m-4 min-h-[100vh] flex-1 rounded-xl md:min-h-min"></div>
</div>
