export const editor = $state({
	schema: {},
	values: {},
	swatchNames: [],
	swatchColors: {},
	swatches: {},
	finishNames: [],
	atlasPalettePath: null,
	isPreview: false,
	mountTree: [],
	currentMounts: {},
	availableComponents: [],
	// Mount typing: ref → set of type ids it belongs to (its own id plus every
	// ancestor's, flattened from the extends path-chain by the extension). A socket's
	// `accepts` (resolved to the same id form) matches a component when it's in this set.
	componentTypeSets: {},
	previewFiles: [],
	statusText: '',
	lastSceneStats: null,
	atlasTextures: null,
	// Audio state
	soundSource: null,
	soundSchema: null,
	soundValues: {},
	activeTab: '3d',
})

export function applyInit(msg) {
	editor.schema = msg.schema
	editor.values = msg.values
	editor.swatchNames = msg.swatchNames
	editor.swatchColors = msg.swatchColors
	editor.isPreview = msg.isPreview || false
	editor.currentMounts = msg.currentMounts || {}
	editor.availableComponents = msg.availableComponents || []
	editor.componentTypeSets = msg.componentTypeSets || {}
	editor.previewFiles = msg.previewFiles || []
	editor.atlasTextures = msg.atlasTextures || null
	editor.swatches = msg.swatches || {}
	editor.finishNames = msg.finishNames || []
	editor.atlasPalettePath = msg.atlasPalettePath || null
	editor.soundSource = msg.soundSource || null
	editor.soundSchema = msg.soundSchema || null
	editor.soundValues = {}
	// Initialize sound values from schema defaults
	if (msg.soundSchema) {
		for (const [soundName, soundDef] of Object.entries(msg.soundSchema)) {
			editor.soundValues[soundName] = {}
			if (soundDef.props) {
				for (const [propName, propDef] of Object.entries(soundDef.props)) {
					if (propDef.default !== undefined) {
						editor.soundValues[soundName][propName] = propDef.default
					}
				}
			}
		}
	}
	// Reset to 3d tab if no audio
	if (!msg.soundSource) editor.activeTab = '3d'
}

export function applyUpdateSchema(msg) {
	editor.schema = msg.schema
	editor.values = msg.values
	editor.swatchNames = msg.swatchNames
	editor.swatchColors = msg.swatchColors
	if (msg.isPreview !== undefined) editor.isPreview = msg.isPreview
	if (msg.currentMounts) editor.currentMounts = msg.currentMounts
	if (msg.availableComponents) editor.availableComponents = msg.availableComponents
}

export function applyUpdateSwatches(msg) {
	if (msg.swatches) editor.swatches = msg.swatches
	if (msg.swatchNames) editor.swatchNames = msg.swatchNames
	if (msg.swatchColors) editor.swatchColors = msg.swatchColors
	if (msg.atlasTextures) editor.atlasTextures = msg.atlasTextures
}

/**
 * The component refs a mount may hold, given the type id it `accepts`. A mount with
 * no declared accept type shows nothing (typing is required to populate it). A
 * component matches when the accepts-id is in its flattened set of type ids (its own
 * id or any anchor inherited via the extends path-chain).
 */
export function acceptedComponents(accepts) {
	if (!accepts) return []
	return editor.availableComponents.filter(ref => {
		const set = editor.componentTypeSets[ref]
		return set && set.includes(accepts)
	})
}

export function applyUpdateSound(msg) {
	editor.soundSource = msg.soundSource || null
	if (msg.soundSchema !== undefined) editor.soundSchema = msg.soundSchema
	if (!editor.soundSource) editor.activeTab = '3d'
}
