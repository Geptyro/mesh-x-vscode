/**
 * Atlas worker — standalone Node.js script.
 *
 * Reads a JSON request from stdin, regenerates the atlas PNGs (base_color / orm
 * / emission) for a given atlas directory from its atlas_palette.json, using the
 * project's mesh-x generator. Used by the palette editor after a swatch edit.
 *
 * Resolves mesh-x from the project context (assetsDir) so the extension doesn't
 * need mesh-x (or sharp) as a direct dependency.
 *
 * Stdin JSON: { atlasDir, assetsDir }
 * Stderr JSON: { ok: true } or { ok: false, error }
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

async function run() {
	const chunks = []
	for await (const chunk of process.stdin) chunks.push(chunk)
	const { atlasDir, assetsDir } = JSON.parse(Buffer.concat(chunks).toString('utf8'))

	const assetRequire = createRequire(join(assetsDir, 'package.json'))
	const genPath = assetRequire.resolve('mesh-x/pipeline/atlas/generateAtlas.js')
	const { default: generateAtlas } = await import(genPath)

	// Palette defaults to atlasDir/atlas_palette.json inside the generator.
	await generateAtlas(atlasDir)

	process.stderr.write(JSON.stringify({ ok: true }))
}

run().catch(err => {
	process.stderr.write(JSON.stringify({ ok: false, error: err.message }))
	process.exitCode = 1
})
