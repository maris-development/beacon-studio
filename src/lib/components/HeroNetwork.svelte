<!-- Percentages need an svg without a viewBox. They resolve against the element box. -->
<div class="hero-glow" aria-hidden="true"></div>
<svg class="hero-network" aria-hidden="true" focusable="false">
	<g class="hero-network-lines">
		<line x1="5%" y1="22%" x2="31%" y2="15%"></line>
		<line x1="31%" y1="15%" x2="52%" y2="35%"></line>
		<line x1="52%" y1="35%" x2="68%" y2="12%"></line>
		<line x1="68%" y1="12%" x2="80%" y2="22%"></line>
		<line x1="80%" y1="22%" x2="95%" y2="18%"></line>
		<line x1="31%" y1="15%" x2="23%" y2="42%"></line>
		<line x1="23%" y1="42%" x2="42%" y2="51%"></line>
		<line x1="42%" y1="51%" x2="52%" y2="35%"></line>
		<line x1="52%" y1="35%" x2="63%" y2="87%"></line>
		<line x1="63%" y1="87%" x2="85%" y2="79%"></line>
		<line x1="85%" y1="79%" x2="95%" y2="18%"></line>
		<line x1="5%" y1="22%" x2="7%" y2="65%"></line>
		<line x1="7%" y1="65%" x2="13%" y2="83%"></line>
		<line x1="13%" y1="83%" x2="46%" y2="95%"></line>
		<line x1="46%" y1="95%" x2="42%" y2="51%"></line>
		<line x1="63%" y1="87%" x2="72%" y2="96%"></line>
		<line x1="72%" y1="96%" x2="90%" y2="92%"></line>
		<line x1="90%" y1="92%" x2="85%" y2="79%"></line>
		<line x1="23%" y1="42%" x2="13%" y2="83%"></line>
	</g>
	<g class="hero-network-dots">
		<circle cx="5%" cy="22%" r="4.5"></circle>
		<circle cx="31%" cy="15%" r="3.5"></circle>
		<circle cx="52%" cy="35%" r="4"></circle>
		<circle cx="68%" cy="12%" r="3"></circle>
		<circle cx="80%" cy="22%" r="4"></circle>
		<circle cx="95%" cy="18%" r="3.5"></circle>
		<circle cx="13%" cy="83%" r="4.5"></circle>
		<circle cx="42%" cy="51%" r="3"></circle>
		<circle cx="63%" cy="87%" r="4"></circle>
		<circle cx="85%" cy="79%" r="4"></circle>
		<circle cx="7%" cy="65%" r="3.5"></circle>
		<circle cx="46%" cy="95%" r="3"></circle>
		<circle cx="72%" cy="96%" r="4"></circle>
		<circle cx="90%" cy="92%" r="3.5"></circle>
		<circle cx="23%" cy="42%" r="4"></circle>
	</g>
</svg>

<style lang="scss">
	// Decorative layers. A negative z-index keeps them under the page content.
	.hero-glow,
	.hero-network {
		--network-line: rgba(51, 65, 85, 0.1);
		--network-dot: rgba(45, 212, 191, 0.55);
		--network-glow-a: rgba(45, 212, 191, 0.16);
		--network-glow-b: rgba(139, 92, 246, 0.14);

		position: fixed;
		pointer-events: none;
		z-index: -1;

		:global(.dark) & {
			--network-line: rgba(226, 232, 240, 0.1);
			--network-dot: rgba(45, 212, 191, 0.45);
			--network-glow-a: rgba(45, 212, 191, 0.12);
			--network-glow-b: rgba(139, 92, 246, 0.12);
		}
	}

	.hero-glow {
		inset: -20% -10% auto -10%;
		height: 140%;
		background:
			radial-gradient(35% 45% at 27% 30%, var(--network-glow-a), transparent 68%),
			radial-gradient(32% 42% at 37% 36%, var(--network-glow-b), transparent 68%);
	}

	.hero-network {
		inset: 0;
		width: 100%;
		height: 100%;

		.hero-network-lines line {
			stroke: var(--network-line);
			stroke-width: 1;
		}

		.hero-network-dots circle {
			fill: var(--network-dot);
		}
	}
</style>
