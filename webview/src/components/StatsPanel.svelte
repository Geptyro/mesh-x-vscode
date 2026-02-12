<script>
	import { editor } from '../stores/editor.svelte.js'
	import { formatBytes } from '../lib/sceneStats.js'
	import CollapsibleSection from './CollapsibleSection.svelte'

	let { drawCalls } = $props()

	function getRows() {
		const s = editor.lastSceneStats
		if (!s) return []
		const rows = [
			['Meshes', s.meshes],
			['Vertices', s.vertices.toLocaleString()],
			['Triangles', s.triangles.toLocaleString()],
			['Materials', s.materials],
		]
		if (s.bones > 0) rows.push(['Bones', s.bones])
		if (s.morphTargets > 0) rows.push(['Morph targets', s.morphTargets])
		rows.push(['Draw calls', drawCalls])
		rows.push(['File size', formatBytes(s.byteLength)])
		return rows
	}
</script>

{#if editor.lastSceneStats}
	<div id="stats-panel">
		<CollapsibleSection id="stats" title="Stats">
			{#each getRows() as [label, value]}
				<div class="stat-row">
					<span class="stat-label">{label}</span>
					<span class="stat-value">{value}</span>
				</div>
			{/each}
		</CollapsibleSection>
	</div>
{/if}

<style>
	#stats-panel {
		border-top: 1px solid var(--vscode-panel-border, #333);
	}
	.stat-row {
		display: flex;
		justify-content: space-between;
		padding: 3px 12px;
		font-size: 11px;
	}
	.stat-label {
		color: var(--vscode-descriptionForeground, #999);
	}
	.stat-value {
		color: var(--vscode-foreground, #ccc);
		font-family: var(--vscode-editor-font-family, monospace);
	}
</style>
