<script>
	import { anim } from '../stores/animation.svelte.js'

	let { morphMesh } = $props()

	function toggleAnim(name) {
		const next = new Set(anim.activeMorphAnims)
		if (next.has(name)) {
			next.delete(name)
		} else {
			next.add(name)
		}
		anim.activeMorphAnims = next
	}

	function selectNone() {
		anim.activeMorphAnims = new Set()
		if (morphMesh) {
			for (let i = 0; i < morphMesh.morphTargetInfluences.length; i++) {
				morphMesh.morphTargetInfluences[i] = 0
			}
		}
	}

	function onSpeedInput(e) {
		anim.morphAnimSpeed = parseFloat(e.target.value)
	}
</script>

<div class="proc-anim-btns">
	<button
		class="proc-anim-btn"
		class:active={anim.activeMorphAnims.size === 0}
		onclick={selectNone}
	>None</button>
	{#each Object.entries(anim.morphAnims) as [name, targets]}
		<button
			class="proc-anim-btn"
			class:active={anim.activeMorphAnims.has(name)}
			onclick={() => toggleAnim(name)}
		>{name} ({targets.length}f)</button>
	{/each}
</div>

<div class="proc-speed-row">
	<label class="proc-layer-label">Speed</label>
	<input
		type="range"
		class="prop-slider"
		min="0"
		max="3"
		step="0.1"
		value={anim.morphAnimSpeed}
		oninput={onSpeedInput}
	/>
	<span class="proc-speed-val">{anim.morphAnimSpeed.toFixed(1)}x</span>
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
	.proc-speed-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
	}
	.proc-layer-label {
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		min-width: 36px;
	}
	.proc-speed-val {
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		min-width: 28px;
		text-align: right;
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
</style>
