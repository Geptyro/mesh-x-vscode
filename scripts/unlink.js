const fs = require('fs')
const path = require('path')
const os = require('os')

const home = os.homedir()
const serverDir = path.join(home, '.vscode-server', 'extensions')
const nativeDir = path.join(home, '.vscode', 'extensions')
const extensionsDir = fs.existsSync(serverDir) ? serverDir : nativeDir

// lstat (not existsSync) so dangling links are still removed.
function removeLink(p) {
	let stat
	try { stat = fs.lstatSync(p) } catch { return false }
	if (stat.isSymbolicLink()) {
		fs.unlinkSync(p)
		console.log(`Removed: ${p}`)
		return true
	}
	return false
}

let removed = false
removed = removeLink(path.join(extensionsDir, 'mesh-x-vscode')) || removed
removed = removeLink(path.join(extensionsDir, 'falcra-vscode')) || removed // legacy

if (removed) {
	console.log('Reload VS Code window to deactivate.')
} else {
	console.log('No symlink found.')
}
