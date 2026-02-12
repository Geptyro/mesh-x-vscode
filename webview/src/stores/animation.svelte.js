export const anim = $state({
	proceduralAnims: null,
	proceduralMasks: null,
	proceduralRestPose: null,
	proceduralChains: null,
	currentProceduralAnim: null,
	layerLegs: '',
	layerUpper: '',
	animSpeed: 1.0,

	morphAnims: null,
	activeMorphAnims: new Set(),
	morphAnimSpeed: 1.0,

	clipActions: [],
	skeletonVisible: false,
})

export function applyAnimationData(msg) {
	if (msg.animations) {
		const entries = {}
		for (const [key, entry] of Object.entries(msg.animations.entries)) {
			const src = entry.fnSource
			const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'))
			entries[key] = {
				label: entry.label,
				mask: entry.mask,
				fn: new Function('t', 'bones', 'speed', 'ik', body),
			}
		}
		anim.proceduralAnims = entries

		const masks = {}
		for (const [key, arr] of Object.entries(msg.animations.masks)) {
			masks[key] = arr ? new Set(arr) : null
		}
		anim.proceduralMasks = masks
		anim.proceduralRestPose = msg.animations.restPose || null
		anim.proceduralChains = msg.animations.chains || null
	} else {
		anim.proceduralAnims = null
		anim.proceduralMasks = null
		anim.proceduralRestPose = null
		anim.proceduralChains = null
	}
}
