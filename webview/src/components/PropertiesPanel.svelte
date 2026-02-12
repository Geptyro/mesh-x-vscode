<script>
	import { editor } from '../stores/editor.svelte.js'
	import { postMessage } from '../stores/messages.svelte.js'
	import CollapsibleSection from './CollapsibleSection.svelte'
	import PropControl from './PropControl.svelte'

	function onChange(key, v) {
		editor.values[key] = v
		postMessage({ type: 'propChanged', prop: key, value: v })
	}
</script>

{#if Object.keys(editor.schema).length > 0}
	<div id="props-panel">
		<CollapsibleSection id="properties" title="Properties">
			{#each Object.entries(editor.schema) as [key, def]}
				<div class="prop-row">
					<label class="prop-label">{key}</label>
					<PropControl {key} {def} value={editor.values[key]} onchange={(v) => onChange(key, v)} />
				</div>
			{/each}
		</CollapsibleSection>
	</div>
{/if}

<style>
	#props-panel {
		padding: 0 0 12px 0;
	}
	.prop-row {
		padding: 6px 12px;
		overflow: hidden;
		border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
	}
	.prop-label {
		display: block;
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		margin-bottom: 4px;
	}
</style>
