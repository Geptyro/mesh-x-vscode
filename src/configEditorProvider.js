const vscode = require('vscode')
const path = require('path')
const fs = require('fs')
const { BuildBridge } = require('./buildBridge')

class ConfigEditorProvider {
	static VIEW_TYPE = 'falcra.configEditor'

	static register(context, output) {
		const provider = new ConfigEditorProvider(context, output)
		return vscode.window.registerCustomEditorProvider(
			ConfigEditorProvider.VIEW_TYPE,
			provider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	}

	constructor(context, output) {
		this._context = context
		this._output = output
		this._bridge = new BuildBridge(context.extensionPath, output)
	}

	async resolveCustomTextEditor(document, webviewPanel) {
		const webview = webviewPanel.webview
		const filePath = document.uri.fsPath
		const isPreview = filePath.endsWith('.falcra-preview.json')

		let componentDir, schema, jsxFile, swatchNames, swatchColors, values, currentMounts, previewFiles, availableComponents

		this._output.appendLine(`[editor] opening: ${filePath} (isPreview: ${isPreview})`)

		if (isPreview) {
			try {
				const previewData = this._readPreviewData(filePath, document)
				componentDir = previewData.componentDir
				schema = previewData.schema
				jsxFile = previewData.jsxFile
				swatchNames = previewData.swatchNames
				swatchColors = previewData.swatchColors
				values = previewData.values
				currentMounts = previewData.mounts
				previewFiles = []
				availableComponents = this._discoverComponents()
				this._output.appendLine(`[editor] preview base resolved: ${componentDir}, jsx: ${jsxFile}`)
			} catch (err) {
				this._output.appendLine(`[editor] ERROR reading preview: ${err.message}`)
				vscode.window.showErrorMessage('Failed to load preview: ' + err.message)
				return
			}
		} else {
			componentDir = path.dirname(filePath)
			const data = this._readAssetData(componentDir, document)
			schema = data.schema
			jsxFile = data.jsxFile
			swatchNames = data.swatchNames
			swatchColors = data.swatchColors
			values = data.values
			currentMounts = {}
			previewFiles = this._getPreviewFiles(componentDir)
			availableComponents = this._discoverComponents()
		}

		// Atlas texture URIs for the webview
		const atlasPath = this._findAtlasPalette(componentDir)
		const atlasDir = atlasPath ? path.dirname(atlasPath) : null
		const atlasTextures = {}
		if (atlasDir) {
			for (const key of ['atlas_base_color.png', 'atlas_orm.png', 'atlas_emission.png']) {
				const filePath = path.join(atlasDir, key)
				if (fs.existsSync(filePath)) {
					atlasTextures[key.replace('.png', '')] = webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
				}
			}
		}

		// Webview options: enable scripts + allow loading atlas textures
		const resourceRoots = [vscode.Uri.file(path.join(this._context.extensionPath, 'media'))]
		if (atlasDir) resourceRoots.push(vscode.Uri.file(atlasDir))
		webview.options = { enableScripts: true, localResourceRoots: resourceRoots }

		webview.html = this._getWebviewHtml(webview)

		// Send initial state once webview is ready
		let ready = false
		const sendInit = () => {
			if (!ready) return
			webview.postMessage({
				type: 'init',
				schema,
				values,
				swatchNames,
				swatchColors,
				isPreview,
				currentMounts,
				availableComponents,
				previewFiles,
				atlasTextures,
			})
		}

		// Debounce timer for rebuilds
		let rebuildTimer = null
		let currentValues = { ...values }
		let ignoreNextDocChange = false

		const triggerRebuild = () => {
			if (rebuildTimer) clearTimeout(rebuildTimer)
			rebuildTimer = setTimeout(() => {
				this._rebuild(webview, componentDir, jsxFile, currentValues, isPreview ? currentMounts : null)
			}, 200)
		}

		// Handle messages from webview
		const messageDisposable = webview.onDidReceiveMessage(async msg => {
			switch (msg.type) {
				case 'ready':
					ready = true
					sendInit()
					triggerRebuild()
					break

				case 'propChanged': {
					currentValues[msg.prop] = msg.value

					if (isPreview) {
						// Save to preview file, NOT to base .falcra.json
						ignoreNextDocChange = true
						this._updatePreviewProp(document, msg.prop, msg.value)
					} else {
						// Update the falcra.json default value
						ignoreNextDocChange = true
						this._updateConfigDefault(document, msg.prop, msg.value)
					}

					triggerRebuild()
					break
				}

				case 'mountChanged': {
					if (!isPreview) break

					const { path: mountPath, component } = msg
					if (!mountPath || mountPath.length === 0) break

					const { parent, key } = this._navigateMounts(currentMounts, mountPath)
					if (component) {
						// Clear props and child mounts when component changes
						parent[key] = { component }
					} else {
						delete parent[key]
					}

					// Clean and save
					currentMounts = this._cleanMounts(currentMounts)
					ignoreNextDocChange = true
					this._updatePreviewMounts(document, currentMounts)

					triggerRebuild()
					break
				}

				case 'mountPropChanged': {
					if (!isPreview) break

					const { path: propPath, prop, value } = msg
					if (!propPath || propPath.length === 0) break

					const nav = this._navigateMounts(currentMounts, propPath)
					if (!nav.target.props) nav.target.props = {}
					nav.target.props[prop] = value

					// Save to preview file
					ignoreNextDocChange = true
					this._updatePreviewMounts(document, currentMounts)

					triggerRebuild()
					break
				}

				case 'createPreview': {
					if (isPreview) break

					const name = msg.name
					if (!name) break

					const previewsDir = path.join(componentDir, 'previews')
					const previewPath = path.join(previewsDir, name + '.falcra-preview.json')

					if (fs.existsSync(previewPath)) {
						vscode.window.showWarningMessage(`Preview "${name}" already exists`)
						break
					}

					// Derive base reference as relative path
					const fileName = path.basename(filePath)
					const previewContent = {
						base: '../' + fileName,
						props: { ...currentValues },
						mounts: {},
					}

					fs.mkdirSync(previewsDir, { recursive: true })
					fs.writeFileSync(previewPath, JSON.stringify(previewContent, null, '\t') + '\n')

					// Update preview file list in webview
					previewFiles = this._getPreviewFiles(componentDir)
					webview.postMessage({ type: 'updatePreviewFiles', previewFiles })

					// Open the new preview file
					const previewUri = vscode.Uri.file(previewPath)
					vscode.commands.executeCommand('vscode.openWith', previewUri, ConfigEditorProvider.VIEW_TYPE)
					break
				}

				case 'openPreview': {
					const previewPath = msg.path
					if (!previewPath) break
					const previewUri = vscode.Uri.file(previewPath)
					vscode.commands.executeCommand('vscode.openWith', previewUri, ConfigEditorProvider.VIEW_TYPE)
					break
				}
			}
		})

		// Watch for external changes to the document
		const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
				if (ignoreNextDocChange) {
					ignoreNextDocChange = false
					return
				}
				try {
					if (isPreview) {
						const previewData = this._readPreviewData(filePath, document)
						currentValues = { ...previewData.values }
						currentMounts = previewData.mounts
						webview.postMessage({
							type: 'updateSchema',
							schema: previewData.schema,
							values: previewData.values,
							swatchNames: previewData.swatchNames,
							swatchColors: previewData.swatchColors,
							isPreview,
							currentMounts,
							availableComponents,
						})
					} else {
						const data = this._readAssetData(componentDir, document)
						currentValues = { ...data.values }
						webview.postMessage({
							type: 'updateSchema',
							schema: data.schema,
							values: data.values,
							swatchNames: data.swatchNames,
							swatchColors: data.swatchColors,
						})
					}
					triggerRebuild()
				} catch {}
			}
		})

		webviewPanel.onDidDispose(() => {
			messageDisposable.dispose()
			docChangeDisposable.dispose()
			if (rebuildTimer) clearTimeout(rebuildTimer)
		})
	}

	_readAssetData(componentDir, document) {
		// Parse config.json
		const config = JSON.parse(document.getText())
		const schema = config.props || {}

		// Derive component name from filename: DoubleDoor.falcra.json → DoubleDoor
		const fileName = path.basename(document.uri.fsPath)
		const pascal = fileName.replace(/\.falcra\.json$/, '')

		const jsxFile = fs.existsSync(path.join(componentDir, pascal + 'Scene.jsx'))
			? pascal + 'Scene.jsx'
			: fs.existsSync(path.join(componentDir, pascal + '.jsx'))
				? pascal + '.jsx'
				: null

		// Read atlas palette for swatch names
		let swatchNames = []
		let swatchColors = {}
		const atlasPath = this._findAtlasPalette(componentDir)
		if (atlasPath) {
			try {
				const palette = JSON.parse(fs.readFileSync(atlasPath, 'utf8'))
				const swatches = palette.swatches || {}
				swatchNames = Object.keys(swatches)
				for (const [name, data] of Object.entries(swatches)) {
					if (data.color) {
						swatchColors[name] = data.color
					}
				}
			} catch {}
		}

		// Read default values from schema
		const values = {}
		for (const [key, def] of Object.entries(schema)) {
			if (def.default !== undefined) {
				values[key] = def.default
			}
		}

		return { schema, jsxFile, swatchNames, swatchColors, values }
	}

	_readPreviewData(previewPath, document) {
		const preview = JSON.parse(document.getText())
		const previewDir = path.dirname(previewPath)

		// Resolve base .falcra.json path
		const basePath = path.resolve(previewDir, preview.base)
		const baseDir = path.dirname(basePath)

		// Read base config for schema
		const baseConfig = JSON.parse(fs.readFileSync(basePath, 'utf8'))
		const schema = baseConfig.props || {}

		// Derive JSX file from base filename
		const baseFileName = path.basename(basePath)
		const pascal = baseFileName.replace(/\.falcra\.json$/, '')

		const jsxFile = fs.existsSync(path.join(baseDir, pascal + 'Scene.jsx'))
			? pascal + 'Scene.jsx'
			: fs.existsSync(path.join(baseDir, pascal + '.jsx'))
				? pascal + '.jsx'
				: null

		// Read atlas palette
		let swatchNames = []
		let swatchColors = {}
		const atlasPath = this._findAtlasPalette(baseDir)
		if (atlasPath) {
			try {
				const palette = JSON.parse(fs.readFileSync(atlasPath, 'utf8'))
				const swatches = palette.swatches || {}
				swatchNames = Object.keys(swatches)
				for (const [name, data] of Object.entries(swatches)) {
					if (data.color) {
						swatchColors[name] = data.color
					}
				}
			} catch {}
		}

		// Values: start from base defaults, override with preview props
		const values = {}
		for (const [key, def] of Object.entries(schema)) {
			if (def.default !== undefined) {
				values[key] = def.default
			}
		}
		if (preview.props) {
			for (const [key, val] of Object.entries(preview.props)) {
				values[key] = val
			}
		}

		return {
			componentDir: baseDir,
			schema,
			jsxFile,
			swatchNames,
			swatchColors,
			values,
			mounts: preview.mounts || {},
		}
	}

	_discoverComponents() {
		// Scan falcra-assets/src/ for all *.falcra.json files
		const extensionPath = fs.realpathSync(this._context.extensionPath)
		const assetsDir = path.resolve(extensionPath, '..', 'falcra-assets')
		const srcDir = path.join(assetsDir, 'src')
		if (!fs.existsSync(srcDir)) return []

		const components = []
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					walk(path.join(dir, entry.name))
				} else if (entry.name.endsWith('.falcra.json')) {
					const pascal = entry.name.replace(/\.falcra\.json$/, '')
					const jsxPath = path.join(dir, pascal + '.jsx')
					const sceneJsxPath = path.join(dir, pascal + 'Scene.jsx')
					if (fs.existsSync(jsxPath) || fs.existsSync(sceneJsxPath)) {
						// Compute component ref relative to src/
						const rel = path.relative(srcDir, path.join(dir, pascal))
						components.push(rel.replace(/\\/g, '/'))
					}
				}
			}
		}
		walk(srcDir)
		return components.sort()
	}

	_getPreviewFiles(componentDir) {
		const previewsDir = path.join(componentDir, 'previews')
		if (!fs.existsSync(previewsDir)) return []

		return fs.readdirSync(previewsDir)
			.filter(f => f.endsWith('.falcra-preview.json'))
			.map(f => ({
				name: f.replace(/\.falcra-preview\.json$/, ''),
				path: path.join(previewsDir, f),
			}))
	}

	_findAtlasPalette(componentDir) {
		// Walk up to find falcra-assets/src/atlas/atlas_palette.json
		let dir = componentDir
		for (let i = 0; i < 10; i++) {
			const candidate = path.join(dir, 'atlas', 'atlas_palette.json')
			if (fs.existsSync(candidate)) return candidate

			// Also check sibling src/atlas
			const srcCandidate = path.join(dir, 'src', 'atlas', 'atlas_palette.json')
			if (fs.existsSync(srcCandidate)) return srcCandidate

			const parent = path.dirname(dir)
			if (parent === dir) break
			dir = parent
		}
		return null
	}

	async _rebuild(webview, componentDir, jsxFile, values, mounts) {
		if (!jsxFile) {
			webview.postMessage({ type: 'error', message: 'No JSX component found' })
			return
		}

		webview.postMessage({ type: 'building' })

		const componentPath = path.join(componentDir, jsxFile)
		const atlasDir = path.dirname(this._findAtlasPalette(componentDir) || '')

		try {
			const { glbBuffer, mountTree, animations } = await this._bridge.build(componentPath, values, atlasDir, mounts)
			const enriched = this._enrichMountTree(mountTree, mounts || {})
			const base64 = glbBuffer.toString('base64')
			const msg = { type: 'updateModel', glb: base64, mountTree: enriched }
			if (animations) msg.animations = animations
			webview.postMessage(msg)
		} catch (err) {
			if (err.message !== 'Build cancelled') {
				webview.postMessage({ type: 'error', message: err.message })
			}
		}
	}

	/**
	 * Enrich mount tree with schema info from .falcra.json files and current per-mount props.
	 * Returns tree suitable for webview: [{ name, component, schema, props, childMounts }]
	 */
	_enrichMountTree(mountTree, currentMounts) {
		const extensionPath = fs.realpathSync(this._context.extensionPath)
		const assetsDir = path.resolve(extensionPath, '..', 'falcra-assets')
		const srcDir = path.join(assetsDir, 'src')

		return mountTree.map(node => {
			const mountConfig = currentMounts[node.name] || {}
			const enriched = {
				name: node.name,
				component: node.component,
				schema: {},
				props: mountConfig.props || {},
				childMounts: [],
			}

			// Load schema from component's .falcra.json
			if (node.component) {
				const parts = node.component.split('/')
				const componentName = parts[parts.length - 1]
				const componentDir = path.join(srcDir, ...parts.slice(0, -1))
				const configPath = path.join(componentDir, componentName + '.falcra.json')
				if (fs.existsSync(configPath)) {
					try {
						const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
						enriched.schema = config.props || {}
					} catch {}
				}
			}

			// Recurse into child mounts
			if (node.childMounts && node.childMounts.length > 0) {
				enriched.childMounts = this._enrichMountTree(
					node.childMounts,
					mountConfig.mounts || {}
				)
			}

			return enriched
		})
	}

	/**
	 * Navigate into nested mounts config using a path array.
	 * Returns the mount config object at the target path, creating intermediates as needed.
	 * E.g. path ["Mount_Turret", "Mount_Weapon"] → currentMounts.Mount_Turret.mounts.Mount_Weapon
	 */
	_navigateMounts(currentMounts, pathArr) {
		let level = currentMounts
		for (let i = 0; i < pathArr.length - 1; i++) {
			const key = pathArr[i]
			if (!level[key]) level[key] = {}
			if (!level[key].mounts) level[key].mounts = {}
			level = level[key].mounts
		}
		const lastKey = pathArr[pathArr.length - 1]
		if (!level[lastKey]) level[lastKey] = {}
		return { parent: level, key: lastKey, target: level[lastKey] }
	}

	/**
	 * Recursively clean mount config: remove entries with no component, strip empty props/mounts.
	 */
	_cleanMounts(mounts) {
		if (!mounts) return {}
		const cleaned = {}
		for (const [key, val] of Object.entries(mounts)) {
			if (!val || !val.component) continue
			const entry = { component: val.component }
			if (val.props && Object.keys(val.props).length > 0) {
				entry.props = val.props
			}
			if (val.mounts) {
				const childCleaned = this._cleanMounts(val.mounts)
				if (Object.keys(childCleaned).length > 0) {
					entry.mounts = childCleaned
				}
			}
			cleaned[key] = entry
		}
		return cleaned
	}

	async _updateConfigDefault(document, prop, value) {
		try {
			const config = JSON.parse(document.getText())
			if (config.props && config.props[prop]) {
				config.props[prop].default = value
				const newText = JSON.stringify(config, null, 2) + '\n'
				const edit = new vscode.WorkspaceEdit()
				edit.replace(
					document.uri,
					new vscode.Range(0, 0, document.lineCount, 0),
					newText
				)
				await vscode.workspace.applyEdit(edit)
			}
		} catch {}
	}

	async _updatePreviewProp(document, prop, value) {
		try {
			const preview = JSON.parse(document.getText())
			if (!preview.props) preview.props = {}
			preview.props[prop] = value
			const newText = JSON.stringify(preview, null, '\t') + '\n'
			const edit = new vscode.WorkspaceEdit()
			edit.replace(
				document.uri,
				new vscode.Range(0, 0, document.lineCount, 0),
				newText
			)
			await vscode.workspace.applyEdit(edit)
		} catch {}
	}

	async _updatePreviewMounts(document, mounts) {
		try {
			const preview = JSON.parse(document.getText())
			preview.mounts = this._cleanMounts(mounts)
			const newText = JSON.stringify(preview, null, '\t') + '\n'
			const edit = new vscode.WorkspaceEdit()
			edit.replace(
				document.uri,
				new vscode.Range(0, 0, document.lineCount, 0),
				newText
			)
			await vscode.workspace.applyEdit(edit)
		} catch {}
	}

	_getWebviewHtml(webview) {
		const mediaPath = path.join(this._context.extensionPath, 'media')
		const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'editor.js')))
		const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'editor.css')))

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${styleUri}">
	<title>Falcra Asset Editor</title>
</head>
<body>
	<div id="root"></div>
	<script src="${scriptUri}"></script>
</body>
</html>`
	}
}

module.exports = { ConfigEditorProvider }
