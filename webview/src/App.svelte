<script>
	import { onMount } from 'svelte'
	import { onMessage } from './stores/messages.svelte.js'
	import { editor, applyInit, applyUpdateSchema } from './stores/editor.svelte.js'
	import { anim, applyAnimationData } from './stores/animation.svelte.js'
	import PropertiesPanel from './components/PropertiesPanel.svelte'
	import MountsPanel from './components/MountsPanel.svelte'
	import PreviewsPanel from './components/PreviewsPanel.svelte'
	import AnimationsPanel from './components/AnimationsPanel.svelte'
	import StatsPanel from './components/StatsPanel.svelte'
	import ThreeCanvas from './components/ThreeCanvas.svelte'
	import StatusBar from './components/StatusBar.svelte'

	let sceneApi = null
	let drawCalls = $state(0)

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
<ThreeCanvas {onSceneReady}>
	<StatusBar />
</ThreeCanvas>
