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
 * Find the asset PROJECT ROOT for a given component file: the nearest ancestor
 * directory from which `mesh-x` resolves — i.e. one that has node_modules/mesh-x,
 * or that IS the mesh-x package (so the package's own examples work via Node's
 * package self-reference). Falls back to the file's own directory.
 *
 * This replaces the old hardcoded `../falcra-assets` assumption, so the extension
 * works for ANY mesh-x asset project (and for self-contained color-mode assets
 * that have no atlas at all).
 */
function findProjectRoot(startPath) {
	let dir = fs.existsSync(startPath) && fs.statSync(startPath).isDirectory()
		? startPath
		: path.dirname(startPath)
	for (let i = 0; i < 20; i++) {
		// A consumer project: has mesh-x installed.
		if (fs.existsSync(path.join(dir, 'node_modules', 'mesh-x'))) return dir
		// The mesh-x package itself (its examples self-reference by name).
		try {
			const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
			if (pkg.name === 'mesh-x') return dir
		} catch { /* no package.json here */ }
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	return path.dirname(startPath)
}

/**
 * Spawns preview-worker.js as a child process to build a component to GLB.
 * Returns a Buffer of the GLB file contents.
 */
class BuildBridge {
	constructor(extensionPath, output) {
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

		const outPath = path.join(os.tmpdir(), `meshx-preview-${seq}.glb`)
		// Project root discovered from the component being previewed — the cwd from
		// which `mesh-x` (the loader + the worker's engine import) resolves. No
		// hardcoded project path; works for any mesh-x asset project.
		const projectRoot = findProjectRoot(componentPath)
		const workerPath = path.join(this._extensionPath, 'preview-worker.mjs')
		const loaderPath = 'mesh-x/pipeline/jsx-loader.js' // resolved from projectRoot cwd

		const request = JSON.stringify({ componentPath, props, atlasDir, assetsDir: projectRoot, outPath, mounts })

		try {
			const nodeBin = getNodeBin()
			this._output.appendLine(`[build] node: ${nodeBin}`)
			this._output.appendLine(`[build] worker: ${workerPath}`)
			this._output.appendLine(`[build] loader: ${loaderPath}`)
			this._output.appendLine(`[build] cwd: ${projectRoot}`)
			const result = await new Promise((resolve, reject) => {
				const child = spawn(nodeBin, [
					'--import', loaderPath,
					workerPath,
				], {
					cwd: projectRoot,
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

module.exports = { BuildBridge, getNodeBin, findProjectRoot }
