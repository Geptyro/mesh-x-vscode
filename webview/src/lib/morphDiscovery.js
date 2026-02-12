/**
 * Parse morphTargetDictionary names using {animName}_{frameIndex} convention.
 * Returns { animName: [targetIndex0, targetIndex1, ...] } sorted by frame, or null.
 */
export function discoverMorphAnims(dict) {
	const groups = {}
	for (const [name, index] of Object.entries(dict)) {
		const match = name.match(/^(.+)_(\d+)$/)
		if (match) {
			const animName = match[1]
			const frame = parseInt(match[2])
			if (!groups[animName]) groups[animName] = []
			groups[animName].push({ frame, index })
		}
	}
	const result = {}
	for (const [name, frames] of Object.entries(groups)) {
		if (frames.length < 2) continue
		frames.sort((a, b) => a.frame - b.frame)
		result[name] = frames.map(f => f.index)
	}
	return Object.keys(result).length > 0 ? result : null
}
