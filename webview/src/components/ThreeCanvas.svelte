<script>
	import { onMount } from 'svelte'
	import * as THREE from 'three'
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
	import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
	import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
	import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
	import { createIKSolver } from '../lib/ikSolver.js'
	import { discoverMorphAnims } from '../lib/morphDiscovery.js'
	import { computeSceneStats } from '../lib/sceneStats.js'
	import { editor } from '../stores/editor.svelte.js'
	import { anim } from '../stores/animation.svelte.js'

	let { onSceneReady, children } = $props()

	let canvasEl
	let panelEl

	// Three.js objects — plain local vars, NOT reactive
	let renderer, scene, camera, controls, composer, bloomPass
	let modelGroup, loader, clock
	let mixer = null
	let boneMap = {}
	let skeletonHelper = null
	let ikSolver = null
	let morphMesh = null
	let autoFitNext = true
	let animElapsed = 0
	let morphAnimElapsed = 0
	let atlasMaterial = null
	const textureLoader = new THREE.TextureLoader()

	onMount(() => {
		// Renderer
		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true })
		renderer.setPixelRatio(window.devicePixelRatio)
		renderer.outputColorSpace = THREE.SRGBColorSpace

		// Scene
		scene = new THREE.Scene()
		scene.background = new THREE.Color(0xbfbfbf)

		// Camera
		camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
		camera.position.set(2, 1.5, 2)

		// Controls
		controls = new OrbitControls(camera, canvasEl)
		controls.enableDamping = true
		controls.dampingFactor = 0.1

		// Lighting
		const ambientLight = new THREE.AmbientLight(0xffffff, 3.0)
		scene.add(ambientLight)
		const dirLight = new THREE.DirectionalLight(0xffffff, 3.0)
		dirLight.position.set(3, 5, 4)
		scene.add(dirLight)
		const fillLight = new THREE.DirectionalLight(0xffffff, 1.5)
		fillLight.position.set(-3, 2, -2)
		scene.add(fillLight)
		const backLight = new THREE.DirectionalLight(0xffffff, 1.0)
		backLight.position.set(0, 3, -4)
		scene.add(backLight)

		// Grid
		const grid = new THREE.GridHelper(10, 40, 0x999999, 0xaaaaaa)
		scene.add(grid)

		// Model container
		modelGroup = new THREE.Group()
		scene.add(modelGroup)

		loader = new GLTFLoader()
		clock = new THREE.Clock()

		// Post-processing
		composer = new EffectComposer(renderer)
		composer.addPass(new RenderPass(scene, camera))
		bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 0.7)
		composer.addPass(bloomPass)

		// Resize
		function resize() {
			const w = panelEl.clientWidth
			const h = panelEl.clientHeight
			renderer.setSize(w, h)
			composer.setSize(w, h)
			camera.aspect = w / h
			camera.updateProjectionMatrix()
		}
		window.addEventListener('resize', resize)
		new ResizeObserver(resize).observe(panelEl)

		// Animate loop
		function animate() {
			requestAnimationFrame(animate)
			const delta = clock.getDelta()
			animElapsed += delta

			// Skeleton helper visibility
			if (skeletonHelper) {
				skeletonHelper.visible = anim.skeletonVisible
			}

			// Procedural animation
			if (anim.proceduralAnims && Object.keys(boneMap).length > 0) {
				for (const bone of Object.values(boneMap)) {
					bone.rotation.set(0, 0, 0)
				}
				if (anim.proceduralRestPose) {
					for (const [name, rot] of Object.entries(anim.proceduralRestPose)) {
						if (boneMap[name]) {
							if (rot.x) boneMap[name].rotation.x = rot.x
							if (rot.y) boneMap[name].rotation.y = rot.y
							if (rot.z) boneMap[name].rotation.z = rot.z
						}
					}
				}

				const hasLayer = anim.layerLegs || anim.layerUpper
				const hasAnim = anim.currentProceduralAnim && anim.proceduralAnims[anim.currentProceduralAnim]

				if (hasLayer) {
					if (anim.layerLegs && anim.proceduralAnims[anim.layerLegs] && anim.proceduralMasks) {
						const mask = anim.proceduralMasks.lowerBody
						const filtered = applyMask(boneMap, mask)
						anim.proceduralAnims[anim.layerLegs].fn(animElapsed, filtered, anim.animSpeed, ikSolver)
					}
					if (anim.layerUpper && anim.proceduralAnims[anim.layerUpper] && anim.proceduralMasks) {
						const mask = anim.proceduralMasks.upperBody
						const filtered = applyMask(boneMap, mask)
						anim.proceduralAnims[anim.layerUpper].fn(animElapsed, filtered, anim.animSpeed, ikSolver)
					}
				} else if (hasAnim) {
					anim.proceduralAnims[anim.currentProceduralAnim].fn(animElapsed, boneMap, anim.animSpeed, ikSolver)
				}
			} else if (mixer) {
				mixer.update(delta)
			} else if (anim.morphAnims && morphMesh) {
				morphAnimElapsed += delta
				const influences = morphMesh.morphTargetInfluences
				for (let i = 0; i < influences.length; i++) influences[i] = 0

				for (const animName of anim.activeMorphAnims) {
					const targets = anim.morphAnims[animName]
					if (!targets) continue
					const n = targets.length
					const t = morphAnimElapsed * anim.morphAnimSpeed
					const phase = ((t % 1.0) + 1.0) % 1.0
					const framePhase = phase * n
					const frameA = Math.floor(framePhase) % n
					const frameB = (frameA + 1) % n
					const blend = framePhase - Math.floor(framePhase)

					influences[targets[frameA]] += 1 - blend
					influences[targets[frameB]] += blend
				}
			}

			controls.update()
			composer.render()
		}

		animate()
		resize()

		// Expose API to parent
		onSceneReady({
			loadGLB,
			getDrawCalls: () => renderer.info.render.calls,
			getMorphMesh: () => morphMesh,
		})

		return () => {
			renderer.dispose()
		}
	})

	function applyMask(bones, mask) {
		if (!mask) return bones
		const filtered = {}
		for (const name of mask) {
			if (bones[name]) filtered[name] = bones[name]
		}
		return filtered
	}

	function fitCamera(object) {
		const box = new THREE.Box3().setFromObject(object)
		const center = box.getCenter(new THREE.Vector3())
		const size = box.getSize(new THREE.Vector3())
		const maxDim = Math.max(size.x, size.y, size.z)
		const dist = maxDim / (2 * Math.tan(camera.fov * Math.PI / 360))

		controls.target.copy(center)
		camera.position.set(
			center.x + dist * 0.8,
			center.y + dist * 0.6,
			center.z + dist * 0.8
		)
		camera.lookAt(center)
		controls.update()
	}

	function ensureAtlasMaterial() {
		if (atlasMaterial) return atlasMaterial
		const urls = editor.atlasTextures
		if (!urls) return null

		const baseColor = textureLoader.load(urls.atlas_base_color)
		baseColor.colorSpace = THREE.SRGBColorSpace
		baseColor.flipY = false
		baseColor.wrapS = THREE.RepeatWrapping
		baseColor.wrapT = THREE.RepeatWrapping
		const orm = textureLoader.load(urls.atlas_orm)
		orm.flipY = false
		orm.wrapS = THREE.RepeatWrapping
		orm.wrapT = THREE.RepeatWrapping
		const emission = textureLoader.load(urls.atlas_emission)
		emission.flipY = false
		emission.wrapS = THREE.RepeatWrapping
		emission.wrapT = THREE.RepeatWrapping

		atlasMaterial = new THREE.MeshStandardMaterial({
			map: baseColor,
			roughnessMap: orm,
			roughness: 1.0,
			metalnessMap: orm,
			metalness: 1.0,
			aoMap: orm,
			emissiveMap: emission,
			emissive: new THREE.Color(1, 1, 1),
		})
		return atlasMaterial
	}

	function loadGLB(base64) {
		const binary = atob(base64)
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i)
		}

		loader.parse(bytes.buffer, '', gltf => {
			// Clear old model + mixer
			if (mixer) {
				mixer.stopAllAction()
				mixer = null
			}
			if (skeletonHelper) {
				scene.remove(skeletonHelper)
				skeletonHelper.dispose()
				skeletonHelper = null
			}
			boneMap = {}
			while (modelGroup.children.length > 0) {
				const child = modelGroup.children[0]
				modelGroup.remove(child)
				child.traverse(obj => {
					if (obj.geometry) obj.geometry.dispose()
					// Don't dispose the shared atlas material
					if (obj.material && obj.material !== atlasMaterial) {
						if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
						else obj.material.dispose()
					}
				})
			}

			modelGroup.add(gltf.scene)

			// Apply atlas material (GLBs are texture-less, UVs map to shared atlas)
			const mat = ensureAtlasMaterial()
			if (mat) {
				gltf.scene.traverse(obj => {
					if (obj.isMesh) obj.material = mat
				})
			}

			// Discover morph target animations
			anim.morphAnims = null
			morphMesh = null
			anim.activeMorphAnims = new Set()
			morphAnimElapsed = 0
			gltf.scene.traverse(obj => {
				if (obj.isMesh && obj.morphTargetDictionary && !morphMesh) {
					const discovered = discoverMorphAnims(obj.morphTargetDictionary)
					if (discovered) {
						anim.morphAnims = discovered
						morphMesh = obj
					}
				}
			})

			// Build boneMap from skeleton
			gltf.scene.traverse(obj => {
				if (obj.isSkinnedMesh && obj.skeleton) {
					for (const bone of obj.skeleton.bones) {
						boneMap[bone.name] = bone
					}
				}
			})

			// Create IK solver
			if (anim.proceduralChains && Object.keys(boneMap).length > 0) {
				ikSolver = createIKSolver(boneMap, anim.proceduralChains)
			} else {
				ikSolver = null
			}

			// Create SkeletonHelper
			if (Object.keys(boneMap).length > 0) {
				let skelRoot = null
				for (const bone of Object.values(boneMap)) {
					if (!bone.parent || !bone.parent.isBone) {
						skelRoot = bone
						break
					}
				}
				if (skelRoot) {
					skeletonHelper = new THREE.SkeletonHelper(skelRoot)
					skeletonHelper.visible = false
					scene.add(skeletonHelper)
				}
			}

			// Decide which animation UI to show
			if (anim.proceduralAnims && Object.keys(boneMap).length > 0) {
				anim.clipActions = []
			} else if (gltf.animations.length > 0) {
				mixer = new THREE.AnimationMixer(gltf.scene)
				const actions = []
				for (const clip of gltf.animations) {
					const action = mixer.clipAction(clip)
					action.play()
					actions.push({ name: clip.name, action })
				}
				anim.clipActions = actions
			} else if (anim.morphAnims) {
				anim.activeMorphAnims = new Set([Object.keys(anim.morphAnims)[0]])
				anim.clipActions = []
			} else {
				anim.clipActions = []
			}

			// Auto-fit camera on first load
			if (autoFitNext) {
				autoFitNext = false
				fitCamera(gltf.scene)
			}

			// Compute scene stats after one render
			const glbByteLength = binary.length
			requestAnimationFrame(() => {
				editor.lastSceneStats = computeSceneStats(gltf.scene, glbByteLength)
			})

			editor.statusText = ''
		}, err => {
			editor.statusText = 'GLB parse error: ' + err.message
		})
	}
</script>

<div id="preview-panel" bind:this={panelEl}>
	<canvas id="preview-canvas" bind:this={canvasEl}></canvas>
	{@render children()}
</div>
