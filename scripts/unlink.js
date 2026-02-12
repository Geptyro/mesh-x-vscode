const fs = require('fs')
const path = require('path')
const os = require('os')

const home = os.homedir()
const serverDir = path.join(home, '.vscode-server', 'extensions')
const nativeDir = path.join(home, '.vscode', 'extensions')
const extensionsDir = fs.existsSync(serverDir) ? serverDir : nativeDir

const target = path.join(extensionsDir, 'falcra-vscode')

if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
	fs.unlinkSync(target)
	console.log(`Removed: ${target}`)
	console.log('Reload VS Code window to deactivate.')
} else {
	console.log('No symlink found.')
}
