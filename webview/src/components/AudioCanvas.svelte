<script>
	import { onMount, onDestroy } from 'svelte'
	import { editor } from '../stores/editor.svelte.js'
	import { postMessage } from '../stores/messages.svelte.js'

	let canvas = $state(null)
	let ctx = $state(null)
	let analyser = $state(null)
	let soundModule = $state(null)
	let soundExports = $state([])
	let activeLoops = $state({})
	let animFrame = null
	let canvasCtx = null

	// Inline synth utilities — these get prepended to sound source since
	// import statements won't resolve from Blob URLs
	const SYNTH_INLINE = `
function whiteNoise(ctx, duration) {
	var sampleRate = ctx.sampleRate;
	var length = Math.ceil(sampleRate * duration);
	var buffer = ctx.createBuffer(1, length, sampleRate);
	var data = buffer.getChannelData(0);
	for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	var source = ctx.createBufferSource();
	source.buffer = buffer;
	return source;
}
function envelope(param, opts, startTime) {
	var t = startTime !== undefined ? startTime : param.context ? param.context.currentTime : 0;
	param.setValueAtTime(0, t);
	param.linearRampToValueAtTime(opts.peak, t + opts.attack);
	param.linearRampToValueAtTime(opts.sustain * opts.peak, t + opts.attack + opts.decay);
	param.linearRampToValueAtTime(0, t + opts.attack + opts.decay + opts.release);
}
function connectChain(nodes) {
	for (var i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
	return nodes[nodes.length - 1];
}
`

	// Load sound module from source string via Blob URL
	async function loadSoundModule(source) {
		if (!source) {
			soundModule = null
			soundExports = []
			return
		}
		try {
			// Strip import lines and prepend inline synth utilities
			const stripped = source.replace(/^import\s+.*$/gm, '')
			const combined = SYNTH_INLINE + stripped
			const blob = new Blob([combined], { type: 'text/javascript' })
			const url = URL.createObjectURL(blob)
			const mod = await import(/* @vite-ignore */ url)
			URL.revokeObjectURL(url)
			soundModule = mod
			soundExports = Object.keys(mod).filter(k => typeof mod[k] === 'function')
		} catch (err) {
			console.error('Failed to load sound module:', err)
			soundModule = null
			soundExports = []
		}
	}

	// React to soundSource changes
	$effect(() => {
		loadSoundModule(editor.soundSource)
	})

	async function ensureAudioContext() {
		if (!ctx) {
			ctx = new AudioContext()
			analyser = ctx.createAnalyser()
			analyser.fftSize = 2048
			analyser.connect(ctx.destination)
		}
		// Browsers start the context suspended until a user gesture; await the
		// resume so the graph is actually running before we build/start nodes.
		if (ctx.state === 'suspended') await ctx.resume()
		return { ctx, analyser }
	}

	async function playSound(name) {
		if (!soundModule || !soundModule[name]) return

		// If it's a looping sound that's already active, stop it
		if (activeLoops[name]) {
			activeLoops[name].stop()
			activeLoops = { ...activeLoops }
			delete activeLoops[name]
			return
		}

		const { ctx: audioCtx, analyser: an } = await ensureAudioContext()

		// Get current params for this sound
		const params = editor.soundValues[name] || {}

		// Create a gain node to route through analyser
		const routeGain = audioCtx.createGain()
		routeGain.connect(an)

		// Route the sound through the analyser by proxying ctx.destination.
		// Must use a real Proxy (NOT Object.create(audioCtx)): Web Audio factory
		// methods brand-check their receiver, so they throw "Illegal invocation"
		// unless called with `this` === the real AudioContext. Bind every method
		// to the real ctx and only override `destination` -> the analyser gain.
		const proxyCtx = new Proxy(audioCtx, {
			get(target, prop) {
				if (prop === 'destination') return routeGain
				const value = target[prop]
				return typeof value === 'function' ? value.bind(target) : value
			},
		})

		const result = soundModule[name](proxyCtx, params)

		// If it returns a stop handle, it's a looping sound
		if (result && typeof result.stop === 'function') {
			activeLoops = { ...activeLoops, [name]: result }
		}
	}

	function isLoopActive(name) {
		return !!activeLoops[name]
	}

	function onSoundPropChange(soundName, propName, value) {
		if (!editor.soundValues[soundName]) editor.soundValues[soundName] = {}
		editor.soundValues[soundName][propName] = value
		// Live-retune a currently-playing loop so slider drags are heard in real time
		// (the sound's stop handle may expose setParam(key, value)).
		const handle = activeLoops[soundName]
		if (handle && typeof handle.setParam === 'function') handle.setParam(propName, value)
		postMessage({ type: 'soundPropChanged', sound: soundName, prop: propName, value })
	}

	// Waveform drawing
	function drawWaveform() {
		if (!canvas || !canvasCtx) {
			animFrame = requestAnimationFrame(drawWaveform)
			return
		}

		const w = canvas.width
		const h = canvas.height
		canvasCtx.fillStyle = '#1a1a2e'
		canvasCtx.fillRect(0, 0, w, h)

		if (analyser) {
			const bufferLength = analyser.frequencyBinCount
			const dataArray = new Uint8Array(bufferLength)
			analyser.getByteTimeDomainData(dataArray)

			canvasCtx.lineWidth = 2
			canvasCtx.strokeStyle = '#00d4aa'
			canvasCtx.beginPath()

			const sliceWidth = w / bufferLength
			let x = 0
			for (let i = 0; i < bufferLength; i++) {
				const v = dataArray[i] / 128.0
				const y = (v * h) / 2
				if (i === 0) canvasCtx.moveTo(x, y)
				else canvasCtx.lineTo(x, y)
				x += sliceWidth
			}
			canvasCtx.lineTo(w, h / 2)
			canvasCtx.stroke()
		} else {
			// Flat line
			canvasCtx.lineWidth = 2
			canvasCtx.strokeStyle = '#00d4aa33'
			canvasCtx.beginPath()
			canvasCtx.moveTo(0, h / 2)
			canvasCtx.lineTo(w, h / 2)
			canvasCtx.stroke()
		}

		animFrame = requestAnimationFrame(drawWaveform)
	}

	function setupCanvas() {
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		canvas.width = rect.width
		canvas.height = rect.height
		canvasCtx = canvas.getContext('2d')
	}

	onMount(() => {
		setupCanvas()
		animFrame = requestAnimationFrame(drawWaveform)
		window.addEventListener('resize', setupCanvas)
	})

	onDestroy(() => {
		if (animFrame) cancelAnimationFrame(animFrame)
		window.removeEventListener('resize', setupCanvas)
		// Stop any active loops
		for (const handle of Object.values(activeLoops)) {
			if (handle && handle.stop) handle.stop()
		}
		if (ctx) ctx.close()
	})
