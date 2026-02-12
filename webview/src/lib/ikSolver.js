import * as THREE from 'three'

/**
 * 2-bone analytical IK solver.
 * Uses law of cosines for joint angles, matrix-basis for bone orientation.
 * Targets are in Root-bone-local coordinates (Y-up).
 */
export function createIKSolver(boneMap, chainDefs) {
	const rootBone = boneMap['Root']

	const chains = {}
	for (const [name, def] of Object.entries(chainDefs)) {
		chains[name] = {
			bone1Name: def.bones[0],
			bone2Name: def.bones[1],
			L1: def.lengths[0],
			L2: def.lengths[1],
			poleVec: new THREE.Vector3(def.pole[0], def.pole[1], def.pole[2]),
		}
	}

	const _rootPos = new THREE.Vector3()
	const _target = new THREE.Vector3()
	const _fwd = new THREE.Vector3()
	const _perpPole = new THREE.Vector3()
	const _mid = new THREE.Vector3()
	const _bone1Dir = new THREE.Vector3()
	const _bone2Dir = new THREE.Vector3()
	const _parentQuat = new THREE.Quaternion()
	const _worldQuat = new THREE.Quaternion()
	const _basisX = new THREE.Vector3()
	const _basisY = new THREE.Vector3()
	const _basisZ = new THREE.Vector3()
	const _matrix = new THREE.Matrix4()

	function orientBone(bone, boneDir, parentBone) {
		const dot = _perpPole.dot(boneDir)
		_basisZ.copy(_perpPole).addScaledVector(boneDir, -dot)
		if (_basisZ.lengthSq() < 0.0001) return
		_basisZ.normalize()

		_basisY.copy(boneDir).negate()
		_basisX.crossVectors(_basisY, _basisZ)

		_matrix.makeBasis(_basisX, _basisY, _basisZ)
		_worldQuat.setFromRotationMatrix(_matrix)

		parentBone.getWorldQuaternion(_parentQuat)
		_parentQuat.invert()
		bone.quaternion.copy(_worldQuat).premultiply(_parentQuat)
	}

	return {
		reach(chainName, tx, ty, tz) {
			try {
				const chain = chains[chainName]
				if (!chain) return

				const bone1 = boneMap[chain.bone1Name]
				const bone2 = boneMap[chain.bone2Name]
				if (!bone1 || !bone2 || !bone1.parent) return

				const L1 = chain.L1
				const L2 = chain.L2

				if (rootBone) {
					rootBone.updateWorldMatrix(true, false)
					rootBone.getWorldPosition(_target)
					_target.x += tx
					_target.y += ty
					_target.z += tz
				} else {
					_target.set(tx, ty, tz)
				}

				bone1.updateWorldMatrix(true, false)
				bone1.getWorldPosition(_rootPos)

				_fwd.copy(_target).sub(_rootPos)
				let dist = _fwd.length()

				if (dist < 0.0001) {
					_fwd.set(0, -1, 0)
					dist = L1 * 0.5
				} else {
					_fwd.normalize()
				}

				const maxReach = L1 + L2 - 0.001
				const minReach = Math.abs(L1 - L2) + 0.001
				dist = Math.max(minReach, Math.min(maxReach, dist))

				const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)
				const angle1 = Math.acos(Math.max(-1, Math.min(1, cosA)))

				const poleDot = chain.poleVec.dot(_fwd)
				_perpPole.copy(chain.poleVec).addScaledVector(_fwd, -poleDot)

				if (_perpPole.lengthSq() < 0.0001) {
					_perpPole.set(0, 0, 1)
					const fd = _perpPole.dot(_fwd)
					_perpPole.addScaledVector(_fwd, -fd)
					if (_perpPole.lengthSq() < 0.0001) {
						_perpPole.set(0, -1, 0)
						_perpPole.addScaledVector(_fwd, -_fwd.y)
					}
				}
				if (_perpPole.lengthSq() < 0.0001) return
				_perpPole.normalize()

				const proj = L1 * Math.cos(angle1)
				const h = L1 * Math.sin(angle1)
				_mid.copy(_rootPos).addScaledVector(_fwd, proj).addScaledVector(_perpPole, h)

				_bone1Dir.copy(_mid).sub(_rootPos)
				if (_bone1Dir.lengthSq() < 0.0001) return
				_bone1Dir.normalize()

				_bone2Dir.copy(_rootPos).addScaledVector(_fwd, dist).sub(_mid)
				if (_bone2Dir.lengthSq() < 0.0001) return
				_bone2Dir.normalize()

				orientBone(bone1, _bone1Dir, bone1.parent)
				bone1.updateWorldMatrix(true, false)
				orientBone(bone2, _bone2Dir, bone1)
			} catch (e) {
				console.warn('IK solve error:', e.message)
			}
		},
	}
}
