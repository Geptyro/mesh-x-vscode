export function computeSceneStats(scene, glbByteLength) {
	let meshes = 0, vertices = 0, triangles = 0, bones = 0, morphTargets = 0
	const materials = new Set()

	scene.traverse(obj => {
		if (obj.isMesh) {
			meshes++
			const geo = obj.geometry
			if (geo.attributes.position) vertices += geo.attributes.position.count
			if (geo.index) {
				triangles += geo.index.count / 3
			} else if (geo.attributes.position) {
				triangles += geo.attributes.position.count / 3
			}
			if (obj.material) {
				const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
				for (const m of mats) materials.add(m)
			}
			if (obj.morphTargetInfluences) morphTargets += obj.morphTargetInfluences.length
		}
		if (obj.isBone) bones++
	})

	return { meshes, vertices, triangles, materials: materials.size, bones, morphTargets, byteLength: glbByteLength }
}

export function formatBytes(bytes) {
	if (bytes < 1024) return bytes + ' B'
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
	return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
