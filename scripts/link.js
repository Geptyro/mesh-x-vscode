const fs = require('fs')
const path = require('path')
const os = require('os')

const extensionDir = path.resolve(__dirname, '..')
const home = os.homedir()

// WSL2 uses .vscode-server, native uses .vscode
const serverDir = path.join(home, '.vscode-server', 'extensions')
const nativeDir = path.join(home, '.vscode', 'extensions')
const extensionsDir = fs.existsSync(serverDir) ? serverDir : nativeDir

fs.mkdirSync(extensionsDir, { recursive: true })

// Remove a symlink at `p` if present. Uses lstat (not existsSync) so it also
// clears DANGLING links — e.g. the old falcra-vscode link pointing at a path
// that no longer exists after the move to mesh-x-vscode.
function removeLink(p) {
	let stat
	try { stat = fs.lstatSync(p) } catch { return } // nothing there
	if (stat.isSymbolicLink()) {
		fs.unlinkSync(p)
		console.log(`Removed stale link: ${p}`)
	} else {
		console.error(`${p} exists and is not a symlink — remove it manually`)
		process.exit(1)
	}
}

// Clean up the legacy name from before the mesh-x rename.
removeLink(path.join(extensionsDir, 'falcra-vscode'))

const target = path.join(extensionsDir, 'mesh-x-vscode')
removeLink(target)

fs.symlinkSync(extensionDir, target, 'dir')
console.log(`Linked: ${target} -> ${extensionDir}`)
console.log('Reload VS Code window (Ctrl+Shift+P -> "Reload Window") to activate.')
