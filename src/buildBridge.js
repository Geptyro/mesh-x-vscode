const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

// VS Code extension host doesn't inherit the user's shell PATH.
// Find the real node binary by scanning common locations.
let _nodeBin
function getNodeBin() {
	if (_nodeBin) return _nodeBin

	// 1. Try nvm (most common on dev machines)
	const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm')
	const nvmVersions = path.join(nvmDir, 'versions', 'node')
	if (fs.existsSync(nvmVersions)) {
		const versions = fs.readdirSync(nvmVersions).sort().reverse()
		for (const v of versions) {
			const candidate = path.join(nvmVersions, v, 'bin', 'node')
			if (fs.existsSync(candidate)) {
				_nodeBin = candidate
				return _nodeBin
			}
		}
	}

	// 2. Try fnm
	const fnmDir = path.join(os.homedir(), '.local', 'share', 'fnm', 'node-versions')
	if (fs.existsSync(fnmDir)) {
		const versions = fs.readdirSync(fnmDir).sort().reverse()
		for (const v of versions) {
			const candidate = path.join(fnmDir, v, 'installation', 'bin', 'node')
			if (fs.existsSync(candidate)) {
				_nodeBin = candidate
				return _nodeBin
			}
		}
	}

	// 3. Common system paths
	for (const p of ['/usr/local/bin/node', '/usr/bin/node']) {
		if (fs.existsSync(p)) {
			_nodeBin = p
			return _nodeBin
		}
	}

	// 4. Last resort
	_nodeBin = 'node'
	return _nodeBin
}

/**
 * Spawns preview-worker.js as a child process to build a component to GLB.
 * Returns a Buffer of the GLB file contents.
 */
class BuildBridge {
	constructor(extensionPath, output) {
		// Resolve symlink so ../falcra-assets works (VS Code reports the symlink path)
		this._extensionPath = fs.realpathSync(extensionPath)
		this._output = output
		this._pending = null
		this._seq = 0
	}

	/**
	 * Build a component to GLB.
	 * @param {string} componentPath - Absolute path to the .jsx file
	 * @param {object} props - Props to pass to the component
	 * @param {string} atlasDir - Absolute path to the atlas directory
	 * @param {object} [mounts] - Mount config { "Mount_Name": { component, mounts } }
	 * @returns {Promise<{glbBuffer: Buffer, mountTree: Array}>}
	 */
	async build(componentPath, props, atlasDir, mounts) {
		const seq = ++this._seq

		// Cancel any pending build — only the latest matters
		if (this._pending) {
			this._pending.cancelled = true
		}

		const handle = { cancelled: false }
		this._pending = handle

		const outPath = path.join(os.tmpdir(), `falcra-preview-${seq}.glb`)
		const assetsDir = path.resolve(this._extensionPath, '..', 'falcra-assets')
		const workerPath = path.join(this._extensionPath, 'preview-worker.mjs')
		const loaderPath = path.join(assetsDir, 'jsx-loader.js')

		const request = JSON.stringify({ componentPath, props, atlasDir, assetsDir, outPath, mounts })

		try {
			const nodeBin = getNodeBin()
			this._output.appendLine(`[build] node: ${nodeBin}`)
			this._output.appendLine(`[build] worker: ${workerPath}`)
			this._output.appendLine(`[build] loader: ${loaderPath}`)
			this._output.appendLine(`[build] cwd: ${path.resolve(this._extensionPath, '..', 'falcra-assets')}`)
			const result = await new Promise((resolve, reject) => {
				const child = spawn(nodeBin, [
					'--import', loaderPath,
					workerPath,
				], {
					cwd: path.resolve(this._extensionPath, '..', 'falcra-assets'),
					stdio: ['pipe', 'pipe', 'pipe'],
					env: { ...process.env, NODE_NO_WARNINGS: '1' },
				})

				let stdout = ''
				let stderr = ''

				child.stdout.on('data', chunk => { stdout += chunk })
				child.stderr.on('data', chunk => { stderr += chunk })

				child.stdin.write(request)
				child.stdin.end()

				child.on('close', code => {
					if (handle.cancelled) {
						reject(new Error('Build cancelled'))
						return
					}

					if (code !== 0) {
						reject(new Error(`Worker exited with code ${code}: ${stderr}\n${stdout}`))
						return
					}

					try {
						const parsed = JSON.parse(stderr)
						if (!parsed.ok) {
							reject(new Error(parsed.error))
						} else {
							resolve({ byteLength: parsed.byteLength, meshCount: parsed.meshCount, mountTree: parsed.mountTree || [], animations: parsed.animations || null })
						}
					} catch {
						reject(new Error(`Invalid worker output: ${stderr}`))
					}
				})

				child.on('error', reject)
			})

			if (handle.cancelled) {
				throw new Error('Build cancelled')
			}

			// Read the GLB file
			const glbBuffer = fs.readFileSync(outPath)

			// Clean up temp file
			try { fs.unlinkSync(outPath) } catch {}

			return { glbBuffer, mountTree: result.mountTree, animations: result.animations }
		} catch (err) {
			// Clean up temp file on error too
			try { fs.unlinkSync(outPath) } catch {}
			throw err
		} finally {
			if (this._pending === handle) {
				this._pending = null
			}
		}
	}

	dispose() {
		if (this._pending) {
			this._pending.cancelled = true
			this._pending = null
		}
	}
}

module.exports = { BuildBridge }
