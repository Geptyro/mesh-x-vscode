/**
 * Preview worker — standalone Node.js script.
 * Reads a JSON request from stdin, imports a JSX component,
 * calls it with props, and writes the resulting GLB to outPath.
 *
 * Resolves mesh-x from the project context (assetsDir, passed in request)
 * so the extension doesn't need mesh-x as a direct dependency.
 *
 * Stdin JSON: { componentPath, props, atlasDir, assetsDir, outPath, mounts }
 * Stderr JSON: { ok: true, byteLength, meshCount, mountTree } or { ok: false, error }
 * (stderr used to avoid console.log pollution from imported components)
 */
import { createRequire } from 'node:module'
import { join, resolve, dirname } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

/**
 * Find Mount_* empties that are direct descendants of node's subtree,
 * stopping at mount boundaries (don't recurse into another Mount_* empty).
 */
function discoverDirectMounts(node, Empty) {
	const mounts = []
	function recurse(n) {
		for (const child of n.children) {
			if (child instanceof Empty && child.name && child.name.startsWith('Mount_')) {
				// `accepts` (set on the <Empty> in JSX) is the component type this socket
				// can hold — surfaced so the editor can filter the per-mount dropdown.
				mounts.push({ name: child.name, accepts: child.accepts || null })
				// Don't recurse into this mount — it's a boundary
			} else {
				recurse(child)
			}
		}
	}
	recurse(node)
	return mounts
}

/**
 * Combined discover + resolve that returns a hierarchical mount tree.
 * For each discovered mount empty, if mountsConfig has a component for it:
 *   - Build it with merged props (defaults + per-mount overrides)
 *   - Attach at the mount point
 *   - Recurse into the built component's own mount empties
 * Returns [{ name, component, childMounts: [...] }]
 */
async function resolveMountsTree(node, mountsConfig, assetsDir, Empty, Scene, atlasDir, visited) {
	const directMounts = discoverDirectMounts(node, Empty)
	const tree = []

	for (const { name: mountName, accepts } of directMounts) {
		const mountConfig = (mountsConfig && mountsConfig[mountName]) || {}
		const treeNode = { name: mountName, accepts, component: mountConfig.component || null, childMounts: [] }

		if (mountConfig.component) {
			const componentRef = mountConfig.component

			// Circular-ref detection: block only a true ANCESTOR cycle (a component
			// that transitively mounts itself). `visited` is the chain of ancestors on
			// THIS branch — NOT mutated here, so sibling sockets reusing the same
			// component (e.g. a Rocket in every RocketPod tube) each still build.
			if (visited.has(componentRef)) {
				tree.push(treeNode)
				continue
			}

			// Resolve component path
			const jsxPath = resolve(assetsDir, 'src', componentRef + '.jsx')
			if (!existsSync(jsxPath)) {
				tree.push(treeNode)
				continue
			}

			// Read .meshx.json defaults for the component
			const parts = componentRef.split('/')
			const componentName = parts[parts.length - 1]
			const componentDir = resolve(assetsDir, 'src', ...parts.slice(0, -1))
			const configPath = join(componentDir, componentName + '.meshx.json')
			let componentProps = {}
			if (existsSync(configPath)) {
				try {
					const config = JSON.parse(readFileSync(configPath, 'utf8'))
					for (const [key, def] of Object.entries(config.props || {})) {
						if (def.default !== undefined) {
							componentProps[key] = def.default
						}
					}
				} catch {}
			}

			// Merge per-mount prop overrides
			if (mountConfig.props) {
				Object.assign(componentProps, mountConfig.props)
			}

			// Build the component
			const mod = await import(`${jsxPath}?t=${Date.now()}`)
			const result = mod.default(componentProps)
			const childNode = result.mesh || result

			// Find the mount point in the scene
			const mountPoint = node.findByName(mountName)
			if (!mountPoint) {
				tree.push(treeNode)
				continue
			}

			// Attach: Scene → move children; otherwise add directly
			if (childNode instanceof Scene) {
				for (const child of [...childNode.children]) {
					mountPoint.add(child)
				}
			} else {
				mountPoint.add(childNode)
			}

			// Recurse into built component's mount empties. Pass a fresh ancestor
			// chain (visited + this component) so the cycle guard is path-scoped and
			// siblings don't see each other's components.
			treeNode.childMounts = await resolveMountsTree(
				mountPoint, mountConfig.mounts || {}, assetsDir, Empty, Scene, atlasDir, new Set(visited).add(componentRef)
			)
		}

		tree.push(treeNode)
	}

	return tree
}

async function run() {
	const chunks = []
	for await (const chunk of process.stdin) {
		chunks.push(chunk)
	}
	const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
	const { componentPath, props, atlasDir, assetsDir, outPath, mounts } = input

	// Resolve mesh-x from the project's node_modules (assetsDir = discovered project root)
	const assetRequire = createRequire(join(assetsDir, 'package.json'))
	const glbPath = assetRequire.resolve('mesh-x')
	const { Scene, Empty, writeGlb } = await import(glbPath)

	const mod = await import(`${componentPath}?t=${Date.now()}`)
	const result = mod.default(props)
	const mesh = result.mesh || result

	let scene
	if (mesh instanceof Scene) {
		scene = mesh
	} else {
		scene = new Scene({ name: 'preview' })
		scene.add(mesh)
	}

	// Resolve mounts and build hierarchical tree
	const mountTree = await resolveMountsTree(scene, mounts || {}, assetsDir, Empty, Scene, atlasDir, new Set())

	const stats = writeGlb(scene, outPath, { atlasDir, embedTextures: false })

	// Detect and serialize procedural animations
	let animations = null
	const configPath = componentPath.replace(/\.jsx$/, '.meshx.json')
	if (existsSync(configPath)) {
		try {
			const config = JSON.parse(readFileSync(configPath, 'utf8'))
			if (config.animations) {
				const animPath = resolve(dirname(configPath), config.animations)
				const animMod = await import(`${animPath}?t=${Date.now()}`)

				// Serialize animation functions
				const entries = {}
				if (animMod.ANIMATIONS) {
					for (const [key, anim] of Object.entries(animMod.ANIMATIONS)) {
						entries[key] = {
							label: anim.label,
							mask: anim.mask || null,
							fnSource: anim.fn.toString(),
						}
					}
				}

				// Serialize masks (Set → Array)
				const masks = {}
				if (animMod.MASKS) {
					for (const [key, set] of Object.entries(animMod.MASKS)) {
						masks[key] = set ? [...set] : null
					}
				}

				// Serialize rest pose (plain object, JSON-safe as-is)
			const restPose = animMod.REST_POSE || null

			// Serialize IK chains (plain object with arrays, JSON-safe)
			const chains = animMod.IK_CHAINS || null

			animations = { entries, masks, restPose, chains }
			}
		} catch (e) {
			// stdout is safe for debug logging (stderr is for JSON result)
			console.log('[animations] serialization error:', e.message)
		}
	}

	process.stderr.write(JSON.stringify({
		ok: true,
		byteLength: stats.byteLength,
		meshCount: stats.meshCount,
		mountTree,
		animations,
	}))
}

run().catch(err => {
	process.stderr.write(JSON.stringify({ ok: false, error: err.message }))
	process.exitCode = 1
})
