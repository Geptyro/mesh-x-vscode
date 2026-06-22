<script>
	import { onMount } from 'svelte'
	import { onMessage } from './stores/messages.svelte.js'
	import { editor, applyInit, applyUpdateSchema, applyUpdateSound, applyUpdateSwatches } from './stores/editor.svelte.js'
	import { anim, applyAnimationData } from './stores/animation.svelte.js'
	import PropertiesPanel from './components/PropertiesPanel.svelte'
	import MountsPanel from './components/MountsPanel.svelte'
	import PreviewsPanel from './components/PreviewsPanel.svelte'
	import AnimationsPanel from './components/AnimationsPanel.svelte'
	import StatsPanel from './components/StatsPanel.svelte'
	import ThreeCanvas from './components/ThreeCanvas.svelte'
	import AudioCanvas from './components/AudioCanvas.svelte'
	import StatusBar from './components/StatusBar.svelte'

	let sceneApi = null
	let drawCalls = $state(0)
	let hasAudio = $derived(!!editor.soundSource)

	function onSceneReady(api) {
		sceneApi = api

		// Poll draw calls every second for stats display
		setInterval(() => {
			if (sceneApi) drawCalls = sceneApi.getDrawCalls()
		}, 1000)
	}

	onMount(() => {
		onMessage('init', (msg) => {
			applyInit(msg)
		})

		onMessage('updateSchema', (msg) => {
			applyUpdateSchema(msg)
		})

		onMessage('updateSwatches', (msg) => {
			applyUpdateSwatches(msg)
			// Atlas PNGs were regenerated → drop the cached material so the next
			// model load re-skins with the new textures.
			if (sceneApi && sceneApi.refreshAtlas) sceneApi.refreshAtlas()
		})

		onMessage('updateModel', (msg) => {
			if (msg.mountTree) {
				editor.mountTree = msg.mountTree
			}
			applyAnimationData(msg)
			if (sceneApi) sceneApi.loadGLB(msg.glb)
		})

		onMessage('updatePreviewFiles', (msg) => {
			editor.previewFiles = msg.previewFiles || []
		})

		onMessage('updateSound', (msg) => {
			applyUpdateSound(msg)
		})

		onMessage('building', () => {
			editor.statusText = 'Building...'
		})

		onMessage('error', (msg) => {
			editor.statusText = 'Error: ' + msg.message
		})
	})
</script>

<div id="left-panel">
	<PropertiesPanel />
	<MountsPanel />
	<PreviewsPanel />
	<AnimationsPanel morphMesh={sceneApi?.getMorphMesh()} onSkeletonToggle={() => {}} />
	<StatsPanel {drawCalls} />
</div>
<div id="main-area">
	{#if hasAudio}
		<div class="tab-bar">
			<button
				class="tab"
				class:active={editor.activeTab === '3d'}
				onclick={() => editor.activeTab = '3d'}
			>3D Preview</button>
			<button
				class="tab"
				class:active={editor.activeTab === 'audio'}
				onclick={() => editor.activeTab = 'audio'}
			>Audio Preview</button>
		</div>
	{/if}
	<div class="tab-content">
		{#if editor.activeTab === '3d'}
			<ThreeCanvas {onSceneReady}>
				<StatusBar />
			</ThreeCanvas>
		{:else}
			<AudioCanvas />
		{/if}
	</div>
</div>

<style>
	#main-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.tab-bar {
		display: flex;
		gap: 0;
		background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
		border-bottom: 1px solid var(--vscode-panel-border, #333);
		flex-shrink: 0;
	}
	.tab {
		padding: 7px 16px;
		font-size: 12px;
		font-family: var(--vscode-font-family, sans-serif);
		color: var(--vscode-tab-inactiveForeground, #999);
		background: var(--vscode-tab-inactiveBackground, transparent);
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
	}
	.tab:hover {
		color: var(--vscode-tab-activeForeground, #fff);
	}
	.tab.active {
		color: var(--vscode-tab-activeForeground, #fff);
		border-bottom-color: var(--vscode-focusBorder, #007acc);
		background: var(--vscode-tab-activeBackground, var(--vscode-editor-background, #1e1e1e));
	}
	.tab-content {
		flex: 1;
		position: relative;
		overflow: hidden;
	}
</style>
