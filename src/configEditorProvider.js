const vscode = require('vscode')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { createRequire } = require('module')
const { pathToFileURL } = require('url')
const { BuildBridge, findProjectRoot, getNodeBin } = require('./buildBridge')

class ConfigEditorProvider {
	static VIEW_TYPE = 'meshx.configEditor'

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
		const isPreview = filePath.endsWith('.meshx-preview.json')

		let componentDir, schema, jsxFile, swatchNames, swatchColors, values, currentMounts, previewFiles, availableComponents
		let soundSource, soundSchema, currentAtlasDir, currentSwatches, currentAtlasPalettePath

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
				soundSource = previewData.soundSource
				soundSchema = previewData.soundSchema
				currentAtlasDir = previewData.atlasDir
				currentSwatches = previewData.swatches
				currentAtlasPalettePath = previewData.atlasPalettePath
				previewFiles = []
				availableComponents = this._discoverComponents(componentDir)
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
			soundSource = data.soundSource
			soundSchema = data.soundSchema
			currentAtlasDir = data.atlasDir
			currentSwatches = data.swatches
			currentAtlasPalettePath = data.atlasPalettePath
			currentMounts = {}
			previewFiles = this._getPreviewFiles(componentDir)
			availableComponents = this._discoverComponents(componentDir)
		}

		// Atlas texture URIs for the webview (uses the resolved asset atlas).
		// `version` busts the webview's image cache after a live atlas regen.
		const atlasDir = currentAtlasDir
		const buildAtlasTextures = (version) => {
			const out = {}
			if (!atlasDir) return out
			for (const key of ['atlas_base_color.png', 'atlas_orm.png', 'atlas_emission.png', 'atlas_normal.png']) {
				const filePath = path.join(atlasDir, key)
				if (fs.existsSync(filePath)) {
					let uri = webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
					if (version) uri += (uri.includes('?') ? '&' : '?') + 'v=' + version
					out[key.replace('.png', '')] = uri
				}
			}
			return out
		}
		const atlasTextures = buildAtlasTextures(0)

		// The list of material finishes (single source of truth = the engine).
		const finishNames = await this._loadFinishNames(componentDir)

		// Mount typing: each component's .meshx.json carries a `type` name and an
		// optional `extends` (a relative path to a parent .meshx.json — the only
		// path-valued field). Walking that path-chain yields the set of type names a
		// component belongs to; a socket's `accepts` name matches if it's in that set.
		// Precomputed here (the extension has fs access) and static for the session,
		// so it rides along only on `init`.
		const componentTypeSets = this._loadComponentTypeSets(this._findSrcDir(componentDir))

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
				soundSource,
				soundSchema,
				swatches: currentSwatches || {},
				finishNames,
				atlasPalettePath: currentAtlasPalettePath || null,
				componentTypeSets,
			})
		}

		// Debounce timer for rebuilds
		let rebuildTimer = null
		let currentValues = { ...values }
		let ignoreNextDocChange = false
		let atlasVersion = 0 // bumped on each live atlas regen to bust webview image cache

		const triggerRebuild = () => {
			if (rebuildTimer) clearTimeout(rebuildTimer)
			rebuildTimer = setTimeout(() => {
				this._rebuild(webview, componentDir, jsxFile, currentValues, isPreview ? currentMounts : null, currentAtlasDir)
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
						// Save to preview file, NOT to base .meshx.json
						ignoreNextDocChange = true
						this._updatePreviewProp(document, msg.prop, msg.value)
					} else {
						// Update the meshx.json default value
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
					const previewPath = path.join(previewsDir, name + '.meshx-preview.json')

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

				case 'soundPropChanged': {
					const { sound, prop, value } = msg
					// Update config file sounds section
					ignoreNextDocChange = true
					this._updateSoundPropDefault(document, sound, prop, value)
					break
				}

				case 'swatchEdit': {
					// Edit a swatch's material (finish / color / PBR / emission) in the
					// atlas palette, regenerate the atlas PNGs, and live-refresh.
					if (!currentAtlasPalettePath || !currentAtlasDir) break
					const { name, prop, value } = msg
					if (!name || !prop) break
					try {
						const projectRoot = findProjectRoot(componentDir)
						const res = await this._applySwatchEdit(
							currentAtlasPalettePath, currentAtlasDir, projectRoot, name, prop, value
						)
						currentSwatches = res.swatches
						atlasVersion++
						webview.postMessage({
							type: 'updateSwatches',
							swatches: res.swatches,
							swatchNames: res.swatchNames,
							swatchColors: res.swatchColors,
							atlasTextures: buildAtlasTextures(atlasVersion),
						})
						triggerRebuild() // atlas changed → re-skin the 3D preview
					} catch (err) {
						webview.postMessage({ type: 'error', message: 'Swatch edit failed: ' + err.message })
					}
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
						currentAtlasDir = previewData.atlasDir
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
						currentAtlasDir = data.atlasDir
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

		// Watch .sound.js file for changes
		let soundWatcher = null
		const soundFileName = this._getSoundFileName(filePath, isPreview)
		if (soundFileName) {
			const soundDir = isPreview ? componentDir : path.dirname(filePath)
			const soundFilePath = path.join(soundDir, soundFileName)
			const pattern = new vscode.RelativePattern(soundDir, soundFileName)
			soundWatcher = vscode.workspace.createFileSystemWatcher(pattern)
			const onSoundChange = () => {
				try {
					soundSource = fs.readFileSync(soundFilePath, 'utf8')
					webview.postMessage({ type: 'updateSound', soundSource })
				} catch {}
			}
			soundWatcher.onDidChange(onSoundChange)
			soundWatcher.onDidCreate(onSoundChange)
		}

		// Watch the component's .jsx AND its transitive local dependencies (imported
		// parts, geometry helpers, referenced config JSON) so editing any of them
		// live-refreshes the preview — not just the opened .meshx.json. The preview
		// worker is a fresh process each build, so dependency edits are picked up.
		let sourceWatchers = []
		const refreshSourceWatchers = () => {
			for (const w of sourceWatchers) w.dispose()
			sourceWatchers = []
			if (!jsxFile) return
			const deps = this._collectDeps(path.join(componentDir, jsxFile))
			for (const dep of deps) {
				const w = vscode.workspace.createFileSystemWatcher(
					new vscode.RelativePattern(path.dirname(dep), path.basename(dep))
				)
				const onDepChange = () => {
					refreshSourceWatchers() // deps may have changed (added/removed imports)
					triggerRebuild()
				}
				w.onDidChange(onDepChange)
				w.onDidCreate(onDepChange)
				w.onDidDelete(onDepChange)
				sourceWatchers.push(w)
			}
			this._output.appendLine(`[editor] watching ${deps.size} source file(s) for live reload`)
		}
		refreshSourceWatchers()

		webviewPanel.onDidDispose(() => {
			messageDisposable.dispose()
			docChangeDisposable.dispose()
			if (soundWatcher) soundWatcher.dispose()
			for (const w of sourceWatchers) w.dispose()
			if (rebuildTimer) clearTimeout(rebuildTimer)
		})
	}

	/**
	 * Collect the transitive local dependency files of a .jsx entry point:
	 * the entry itself + every relative import/require/dynamic-import it pulls in
	 * (resolving .jsx/.js/.json), plus any config JSON referenced by filename
	 * (e.g. readFileSync(join(__dirname, '..', 'mountSpec.json'))). Bare specifiers
	 * (node_modules / 'mesh-x') are skipped. Returns a Set of absolute paths.
	 */
	_collectDeps(entryPath) {
		const deps = new Set()
		const fromRe = /from\s*['"](\.[^'"]+)['"]/g
		const callRe = /(?:require|import)\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g
		const jsonRe = /['"]([\w.\-/]+\.json)['"]/g

		const resolveRel = (dir, spec) => {
			const base = path.resolve(dir, spec)
			const cands = [base, base + '.jsx', base + '.js', base + '.json',
				path.join(base, 'index.js'), path.join(base, 'index.jsx')]
			for (const c of cands) {
				try { if (fs.statSync(c).isFile()) return c } catch {}
			}
			return null
		}
		const findUp = (dir, name) => {
			let d = dir
			for (let i = 0; i < 8; i++) {
				const c = path.join(d, name)
				if (fs.existsSync(c)) return c
				const p = path.dirname(d)
				if (p === d) break
				d = p
			}
			return null
		}

		const visit = (file) => {
			if (deps.has(file)) return
			let src
			try { src = fs.readFileSync(file, 'utf8') } catch { return }
			deps.add(file)
			const dir = path.dirname(file)
			let m
			for (const re of [fromRe, callRe]) {
				re.lastIndex = 0
				while ((m = re.exec(src))) {
					const r = resolveRel(dir, m[1])
					if (r) visit(r)
				}
			}
			jsonRe.lastIndex = 0
			while ((m = jsonRe.exec(src))) {
				const j = findUp(dir, path.basename(m[1]))
				if (j) deps.add(j)
			}
		}
		visit(entryPath)
		return deps
	}

	_readAssetData(componentDir, document) {
		// Parse config.json
		const config = JSON.parse(document.getText())
		const schema = config.props || {}

		// Derive component name from filename: DoubleDoor.meshx.json → DoubleDoor
		const fileName = path.basename(document.uri.fsPath)
		const pascal = fileName.replace(/\.meshx\.json$/, '')

		const jsxFile = fs.existsSync(path.join(componentDir, pascal + 'Scene.jsx'))
			? pascal + 'Scene.jsx'
			: fs.existsSync(path.join(componentDir, pascal + '.jsx'))
				? pascal + '.jsx'
				: null

		// Resolve the asset's atlas (declared `"atlas"` path, else nearest-ancestor)
		// and read its palette for swatch names/colors + full per-swatch data.
		const { dir: atlasDir, palette: atlasPath } = this._resolveAtlas(componentDir, config)
		let swatchNames = []
		let swatchColors = {}
		let swatches = {}
		if (atlasPath) {
			try {
				const palette = JSON.parse(fs.readFileSync(atlasPath, 'utf8'))
				swatches = palette.swatches || {}
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

		// Check for .sound.js sibling
		const soundFile = pascal + '.sound.js'
		const soundPath = path.join(componentDir, soundFile)
		let soundSource = null
		let soundSchema = null
		if (fs.existsSync(soundPath)) {
			soundSource = fs.readFileSync(soundPath, 'utf8')
			soundSchema = config.sounds || null
		}

		return { schema, jsxFile, swatchNames, swatchColors, swatches, atlasPalettePath: atlasPath, values, soundSource, soundSchema, atlasDir }
	}

	_readPreviewData(previewPath, document) {
		const preview = JSON.parse(document.getText())
		const previewDir = path.dirname(previewPath)

		// Resolve base .meshx.json path
		const basePath = path.resolve(previewDir, preview.base)
		const baseDir = path.dirname(basePath)

		// Read base config for schema
		const baseConfig = JSON.parse(fs.readFileSync(basePath, 'utf8'))
		const schema = baseConfig.props || {}

		// Derive JSX file from base filename
		const baseFileName = path.basename(basePath)
		const pascal = baseFileName.replace(/\.meshx\.json$/, '')

		const jsxFile = fs.existsSync(path.join(baseDir, pascal + 'Scene.jsx'))
			? pascal + 'Scene.jsx'
			: fs.existsSync(path.join(baseDir, pascal + '.jsx'))
				? pascal + '.jsx'
				: null

		// Resolve the base asset's atlas + read its palette
		const { dir: atlasDir, palette: atlasPath } = this._resolveAtlas(baseDir, baseConfig)
		let swatchNames = []
		let swatchColors = {}
		let swatches = {}
		if (atlasPath) {
			try {
				const palette = JSON.parse(fs.readFileSync(atlasPath, 'utf8'))
				swatches = palette.swatches || {}
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

		// Check for .sound.js sibling in base dir
		const soundFile = pascal + '.sound.js'
		const soundPath = path.join(baseDir, soundFile)
		let soundSource = null
		let soundSchema = null
		if (fs.existsSync(soundPath)) {
			soundSource = fs.readFileSync(soundPath, 'utf8')
			soundSchema = baseConfig.sounds || null
		}

		return {
			componentDir: baseDir,
			schema,
			jsxFile,
			swatchNames,
			swatchColors,
			values,
			mounts: preview.mounts || {},
			soundSource,
			soundSchema,
			atlasDir,
			swatches,
			atlasPalettePath: atlasPath,
		}
	}

	/**
	 * The asset source root for the project the opened component belongs to.
	 * Anchored on the component itself (NOT a hardcoded sibling), so the extension
	 * works for any mesh-x project. Prefers a `src/` subdir if the project has one
	 * (the conventional `src/` layout), otherwise the project root itself.
	 */
	_findSrcDir(componentDir) {
		const projectRoot = findProjectRoot(componentDir)
		const srcDir = path.join(projectRoot, 'src')
		return fs.existsSync(srcDir) ? srcDir : projectRoot
	}

	_discoverComponents(componentDir) {
		// Scan the opened component's project for all *.meshx.json files.
		const srcDir = this._findSrcDir(componentDir)
		if (!fs.existsSync(srcDir)) return []

		const components = []
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					walk(path.join(dir, entry.name))
				} else if (entry.name.endsWith('.meshx.json')) {
					const pascal = entry.name.replace(/\.meshx\.json$/, '')
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

	/**
	 * For every mountable component ref (relative to src/), the SET of type ids it
	 * belongs to — its own id plus every ancestor's, collected by walking the
	 * `extends` path-chain. An id is a file's src-relative path minus .meshx.json
	 * (e.g. "vehicles/modules/_types/Turret"). A socket's `accepts` (resolved to the
	 * same id form) matches a component when the accepts-id is in this set.
	 *
	 * `extends` is a relative path to the parent's .meshx.json — the only path-valued
	 * field (`.meshx.json` appended if omitted). Matching is purely by path/id, so
	 * it's collision-proof (same-named assets are distinct files) and cross-module.
	 * Abstract anchor files (`"abstract": true`, no .jsx) contribute their id to
	 * chains but are never offered as mountable components themselves.
	 */
	_loadComponentTypeSets(srcDir) {
		if (!fs.existsSync(srcDir)) return {}

		// 1. Index every .meshx.json by absolute path.
		const byPath = {} // absPath → { id, extendsAbs, ref|null }
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory()) { walk(path.join(dir, entry.name)); continue }
				if (!entry.name.endsWith('.meshx.json')) continue
				const abs = path.join(dir, entry.name)
				let config
				try { config = JSON.parse(fs.readFileSync(abs, 'utf8')) } catch { continue }
				const pascal = entry.name.replace(/\.meshx\.json$/, '')
				const hasJsx = fs.existsSync(path.join(dir, pascal + '.jsx')) ||
					fs.existsSync(path.join(dir, pascal + 'Scene.jsx'))
				const id = path.relative(srcDir, path.join(dir, pascal)).replace(/\\/g, '/')
				let extendsAbs = null
				if (config.extends) {
					let spec = config.extends
					if (!spec.endsWith('.meshx.json')) spec += '.meshx.json'
					extendsAbs = path.resolve(dir, spec)
				}
				// Only non-abstract components with a .jsx are mountable (get a ref).
				const ref = (!config.abstract && hasJsx) ? id : null
				byPath[abs] = { id, extendsAbs, ref }
			}
		}
		walk(srcDir)

		// 2. Flatten each entry to the set of ids along its extends chain.
		const setFor = (abs) => {
			const ids = []
			const seen = new Set()
			let cur = abs
			for (let i = 0; i < 32 && cur; i++) {
				if (seen.has(cur)) break
				seen.add(cur)
				const node = byPath[cur]
				if (!node) {
					this._output.appendLine(`[types] extends target not found: ${cur}`)
					break
				}
				if (!ids.includes(node.id)) ids.push(node.id)
				cur = node.extendsAbs
			}
			return ids
		}

		const out = {}
		for (const [abs, node] of Object.entries(byPath)) {
			if (node.ref) out[node.ref] = setFor(abs)
		}
		return out
	}

	_getPreviewFiles(componentDir) {
		const previewsDir = path.join(componentDir, 'previews')
		if (!fs.existsSync(previewsDir)) return []

		return fs.readdirSync(previewsDir)
			.filter(f => f.endsWith('.meshx-preview.json'))
			.map(f => ({
				name: f.replace(/\.meshx-preview\.json$/, ''),
				path: path.join(previewsDir, f),
			}))
	}

	/**
	 * Resolve the atlas for an asset → { dir, palette }.
	 *
	 * An asset uses ONE atlas (atlas mode = a single Atlas_Material; swatches are
	 * UV cells of one texture), so the reference lives at the asset level via
	 * `"atlas": "<path>"` in the .meshx.json, pointing at the dir with
	 * atlas_palette.json. Declared-but-missing is logged (the build surfaces the
	 * hard error). Undeclared falls back to nearest-ancestor (shared project atlas),
	 * which is null for self-contained color-mode assets.
	 */
	_resolveAtlas(componentDir, config) {
		const declared = config && config.atlas
		if (declared) {
			const dir = path.isAbsolute(declared) ? declared : path.resolve(componentDir, declared)
			const palette = path.join(dir, 'atlas_palette.json')
			if (!fs.existsSync(palette)) {
				this._output.appendLine(`[atlas] declared atlas not found: "${declared}" → ${dir} (no atlas_palette.json)`)
				return { dir, palette: null }
			}
			return { dir, palette }
		}
		const palette = this._findAtlasPalette(componentDir)
		return { dir: palette ? path.dirname(palette) : null, palette }
	}

	_findAtlasPalette(componentDir) {
		// Walk up to find the project's atlas/atlas_palette.json (optional — color-mode assets have none)
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

	/**
	 * Load the canonical list of material finishes from the project's mesh-x
	 * (single source of truth = the engine's finishes.js). Returns [] if it can't
	 * be resolved (e.g. color-mode project with no atlas tooling).
	 */
	async _loadFinishNames(componentDir) {
		try {
			const projectRoot = findProjectRoot(componentDir)
			const req = createRequire(path.join(projectRoot, 'package.json'))
			const finishesPath = req.resolve('mesh-x/pipeline/atlas/finishes.js')
			const mod = await import(pathToFileURL(finishesPath).href)
			return mod.FINISH_NAMES || []
		} catch (e) {
			this._output.appendLine('[palette] could not load FINISH_NAMES: ' + e.message)
			return []
		}
	}

	/**
	 * Apply one swatch edit: merge { prop: value } into the swatch in
	 * atlas_palette.json (value === null deletes the prop, e.g. clearing a
	 * finish), write the file, regenerate the atlas PNGs, and return refreshed
	 * swatch data. Throws on a missing palette/swatch or a failed regen.
	 */
	async _applySwatchEdit(palettePath, atlasDir, projectRoot, name, prop, value) {
		const palette = JSON.parse(fs.readFileSync(palettePath, 'utf8'))
		if (!palette.swatches || !palette.swatches[name]) {
			throw new Error(`no swatch "${name}" in ${palettePath}`)
		}
		const sw = palette.swatches[name]
		if (value === null || value === undefined) delete sw[prop]
		else sw[prop] = value

		fs.writeFileSync(palettePath, JSON.stringify(palette, null, 2) + '\n')
		await this._regenerateAtlas(atlasDir, projectRoot)

		const swatches = palette.swatches
		const swatchColors = {}
		for (const [n, d] of Object.entries(swatches)) {
			if (d.color) swatchColors[n] = d.color
		}
		return { swatches, swatchColors, swatchNames: Object.keys(swatches) }
	}

	/** Spawn atlas-worker.mjs to regenerate the atlas PNGs for `atlasDir`. */
	_regenerateAtlas(atlasDir, projectRoot) {
		return new Promise((resolve, reject) => {
			const nodeBin = getNodeBin()
			const workerPath = path.join(this._context.extensionPath, 'atlas-worker.mjs')
			const child = spawn(nodeBin, [workerPath], {
				cwd: projectRoot,
				stdio: ['pipe', 'pipe', 'pipe'],
				env: { ...process.env, NODE_NO_WARNINGS: '1' },
			})
			let stderr = ''
			child.stderr.on('data', c => { stderr += c })
			child.stdin.write(JSON.stringify({ atlasDir, assetsDir: projectRoot }))
			child.stdin.end()
			child.on('close', () => {
				try {
					const r = JSON.parse(stderr)
					if (r.ok) resolve()
					else reject(new Error(r.error))
				} catch {
					reject(new Error('atlas regen failed: ' + stderr.trim()))
				}
			})
			child.on('error', reject)
		})
	}

	async _rebuild(webview, componentDir, jsxFile, values, mounts, atlasDir) {
		if (!jsxFile) {
			webview.postMessage({ type: 'error', message: 'No JSX component found' })
			return
		}

		webview.postMessage({ type: 'building' })

		const componentPath = path.join(componentDir, jsxFile)
		// atlasDir resolved at open (declared "atlas" path, else nearest-ancestor);
		// empty string for color-mode/self-contained assets.
		const resolvedAtlasDir = atlasDir || ''

		try {
			const { glbBuffer, mountTree, animations } = await this._bridge.build(componentPath, values, resolvedAtlasDir, mounts)
			// Top-level sockets are declared in the opened asset's own JSX, so their
			// `accepts` paths resolve relative to componentDir.
			const enriched = this._enrichMountTree(mountTree, mounts || {}, this._findSrcDir(componentDir), componentDir)
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
	 * Enrich mount tree with schema info from .meshx.json files and current per-mount props.
	 * Returns tree suitable for webview: [{ name, component, schema, props, childMounts }]
	 */
	_enrichMountTree(mountTree, currentMounts, srcDir, ownerDir) {
		return mountTree.map(node => {
			const mountConfig = currentMounts[node.name] || {}
			const enriched = {
				name: node.name,
				component: node.component,
				// What this socket accepts: a relative path (declared on the <Empty> in
				// JSX) to a type/anchor .meshx.json, resolved here to a stable src-relative
				// id. Matched against each component's extends-chain ids in the webview.
				accepts: this._resolveAcceptsId(node.accepts, ownerDir, srcDir),
				schema: {},
				props: mountConfig.props || {},
				childMounts: [],
			}

			// Load schema from the mounted component's .meshx.json
			let childOwnerDir = ownerDir
			if (node.component) {
				const parts = node.component.split('/')
				const componentName = parts[parts.length - 1]
				const componentDir = path.join(srcDir, ...parts.slice(0, -1))
				// A mounted component's own sockets are declared in ITS jsx, so their
				// accepts paths resolve relative to that component's dir.
				childOwnerDir = componentDir
				const configPath = path.join(componentDir, componentName + '.meshx.json')
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
					mountConfig.mounts || {},
					srcDir,
					childOwnerDir
				)
			}

			return enriched
		})
	}

	/**
	 * Resolve a socket's `accepts` (a relative path to a type/anchor .meshx.json,
	 * written relative to the declaring JSX's dir) into a stable src-relative id
	 * (e.g. "vehicles/modules/_types/Turret") — the same id form a component's
	 * extends-chain produces, so the webview can match by membership. Returns null
	 * for an undeclared socket.
	 */
	_resolveAcceptsId(accepts, ownerDir, srcDir) {
		if (!accepts) return null
		let spec = accepts
		if (!spec.endsWith('.meshx.json')) spec += '.meshx.json'
		const abs = path.resolve(ownerDir, spec)
		if (!fs.existsSync(abs)) {
			this._output.appendLine(`[types] accepts target not found: ${accepts} (from ${ownerDir})`)
		}
		return path.relative(srcDir, abs).replace(/\.meshx\.json$/, '').replace(/\\/g, '/')
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

	_getSoundFileName(filePath, isPreview) {
		if (isPreview) {
			const preview = JSON.parse(fs.readFileSync(filePath, 'utf8'))
			const previewDir = path.dirname(filePath)
			const basePath = path.resolve(previewDir, preview.base)
			const baseFileName = path.basename(basePath)
			const pascal = baseFileName.replace(/\.meshx\.json$/, '')
			return pascal + '.sound.js'
		}
		const fileName = path.basename(filePath)
		const pascal = fileName.replace(/\.meshx\.json$/, '')
		return pascal + '.sound.js'
	}

	async _updateSoundPropDefault(document, sound, prop, value) {
		try {
			const config = JSON.parse(document.getText())
			if (config.sounds && config.sounds[sound] && config.sounds[sound].props && config.sounds[sound].props[prop]) {
				config.sounds[sound].props[prop].default = value
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
	<title>mesh-x Asset Editor</title>
</head>
<body>
	<div id="root"></div>
	<script src="${scriptUri}"></script>
</body>
</html>`
	}
}

module.exports = { ConfigEditorProvider }
