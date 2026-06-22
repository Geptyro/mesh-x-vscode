const vscode = require('vscode')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { getNodeBin, findProjectRoot } = require('./buildBridge')

/**
 * Watches the open workspace for .jsx / .js / .meshx.json changes and rebuilds
 * the affected asset's GLB via its project's build.js.
 *
 * Project-agnostic: there's no hardcoded asset directory. On each change we walk
 * up from the changed file to find (a) the asset folder — the nearest ancestor
 * containing a *.meshx.json — and (b) the project root (nearest ancestor that can
 * resolve mesh-x), then run that project's build.js for the asset.
 */
class AutoBuilder {
	constructor(extensionPath, output) {
		this._extensionPath = fs.realpathSync(extensionPath)
		this._output = output
		this._debounceTimer = null
		this._pending = null // { assetName, projectRoot }
		this._building = false
	}

	activate(context) {
		// Watch the whole workspace; per-file logic decides what's buildable.
		const patterns = ['**/*.jsx', '**/*.js', '**/*.meshx.json']
		for (const pat of patterns) {
			const watcher = vscode.workspace.createFileSystemWatcher(pat)
			watcher.onDidChange((uri) => this._onFileChanged(uri))
			watcher.onDidCreate((uri) => this._onFileChanged(uri))
			context.subscriptions.push(watcher)
		}
		this._output.appendLine('[auto-build] Watching workspace for mesh-x asset changes')
	}

	_onFileChanged(uri) {
		const filePath = uri.fsPath
		if (filePath.includes('node_modules')) return

		// Atlas palette/textures rebuild differently — skip auto-rebuild on those.
		if (path.basename(path.dirname(filePath)) === 'atlas') return

		// Walk up to the asset folder (nearest ancestor with a *.meshx.json).
		let dir = path.dirname(filePath)
		let assetName = null
		for (let i = 0; i < 20; i++) {
			try {
				if (fs.readdirSync(dir).some(e => e.endsWith('.meshx.json'))) {
					assetName = path.basename(dir)
					break
				}
			} catch { break }
			const parent = path.dirname(dir)
			if (parent === dir) break
			dir = parent
		}
		if (!assetName) return

		const projectRoot = findProjectRoot(filePath)
		this._pending = { assetName, projectRoot }
		clearTimeout(this._debounceTimer)
		this._debounceTimer = setTimeout(() => this._build(), 200)
	}

	_build() {
		const pending = this._pending
		if (!pending || this._building) return
		this._pending = null
		this._building = true

		const { assetName, projectRoot } = pending
		const buildScript = path.join(projectRoot, 'build.js')
		if (!fs.existsSync(buildScript)) {
			this._output.appendLine(`[auto-build] no build.js in ${projectRoot}, skipping ${assetName}`)
			this._building = false
			return
		}

		const nodeBin = getNodeBin()
		const loaderPath = 'mesh-x/pipeline/jsx-loader.js' // resolved from projectRoot cwd

		this._output.appendLine(`[auto-build] Rebuilding ${assetName}...`)

		const child = spawn(nodeBin, ['--import', loaderPath, buildScript, assetName], {
			cwd: projectRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, NODE_NO_WARNINGS: '1' },
		})

		let stdout = ''
		let stderr = ''
		child.stdout.on('data', chunk => { stdout += chunk })
		child.stderr.on('data', chunk => { stderr += chunk })

		child.on('close', (code) => {
			this._building = false
			if (code === 0) {
				this._output.appendLine(`[auto-build] ${assetName} done`)
			} else {
				this._output.appendLine(`[auto-build] ${assetName} FAILED (exit ${code})`)
				if (stderr) this._output.appendLine(stderr.trim())
				if (stdout) this._output.appendLine(stdout.trim())
			}
			if (this._pending) this._build()
		})

		child.on('error', (err) => {
			this._building = false
			this._output.appendLine(`[auto-build] spawn error: ${err.message}`)
		})
	}
}

module.exports = { AutoBuilder }
