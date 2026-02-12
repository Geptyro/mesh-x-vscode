<script>
	import { anim } from '../stores/animation.svelte.js'

	let { onSkeletonToggle } = $props()

	$effect(() => {
		// keep skeleton visibility in sync
		if (onSkeletonToggle) onSkeletonToggle(anim.skeletonVisible)
	})

	function selectAnim(key) {
		anim.currentProceduralAnim = key
		anim.layerLegs = ''
		anim.layerUpper = ''
	}

	function selectNone() {
		anim.currentProceduralAnim = null
		anim.layerLegs = ''
		anim.layerUpper = ''
	}

	function onLegsChange(e) {
		anim.layerLegs = e.target.value
		if (anim.layerLegs || anim.layerUpper) anim.currentProceduralAnim = null
	}

	function onUpperChange(e) {
		anim.layerUpper = e.target.value
		if (anim.layerLegs || anim.layerUpper) anim.currentProceduralAnim = null
	}

	function onSpeedInput(e) {
		anim.animSpeed = parseFloat(e.target.value)
	}

	function isNoneActive() {
		return !anim.currentProceduralAnim && !anim.layerLegs && !anim.layerUpper
	}
</script>

<div class="proc-anim-btns">
	<button
		class="proc-anim-btn"
		class:active={isNoneActive()}
		onclick={selectNone}
	>None</button>
	{#each Object.entries(anim.proceduralAnims) as [key, entry]}
		<button
			class="proc-anim-btn"
			class:active={anim.currentProceduralAnim === key}
			onclick={() => selectAnim(key)}
		>{entry.label}</button>
	{/each}
</div>

<div class="proc-section-label">Layers</div>
<div class="proc-layer-section">
	<div class="proc-layer-row">
		<label class="proc-layer-label">Legs</label>
		<select class="proc-layer-select" value={anim.layerLegs} onchange={onLegsChange}>
			<option value="">(None)</option>
			{#each Object.entries(anim.proceduralAnims) as [key, entry]}
				<option value={key}>{entry.label}</option>
			{/each}
		</select>
	</div>
	<div class="proc-layer-row">
		<label class="proc-layer-label">Upper</label>
		<select class="proc-layer-select" value={anim.layerUpper} onchange={onUpperChange}>
			<option value="">(None)</option>
			{#each Object.entries(anim.proceduralAnims) as [key, entry]}
				<option value={key}>{entry.label}</option>
			{/each}
		</select>
	</div>
</div>

<div class="proc-speed-row">
	<label class="proc-layer-label">Speed</label>
	<input
		type="range"
		class="prop-slider"
		min="0"
		max="3"
		step="0.1"
		value={anim.animSpeed}
		oninput={onSpeedInput}
	/>
	<span class="proc-speed-val">{anim.animSpeed.toFixed(1)}x</span>
</div>

<div class="proc-skel-row">
	<input
		type="checkbox"
		class="prop-checkbox"
		id="skel-helper-toggle"
		checked={anim.skeletonVisible}
		onchange={(e) => anim.skeletonVisible = e.target.checked}
	/>
	<label class="proc-skel-label" for="skel-helper-toggle">Show skeleton</label>
</div>

<style>
	.proc-anim-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		padding: 6px 12px;
	}
	.proc-anim-btn {
		padding: 3px 8px;
		font-size: 11px;
		background: var(--vscode-button-secondaryBackground, #3a3a3a);
		color: var(--vscode-button-secondaryForeground, #ccc);
		border: 1px solid transparent;
		border-radius: 3px;
		cursor: pointer;
		white-space: nowrap;
	}
	.proc-anim-btn:hover {
		background: var(--vscode-button-secondaryHoverBackground, #454545);
	}
	.proc-anim-btn.active {
		background: var(--vscode-button-background, #0e639c);
		color: var(--vscode-button-foreground, #fff);
	}
	.proc-section-label {
		padding: 6px 12px 2px 12px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--vscode-descriptionForeground, #888);
	}
	.proc-layer-section {
		padding: 0 12px 4px 12px;
	}
	.proc-layer-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 0;
	}
	.proc-layer-label {
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		min-width: 36px;
	}
	.proc-layer-select {
		flex: 1;
		min-width: 0;
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border: 1px solid var(--vscode-input-border, #555);
		border-radius: 2px;
		padding: 2px 4px;
		font-size: 11px;
		font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
	}
	.proc-layer-select:focus {
		outline: 1px solid var(--vscode-focusBorder, #007acc);
	}
	.proc-speed-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
	}
	.proc-speed-val {
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		min-width: 28px;
		text-align: right;
	}
	.proc-skel-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px 8px 12px;
	}
	.proc-skel-label {
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		cursor: pointer;
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
	.prop-checkbox {
		width: 16px;
		height: 16px;
		accent-color: var(--vscode-button-background, #0e639c);
	}
</style>