</script>

<div class="audio-canvas">
	<div class="sound-buttons">
		{#each soundExports as name}
			<button
				class="sound-btn"
				class:active={isLoopActive(name)}
				onclick={() => playSound(name)}
			>
				{isLoopActive(name) ? '\u25A0' : '\u25B6'} {name}
			</button>
		{/each}
		{#if soundExports.length === 0}
			<div class="no-sounds">No sound functions found</div>
		{/if}
	</div>

	<div class="waveform-container">
		<canvas bind:this={canvas} class="waveform-canvas"></canvas>
	</div>

	{#if editor.soundSchema}
		<div class="sound-props">
			{#each Object.entries(editor.soundSchema) as [soundName, soundDef]}
				{#if soundDef.props && Object.keys(soundDef.props).length > 0}
					<div class="sound-props-group">
						<div class="sound-props-header">{soundName}</div>
						{#each Object.entries(soundDef.props) as [propName, propDef]}
							{#if propDef.type === 'number'}
								<div class="sound-prop-row">
									<label class="sound-prop-label">{propName}</label>
									<div class="sound-prop-controls">
										<input
											type="range"
											class="prop-slider"
											min={propDef.min !== undefined ? propDef.min : 0}
											max={propDef.max !== undefined ? propDef.max : 1}
											step={(propDef.max - propDef.min) / 200}
											value={editor.soundValues[soundName]?.[propName] ?? propDef.default ?? 0}
											oninput={(e) => onSoundPropChange(soundName, propName, parseFloat(e.target.value))}
										/>
										<span class="sound-prop-value">
											{(editor.soundValues[soundName]?.[propName] ?? propDef.default ?? 0).toFixed(2)}
										</span>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.audio-canvas {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--vscode-editor-background, #1e1e1e);
	}

	.sound-buttons {
		display: flex;
		gap: 8px;
		padding: 12px;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--vscode-panel-border, #333);
	}

	.sound-btn {
		padding: 6px 14px;
		font-size: 12px;
		font-family: var(--vscode-font-family, sans-serif);
		color: var(--vscode-button-foreground, #fff);
		background: var(--vscode-button-background, #0e639c);
		border: none;
		border-radius: 3px;
		cursor: pointer;
	}
	.sound-btn:hover {
		background: var(--vscode-button-hoverBackground, #1177bb);
	}
	.sound-btn.active {
		background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
	}

	.no-sounds {
		color: var(--vscode-descriptionForeground, #999);
		font-size: 12px;
		padding: 4px;
	}

	.waveform-container {
		flex: 1;
		min-height: 120px;
		padding: 12px;
	}
	.waveform-canvas {
		width: 100%;
		height: 100%;
		border-radius: 4px;
	}

	.sound-props {
		border-top: 1px solid var(--vscode-panel-border, #333);
		padding: 8px 12px;
		max-height: 200px;
		overflow-y: auto;
	}
	.sound-props-group {
		margin-bottom: 8px;
	}
	.sound-props-header {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--vscode-sideBarTitle-foreground, #bbb);
		margin-bottom: 6px;
	}
	.sound-prop-row {
		padding: 4px 0;
	}
	.sound-prop-label {
		display: block;
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		margin-bottom: 2px;
	}
	.sound-prop-controls {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.sound-prop-value {
		font-size: 11px;
		font-family: var(--vscode-editor-font-family, monospace);
		color: var(--vscode-input-foreground, #ccc);
		min-width: 40px;
	}
</style>
