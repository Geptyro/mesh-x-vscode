<script>
	import { anim } from '../stores/animation.svelte.js'
	import CollapsibleSection from './CollapsibleSection.svelte'
	import ProceduralAnimPanel from './ProceduralAnimPanel.svelte'
	import MorphAnimPanel from './MorphAnimPanel.svelte'
	import ClipAnimPanel from './ClipAnimPanel.svelte'

	let { morphMesh, onSkeletonToggle } = $props()

	function hasProc() {
		return anim.proceduralAnims && Object.keys(anim.proceduralAnims).length > 0
	}

	function hasMorph() {
		return anim.morphAnims && Object.keys(anim.morphAnims).length > 0
	}

	function hasClips() {
		return anim.clipActions.length > 0
	}
</script>

{#if hasProc() || hasMorph() || hasClips()}
	<div id="animation-list">
		<CollapsibleSection id={hasProc() ? 'proc-anims' : hasMorph() ? 'morph-anims' : 'clip-anims'} title="Animations">
			{#if hasProc()}
				<ProceduralAnimPanel {onSkeletonToggle} />
			{:else if hasMorph()}
				<MorphAnimPanel {morphMesh} />
			{:else if hasClips()}
				<ClipAnimPanel />
			{/if}
		</CollapsibleSection>
	</div>
{/if}

<style>
	#animation-list {
		flex-shrink: 0;
		border-top: 1px solid var(--vscode-panel-border, #333);
	}
</style>
