<script>
	import SwatchGrid from './SwatchGrid.svelte'
	import MaterialControl from './MaterialControl.svelte'

	let { key, def, value, onchange } = $props()

	let textareaValue = $state('')
	let textareaInvalid = $state(false)

	$effect(() => {
		if (def.type !== 'number' && def.type !== 'int' && def.type !== 'swatch' && def.type !== 'boolean' && def.type !== 'material') {
			textareaValue = JSON.stringify(value !== undefined ? value : def.default, null, 2)
			textareaInvalid = false
		}
	})

	function onSliderInput(e) {
		const v = def.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
		onchange(v)
	}

	function onNumberChange(e) {
		const v = def.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
		onchange(v)
	}

	function onTextareaChange(e) {
		try {
			const v = JSON.parse(e.target.value)
			textareaInvalid = false
			onchange(v)
		} catch {
			textareaInvalid = true
		}
	}
</script>

{#if def.type === 'number' || def.type === 'int'}
	<div class="prop-controls">
		<input
			type="range"
			class="prop-slider"
			min={def.min !== undefined ? def.min : 0}
			max={def.max !== undefined ? def.max : 10}
			step={def.type === 'int' ? 1 : (def.max - def.min) / 200}
			value={value !== undefined ? value : def.default}
			oninput={onSliderInput}
		/>
		<input
			type="number"
			class="prop-number"
			min={def.min !== undefined ? def.min : 0}
			max={def.max !== undefined ? def.max : 10}
			step={def.type === 'int' ? 1 : (def.max - def.min) / 200}
			value={value !== undefined ? value : def.default}
			onchange={onNumberChange}
		/>
	</div>
{:else if def.type === 'swatch'}
	<SwatchGrid value={value || def.default} onchange={onchange} />
{:else if def.type === 'material'}
	<MaterialControl value={value !== undefined ? value : def.default} onchange={onchange} />
{:else if def.type === 'boolean'}
	<input
		type="checkbox"
		class="prop-checkbox"
		checked={value !== undefined ? value : def.default}
		onchange={(e) => onchange(e.target.checked)}
	/>
{:else}
	<textarea
		class="prop-textarea"
		class:invalid={textareaInvalid}
		rows="3"
		value={textareaValue}
		onchange={onTextareaChange}
	></textarea>
{/if}

<style>
	.prop-controls {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.prop-slider {
		flex: 1;
		-webkit-appearance: none;
		appearance: none;
		height: 4px;
		background: var(--vscode-scrollbarSlider-background, #444);
		border-radius: 2px;
		outline: none;
	}
	.prop-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--vscode-button-background, #0e639c);
		cursor: pointer;
	}
	.prop-number {
		width: 60px;
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border: 1px solid var(--vscode-input-border, #555);
		border-radius: 2px;
		padding: 2px 4px;
		font-size: 11px;
		font-family: var(--vscode-editor-font-family, monospace);
	}
	.prop-number:focus {
		outline: 1px solid var(--vscode-focusBorder, #007acc);
	}
	.prop-checkbox {
		width: 16px;
		height: 16px;
		accent-color: var(--vscode-button-background, #0e639c);
	}
	.prop-textarea {
		width: 100%;
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border: 1px solid var(--vscode-input-border, #555);
		border-radius: 2px;
		padding: 4px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 11px;
		resize: vertical;
	}
	.prop-textarea:focus {
		outline: 1px solid var(--vscode-focusBorder, #007acc);
	}
	.prop-textarea.invalid {
		border-color: var(--vscode-inputValidation-errorBorder, #f44);
	}
</style>
