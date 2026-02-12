<script>
	import { editor } from '../stores/editor.svelte.js'
	import { postMessage } from '../stores/messages.svelte.js'
	import CollapsibleSection from './CollapsibleSection.svelte'

	let nameInput = $state('')

	function doCreate() {
		const name = nameInput.trim()
		if (name) {
			postMessage({ type: 'createPreview', name })
			nameInput = ''
		}
	}

	function onKeydown(e) {
		if (e.key === 'Enter') doCreate()
	}
</script>

{#if !editor.isPreview}
	<div id="previews-panel">
		<CollapsibleSection id="previews" title="Previews">
			{#each editor.previewFiles as pf}
				<div class="preview-row">
					<a
						class="preview-link"
						href="#"
						onclick={(e) => { e.preventDefault(); postMessage({ type: 'openPreview', path: pf.path }) }}
					>{pf.name}</a>
				</div>
			{/each}

			<div class="create-preview-row">
				<input
					type="text"
					class="create-preview-input"
					placeholder="Preview name"
					bind:value={nameInput}
					onkeydown={onKeydown}
				/>
				<button class="create-preview-btn" onclick={doCreate}>Create</button>
			</div>
		</CollapsibleSection>
	</div>
{/if}

<style>
	#previews-panel {
		border-top: 1px solid var(--vscode-panel-border, #333);
	}
	.preview-row {
		padding: 4px 12px;
	}
	.preview-link {
		color: var(--vscode-textLink-foreground, #3794ff);
		text-decoration: none;
		font-size: 12px;
		cursor: pointer;
	}
	.preview-link:hover {
		text-decoration: underline;
		color: var(--vscode-textLink-activeForeground, #3794ff);
	}
	.create-preview-row {
		display: flex;
		gap: 4px;
		padding: 8px 12px;
	}
	.create-preview-input {
		flex: 1;
		min-width: 0;
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border: 1px solid var(--vscode-input-border, #555);
		border-radius: 2px;
		padding: 3px 6px;
		font-size: 11px;
		font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
	}
	.create-preview-input:focus {
		outline: 1px solid var(--vscode-focusBorder, #007acc);
	}
	.create-preview-btn {
		flex-shrink: 0;
		padding: 3px 8px;
		background: var(--vscode-button-secondaryBackground, #3a3a3a);
		color: var(--vscode-button-secondaryForeground, #ccc);
		border: none;
		border-radius: 2px;
		cursor: pointer;
		font-size: 11px;
	}
	.create-preview-btn:hover {
		background: var(--vscode-button-secondaryHoverBackground, #454545);
	}
</style>
