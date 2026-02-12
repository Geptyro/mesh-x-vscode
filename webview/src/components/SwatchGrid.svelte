<script>
	import { editor } from '../stores/editor.svelte.js'

	let { value, onchange } = $props()

	function tileStyle(name) {
		const rgb = editor.swatchColors[name]
		if (rgb) {
			return `background-color: rgb(${Math.round(rgb[0]*255)}, ${Math.round(rgb[1]*255)}, ${Math.round(rgb[2]*255)})`
		}
		return 'background-color: #555'
	}
</script>

<div class="swatch-grid">
	{#each editor.swatchNames as name}
		<div
			class="swatch-tile"
			class:selected={name === value}
			title={name.replace(/_/g, ' ')}
			style={tileStyle(name)}
			onclick={() => onchange(name)}
		></div>
	{/each}
</div>

<style>
	.swatch-grid {
		display: grid;
		grid-template-columns: repeat(5, 18px);
		gap: 3px;
		margin-top: 2px;
	}
	.swatch-tile {
		width: 18px;
		height: 18px;
		border-radius: 3px;
		border: 2px solid transparent;
		cursor: pointer;
	}
	.swatch-tile:hover {
		border-color: var(--vscode-foreground, #ccc);
	}
	.swatch-tile.selected {
		border-color: var(--vscode-focusBorder, #007acc);
	}
</style>
