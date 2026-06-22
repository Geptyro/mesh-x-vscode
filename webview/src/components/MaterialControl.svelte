<script>
	// Editor for an inline PBR material prop (color mode): color + metalness +
	// roughness + optional glow. Emits a material object the component receives
	// as a parameter. Mirrors mesh-x normalizeMaterial's accepted shape.
	let { value, onchange } = $props()

	function rgbToHex(c) {
		const h = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')
		return '#' + h(c[0]) + h(c[1]) + h(c[2])
	}
	function colorToHex(c) {
		if (typeof c === 'string') return c
		if (Array.isArray(c)) return rgbToHex(c)
		return '#888888'
	}
	function num(v, d) { return (v === undefined || v === null) ? d : v }

	function normalize(v) {
		if (!v) return { color: '#888888', metalness: 0, roughness: 0.6, emissive: null }
		if (typeof v === 'string') return { color: v, metalness: 0, roughness: 0.6, emissive: null }
		if (Array.isArray(v)) return { color: rgbToHex(v), metalness: 0, roughness: 0.6, emissive: null }
		return {
			color: colorToHex(v.color),
			metalness: num(v.metalness, 0),
			roughness: num(v.roughness, 0.6),
			emissive: v.emissive ? colorToHex(v.emissive) : null,
		}
	}

	const m = $derived(normalize(value))

	function emit(patch) {
		const next = { color: m.color, metalness: m.metalness, roughness: m.roughness }
		if (m.emissive) next.emissive = m.emissive
		Object.assign(next, patch)
		if (next.emissive === '#000000') delete next.emissive
		onchange(next)
	}
</script>

<div class="mat">
	<label class="row">
		<span class="lbl">color</span>
		<input type="color" value={m.color} oninput={(e) => emit({ color: e.target.value })} />
	</label>
	<label class="row">
		<span class="lbl">metal {m.metalness.toFixed(2)}</span>
		<input type="range" min="0" max="1" step="0.01" value={m.metalness}
			oninput={(e) => emit({ metalness: +e.target.value })} />
	</label>
	<label class="row">
		<span class="lbl">rough {m.roughness.toFixed(2)}</span>
		<input type="range" min="0" max="1" step="0.01" value={m.roughness}
			oninput={(e) => emit({ roughness: +e.target.value })} />
	</label>
	<label class="row">
		<span class="lbl">glow</span>
		<input type="color" value={m.emissive || '#000000'}
			oninput={(e) => emit({ emissive: e.target.value })} />
	</label>
</div>

<style>
	.mat { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
	.row { display: flex; align-items: center; gap: 8px; }
	.lbl { flex: 0 0 78px; font-size: 11px; color: var(--vscode-descriptionForeground, #999); }
	.row input[type="range"] { flex: 1; min-width: 0; }
	.row input[type="color"] {
		width: 36px; height: 20px; padding: 0; border: none; background: none; cursor: pointer;
	}
</style>
