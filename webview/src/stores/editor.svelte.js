export const editor = $state({
	schema: {},
	values: {},
	swatchNames: [],
	swatchColors: {},
	isPreview: false,
	mountTree: [],
	currentMounts: {},
	availableComponents: [],
	previewFiles: [],
	statusText: '',
	lastSceneStats: null,
	atlasTextures: null,
})

export function applyInit(msg) {
	editor.schema = msg.schema
	editor.values = msg.values
	editor.swatchNames = msg.swatchNames
	editor.swatchColors = msg.swatchColors
	editor.isPreview = msg.isPreview || false
	editor.currentMounts = msg.currentMounts || {}
	editor.availableComponents = msg.availableComponents || []
	editor.previewFiles = msg.previewFiles || []
	editor.atlasTextures = msg.atlasTextures || null
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
