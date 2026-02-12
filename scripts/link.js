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

const target = path.join(extensionsDir, 'falcra-vscode')

if (fs.existsSync(target)) {
	const stat = fs.lstatSync(target)
	if (stat.isSymbolicLink()) {
		fs.unlinkSync(target)
	} else {
		console.error(`${target} exists and is not a symlink — remove it manually`)
		process.exit(1)
	}
}

fs.symlinkSync(extensionDir, target, 'dir')
console.log(`Linked: ${target} -> ${extensionDir}`)
console.log('Reload VS Code window (Ctrl+Shift+P -> "Reload Window") to activate.')
