<script>
	import { editor } from '../stores/editor.svelte.js'
	import CollapsibleSection from './CollapsibleSection.svelte'
	import MountNode from './MountNode.svelte'
</script>

{#if editor.mountTree.length > 0}
	<div id="mounts-panel">
		<CollapsibleSection id="mounts" title="Mounts">
			{#each editor.mountTree as node}
				<MountNode {node} pathArr={[node.name]} depth={0} />
			{/each}
		</CollapsibleSection>
	</div>
{/if}

<style>
	#mounts-panel {
		border-top: 1px solid var(--vscode-panel-border, #333);
	}
</style>
