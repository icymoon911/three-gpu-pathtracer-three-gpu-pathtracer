import { PerspectiveCamera, Scene, Vector2, Clock, NormalBlending, NoBlending, AdditiveBlending, WebGLRenderTarget, RGBAFormat, FloatType, NoToneMapping, LinearToneMapping, ReinhardToneMapping, CineonToneMapping, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';
import { PathTracingSceneGenerator } from './PathTracingSceneGenerator.js';
import { PathTracingRenderer } from './PathTracingRenderer.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GradientEquirectTexture } from '../textures/GradientEquirectTexture.js';
import { getIesTextures, getLights, getTextures } from './utils/sceneUpdateUtils.js';
import { ClampedInterpolationMaterial } from '../materials/fullscreen/ClampedInterpolationMaterial.js';
import { CubeToEquirectGenerator } from '../utils/CubeToEquirectGenerator.js';
import { DenoiseMaterial } from '../materials/fullscreen/DenoiseMaterial.js';
import { EXRExporter } from '../utils/EXRExporter.js';

function supportsFloatBlending( renderer ) {

	return renderer.extensions.get( 'EXT_float_blend' );

}

const _resolution = new Vector2();
export class WebGLPathTracer {

	get multipleImportanceSampling() {

		return Boolean( this._pathTracer.material.defines.FEATURE_MIS );

	}

	set multipleImportanceSampling( v ) {

		this._pathTracer.material.setDefine( 'FEATURE_MIS', v ? 1 : 0 );

	}

	get transmissiveBounces() {

		return this._pathTracer.material.transmissiveBounces;

	}

	set transmissiveBounces( v ) {

		this._pathTracer.material.transmissiveBounces = v;

	}

	get bounces() {

		return this._pathTracer.material.bounces;

	}

	set bounces( v ) {

		this._pathTracer.material.bounces = v;

	}

	get filterGlossyFactor() {

		return this._pathTracer.material.filterGlossyFactor;

	}

	set filterGlossyFactor( v ) {

		this._pathTracer.material.filterGlossyFactor = v;

	}

	get samples() {

		return this._pathTracer.samples;

	}

	get target() {

		return this._pathTracer.target;

	}

	get tiles() {

		return this._pathTracer.tiles;

	}

	get stableNoise() {

		return this._pathTracer.stableNoise;

	}

	set stableNoise( v ) {

		this._pathTracer.stableNoise = v;

	}

	get isCompiling() {

		return Boolean( this._pathTracer.isCompiling );

	}

	constructor( renderer ) {

		// members
		this._renderer = renderer;
		this._generator = new PathTracingSceneGenerator();
		this._pathTracer = new PathTracingRenderer( renderer );
		this._queueReset = false;
		this._clock = new Clock();
		this._compilePromise = null;

		this._lowResPathTracer = new PathTracingRenderer( renderer );
		this._lowResPathTracer.tiles.set( 1, 1 );
		this._quad = new FullScreenQuad( new ClampedInterpolationMaterial( {
			map: null,
			transparent: true,
			blending: NoBlending,

			premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha,
		} ) );
		this._materials = null;

		this._previousEnvironment = null;
		this._previousBackground = null;
		this._internalBackground = null;

		// change tracking for incremental updates
		this._changeTracking = {
			lastCameraHash: '',
			lastEnvHash: '',
			lastMaterialsHash: '',
			lastLightHash: '',
		};

		// options
		this.renderDelay = 100;
		this.minSamples = 5;
		this.fadeDuration = 500;
		this.enablePathTracing = true;
		this.pausePathTracing = false;
		this.dynamicLowRes = false;
		this.lowResScale = 0.25;
		this.renderScale = 1;
		this.synchronizeRenderSize = true;
		this.rasterizeScene = true;
		this.renderToCanvas = true;
		this.textureSize = new Vector2( 1024, 1024 );
		this.rasterizeSceneCallback = ( scene, camera ) => {

			this._renderer.render( scene, camera );

		};

		this.renderToCanvasCallback = ( target, renderer, quad ) => {

			const currentAutoClear = renderer.autoClear;
			renderer.autoClear = false;
			quad.render( renderer );
			renderer.autoClear = currentAutoClear;

		};

		// initialize the scene so it doesn't fail
		this.setScene( new Scene(), new PerspectiveCamera() );

	}

	setBVHWorker( worker ) {

		this._generator.setBVHWorker( worker );

	}

	setScene( scene, camera, options = {} ) {

		scene.updateMatrixWorld( true );
		camera.updateMatrixWorld();

		const generator = this._generator;
		generator.setObjects( scene );

		if ( this._buildAsync ) {

			return generator.generateAsync( options.onProgress ).then( result => {

				return this._updateFromResults( scene, camera, result );

			} );

		} else {

			const result = generator.generate();
			return this._updateFromResults( scene, camera, result );

		}

	}

	setSceneAsync( ...args ) {

		this._buildAsync = true;
		const result = this.setScene( ...args );
		this._buildAsync = false;

		return result;

	}

	setCamera( camera ) {

		this.camera = camera;
		this.updateCamera();

	}

	updateCamera() {

		const camera = this.camera;
		camera.updateMatrixWorld();

		this._pathTracer.setCamera( camera );
		this._lowResPathTracer.setCamera( camera );
		this.reset();

	}

	updateMaterials() {

		const material = this._pathTracer.material;
		const renderer = this._renderer;
		const materials = this._materials;
		const textureSize = this.textureSize;

		// reduce texture sources here - we don't want to do this in the
		// textures array because we need to pass the textures array into the
		// material target
		const textures = getTextures( materials );
		material.textures.setTextures( renderer, textures, textureSize.x, textureSize.y );
		material.materials.updateFrom( materials, textures );
		this.reset();

	}

	updateLights() {

		const scene = this.scene;
		const renderer = this._renderer;
		const material = this._pathTracer.material;

		const lights = getLights( scene );
		const iesTextures = getIesTextures( lights );
		material.lights.updateFrom( lights, iesTextures );
		material.iesProfiles.setTextures( renderer, iesTextures );
		this.reset();

	}

	updateEnvironment() {

		const scene = this.scene;
		const material = this._pathTracer.material;

		if ( this._internalBackground ) {

			this._internalBackground.dispose();
			this._internalBackground = null;

		}

		// update scene background
		material.backgroundBlur = scene.backgroundBlurriness;
		material.backgroundIntensity = scene.backgroundIntensity ?? 1;
		material.backgroundRotation.makeRotationFromEuler( scene.backgroundRotation ).invert();
		if ( scene.background === null ) {

			material.backgroundMap = null;
			material.backgroundAlpha = 0;

		} else if ( scene.background.isColor ) {

			this._colorBackground = this._colorBackground || new GradientEquirectTexture( 16 );

			const colorBackground = this._colorBackground;
			if ( ! colorBackground.topColor.equals( scene.background ) ) {

				// set the texture color
				colorBackground.topColor.set( scene.background );
				colorBackground.bottomColor.set( scene.background );
				colorBackground.update();

			}

			// assign to material
			material.backgroundMap = colorBackground;
			material.backgroundAlpha = 1;

		} else if ( scene.background.isCubeTexture ) {

			if ( scene.background !== this._previousBackground ) {

				const background = new CubeToEquirectGenerator( this._renderer ).generate( scene.background );
				this._internalBackground = background;
				material.backgroundMap = background;
				material.backgroundAlpha = 1;

			}

		} else {

			material.backgroundMap = scene.background;
			material.backgroundAlpha = 1;

		}

		// update scene environment
		material.environmentIntensity = scene.environment !== null ? ( scene.environmentIntensity ?? 1 ) : 0;
		material.environmentRotation.makeRotationFromEuler( scene.environmentRotation ).invert();
		if ( this._previousEnvironment !== scene.environment ) {

			if ( scene.environment !== null ) {

				if ( scene.environment.isCubeTexture ) {

					const environment = new CubeToEquirectGenerator( this._renderer ).generate( scene.environment );
					material.envMapInfo.updateFrom( environment );

				} else {

					// TODO: Consider setting this to the highest supported bit depth by checking for
					// OES_texture_float_linear or OES_texture_half_float_linear. Requires changes to
					// the equirect uniform
					material.envMapInfo.updateFrom( scene.environment );

				}

			}

		}

		this._previousEnvironment = scene.environment;
		this._previousBackground = scene.background;
		this.reset();

	}

	_updateFromResults( scene, camera, results ) {

		const {
			materials,
			geometry,
			bvh,
			bvhChanged,
			needsMaterialIndexUpdate,
		} = results;

		this._materials = materials;

		const pathTracer = this._pathTracer;
		const material = pathTracer.material;

		if ( bvhChanged ) {

			material.bvh.updateFrom( bvh );
			material.attributesArray.updateFrom(
				geometry.attributes.normal,
				geometry.attributes.tangent,
				geometry.attributes.uv,
				geometry.attributes.color,
			);

		}

		if ( needsMaterialIndexUpdate ) {

			material.materialIndexAttribute.updateFrom( geometry.attributes.materialIndex );

		}

		// save previously used items
		this._previousScene = scene;
		this.scene = scene;
		this.camera = camera;

		this.updateCamera();
		this.updateMaterials();
		this.updateEnvironment();
		this.updateLights();

		return results;

	}

	/**
	 * Performs an incremental scene update, only rebuilding the parts that
	 * have changed since the last call. This avoids full shader recompilation
	 * and BVH rebuilds when only camera, lights, or material properties change.
	 *
	 * Change categories (from cheapest to most expensive):
	 *   1. Camera-only change  → updateCamera()  (no recompile, no reset if only focus/aperture)
	 *   2. Light-only change   → updateLights()  (no recompile)
	 *   3. Material property   → updateMaterials() (no recompile unless features change)
	 *   4. Environment change  → updateEnvironment() (no recompile)
	 *   5. Geometry change     → full setScene() (recompile + BVH rebuild)
	 *
	 * @param {Object} [options]
	 * @param {boolean} [options.force=false] Force full scene rebuild regardless of detected changes.
	 * @param {Object} [options.changes] Explicitly declare what changed, bypassing auto-detection.
	 *        Supported keys: `camera`, `lights`, `materials`, `environment`, `geometry`.
	 * @returns {string} One of 'none', 'camera', 'lights', 'materials', 'environment', 'geometry'.
	 */
	updateScene( options = {} ) {

		const scene = this.scene;
		const camera = this.camera;
		if ( ! scene || ! camera ) return 'none';

		const force = options.force || false;
		const explicit = options.changes || null;

		// If explicit changes are provided, use them directly
		if ( explicit ) {

			return this._applyExplicitChanges( explicit );

		}

		// Auto-detect changes
		const changeType = this._detectChanges();

		if ( force || changeType === 'geometry' ) {

			this.setScene( scene, camera );
			this._resetChangeTracking();
			return 'geometry';

		}

		if ( changeType === 'none' ) return 'none';

		// Apply detected changes incrementally
		if ( changeType === 'camera' ) {

			this.updateCamera();

		}

		if ( changeType === 'environment' || changeType === 'all' ) {

			this.updateEnvironment();

		}

		if ( changeType === 'lights' || changeType === 'all' ) {

			this.updateLights();

		}

		if ( changeType === 'materials' || changeType === 'all' ) {

			this.updateMaterials();

		}

		this._resetChangeTracking();
		return changeType;

	}

	/**
	 * Applies explicit changes declared by the caller.
	 * @param {Object} changes
	 * @returns {string}
	 * @private
	 */
	_applyExplicitChanges( changes ) {

		let heaviest = 'none';

		if ( changes.geometry ) {

			this.setScene( this.scene, this.camera );
			this._resetChangeTracking();
			return 'geometry';

		}

		if ( changes.camera ) {

			this.updateCamera();
			heaviest = 'camera';

		}

		if ( changes.environment ) {

			this.updateEnvironment();
			heaviest = 'environment';

		}

		if ( changes.lights ) {

			this.updateLights();
			heaviest = 'lights';

		}

		if ( changes.materials ) {

			this.updateMaterials();
			heaviest = 'materials';

		}

		this._resetChangeTracking();
		return heaviest;

	}

	/**
	 * Detects what has changed since the last update by comparing scene state.
	 * Returns the heaviest change type found.
	 * @returns {string} 'none' | 'camera' | 'lights' | 'materials' | 'environment' | 'geometry'
	 * @private
	 */
	_detectChanges() {

		const scene = this.scene;
		const camera = this.camera;
		const tracking = this._changeTracking;

		// Check camera transform changes
		camera.updateMatrixWorld();
		const camHash = this._hashMatrix( camera.matrixWorld ) + this._hashMatrix( camera.projectionMatrix );
		if ( camHash !== tracking.lastCameraHash ) {

			tracking.lastCameraHash = camHash;
			return 'camera';

		}

		// Check scene background/environment changes
		const envHash = ( scene.background ? scene.background.uuid : 'null' ) + ':' +
		                ( scene.environment ? scene.environment.uuid : 'null' );
		if ( envHash !== tracking.lastEnvHash ) {

			tracking.lastEnvHash = envHash;
			return 'environment';

		}

		// Check materials - hash the list of material uuids and their versions
		const materials = this._materials;
		if ( materials ) {

			let matHash = '';
			for ( let i = 0, l = materials.length; i < l; i ++ ) {

				const m = materials[ i ];
				matHash += m.uuid + ':' + ( m.version || 0 ) + ';';

			}

			if ( matHash !== tracking.lastMaterialsHash ) {

				tracking.lastMaterialsHash = matHash;
				return 'materials';

			}

		}

		// Check lights by traversing scene
		let lightHash = '';
		scene.traverse( c => {

			if ( c.visible && ( c.isRectAreaLight || c.isSpotLight || c.isPointLight || c.isDirectionalLight ) ) {

				lightHash += c.uuid + ':' + c.intensity + ':' + c.color.getHex() + ';';

			}

		} );

		if ( lightHash !== tracking.lastLightHash ) {

			tracking.lastLightHash = lightHash;
			return 'lights';

		}

		return 'none';

	}

	/**
	 * @private
	 */
	_hashMatrix( m ) {

		return m.elements.join( ',' );

	}

	/**
	 * @private
	 */
	_resetChangeTracking() {

		const tracking = this._changeTracking;
		const scene = this.scene;
		const camera = this.camera;

		if ( camera ) {

			camera.updateMatrixWorld();
			tracking.lastCameraHash = this._hashMatrix( camera.matrixWorld ) + this._hashMatrix( camera.projectionMatrix );

		}

		if ( scene ) {

			tracking.lastEnvHash = ( scene.background ? scene.background.uuid : 'null' ) + ':' +
			                       ( scene.environment ? scene.environment.uuid : 'null' );

			let lightHash = '';
			scene.traverse( c => {

				if ( c.visible && ( c.isRectAreaLight || c.isSpotLight || c.isPointLight || c.isDirectionalLight ) ) {

					lightHash += c.uuid + ':' + c.intensity + ':' + c.color.getHex() + ';';

				}

			} );
			tracking.lastLightHash = lightHash;

		}

		if ( this._materials ) {

			let matHash = '';
			for ( let i = 0, l = this._materials.length; i < l; i ++ ) {

				const m = this._materials[ i ];
				matHash += m.uuid + ':' + ( m.version || 0 ) + ';';

			}

			tracking.lastMaterialsHash = matHash;

		}

	}

	/**
	 * Convenience: update only the camera without triggering a full scene reset.
	 * Use this when you know only the camera has moved (e.g., orbit controls).
	 * Unlike `updateCamera()`, this does NOT reset the sample count if only
	 * focus/aperture parameters changed (i.e., the camera position and direction
	 * are unchanged).
	 */
	updateCameraOnly( focusOnly = false ) {

		const camera = this.camera;
		if ( ! camera ) return;

		camera.updateMatrixWorld();

		if ( focusOnly ) {

			// Only update DOF parameters, don't reset accumulation
			const material = this._pathTracer.material;
			material.physicalCamera.updateFrom( camera );

		} else {

			this.updateCamera();

		}

	}

	/**
	 * Compute the distance from the camera to the nearest surface along the
	 * view direction through the center of the screen. Useful for auto-focus.
	 * Uses the BVH for efficient raycasting.
	 * @param {number} [ndcX=0] NDC x coordinate (-1 to 1)
	 * @param {number} [ndcY=0] NDC y coordinate (-1 to 1)
	 * @returns {number} Distance to nearest hit, or camera.far if no hit.
	 */
	getSceneDistanceAtNDC( ndcX = 0, ndcY = 0 ) {

		const camera = this.camera;
		if ( ! camera ) return 100;

		camera.updateMatrixWorld();

		const camMatrix = camera.matrixWorld;
		const invProj = camera.projectionMatrixInverse;

		// Get ray origin from camera world position
		const ox = camMatrix.elements[ 12 ];
		const oy = camMatrix.elements[ 13 ];
		const oz = camMatrix.elements[ 14 ];

		// Get ray direction from NDC through inverse projection
		const e = invProj.elements;
		const vx = e[ 0 ] * ndcX + e[ 4 ] * ndcY + e[ 12 ];
		const vy = e[ 1 ] * ndcX + e[ 5 ] * ndcY + e[ 13 ];
		const vz = e[ 2 ] * ndcX + e[ 6 ] * ndcY + e[ 14 ];

		// Transform to world space via camera rotation (upper-left 3x3)
		const wx = camMatrix.elements[ 0 ] * vx + camMatrix.elements[ 4 ] * vy + camMatrix.elements[ 8 ] * vz;
		const wy = camMatrix.elements[ 1 ] * vx + camMatrix.elements[ 5 ] * vy + camMatrix.elements[ 9 ] * vz;
		const wz = camMatrix.elements[ 2 ] * vx + camMatrix.elements[ 6 ] * vy + camMatrix.elements[ 10 ] * vz;

		const len = Math.sqrt( wx * wx + wy * wy + wz * wz );
		const dx = wx / len, dy = wy / len, dz = wz / len;

		// Raycast against the scene using three-mesh-bvh
		const material = this._pathTracer.material;
		const bvh = material.bvh;
		if ( ! bvh ) return camera.far;

		// Use three-mesh-bvh's raycast for accurate intersection
		const result = { distance: camera.far };
		bvh.raycastFirst(
			{ x: ox, y: oy, z: oz },
			{ x: dx, y: dy, z: dz },
			( geometry, hit ) => {

				if ( hit && hit.distance < result.distance ) {

					result.distance = hit.distance;

				}

			}
		);

		return result.distance;

	}

	/**
	 * Simple ray-AABB intersection test.
	 * @private
	 */
	_rayBoxIntersect( origin, dir, box ) {

		const minX = box.min.x, minY = box.min.y, minZ = box.min.z;
		const maxX = box.max.x, maxY = box.max.y, maxZ = box.max.z;

		const invDirX = 1 / dir.x, invDirY = 1 / dir.y, invDirZ = 1 / dir.z;

		const t1 = ( minX - origin.x ) * invDirX;
		const t2 = ( maxX - origin.x ) * invDirX;
		const t3 = ( minY - origin.y ) * invDirY;
		const t4 = ( maxY - origin.y ) * invDirY;
		const t5 = ( minZ - origin.z ) * invDirZ;
		const t6 = ( maxZ - origin.z ) * invDirZ;

		const tmin = Math.max( Math.max( Math.min( t1, t2 ), Math.min( t3, t4 ) ), Math.min( t5, t6 ) );
		const tmax = Math.min( Math.min( Math.max( t1, t2 ), Math.max( t3, t4 ) ), Math.max( t5, t6 ) );

		if ( tmax < 0 || tmin > tmax ) return null;
		return tmin < 0 ? tmax : tmin;

	}

	renderSample() {

		const lowResPathTracer = this._lowResPathTracer;
		const pathTracer = this._pathTracer;
		const renderer = this._renderer;
		const clock = this._clock;
		const quad = this._quad;

		this._updateScale();

		if ( this._queueReset ) {

			pathTracer.reset();
			lowResPathTracer.reset();
			this._queueReset = false;

			quad.material.opacity = 0;
			clock.start();

		}

		// render the path tracing sample after enough time has passed
		const delta = clock.getDelta() * 1e3;
		const elapsedTime = clock.getElapsedTime() * 1e3;
		if ( ! this.pausePathTracing && this.enablePathTracing && this.renderDelay <= elapsedTime && ! this.isCompiling ) {

			pathTracer.update();

		}

		// when alpha is enabled we use a manual blending system rather than
		// rendering with a blend function
		pathTracer.alpha = pathTracer.material.backgroundAlpha !== 1 || ! supportsFloatBlending( renderer );
		lowResPathTracer.alpha = pathTracer.alpha;

		if ( this.renderToCanvas ) {

			const renderer = this._renderer;
			const minSamples = this.minSamples;

			if ( elapsedTime >= this.renderDelay && this.samples >= this.minSamples ) {

				if ( this.fadeDuration !== 0 ) {

					quad.material.opacity = Math.min( quad.material.opacity + delta / this.fadeDuration, 1 );

				} else {

					quad.material.opacity = 1;

				}

			}

			// render the fallback if we haven't rendered enough samples, are paused, or are occluded
			if ( ! this.enablePathTracing || this.samples < minSamples || quad.material.opacity < 1 ) {

				if ( this.dynamicLowRes && ! this.isCompiling ) {

					if ( lowResPathTracer.samples < 1 ) {

						lowResPathTracer.material = pathTracer.material;
						lowResPathTracer.update();

					}

					const currentOpacity = quad.material.opacity;
					quad.material.opacity = 1 - quad.material.opacity;
					quad.material.map = lowResPathTracer.target.texture;
					quad.render( renderer );
					quad.material.opacity = currentOpacity;

				}

				if ( ! this.dynamicLowRes && this.rasterizeScene || this.dynamicLowRes && this.isCompiling ) {

					this.rasterizeSceneCallback( this.scene, this.camera );

				}

			}


			if ( this.enablePathTracing && quad.material.opacity > 0 ) {

				if ( quad.material.opacity < 1 ) {

					// use additive blending when the low res texture is rendered so we can fade the
					// background out while the full res fades in
					quad.material.blending = this.dynamicLowRes ? AdditiveBlending : NormalBlending;

				}

				quad.material.map = pathTracer.target.texture;
				this.renderToCanvasCallback( pathTracer.target, renderer, quad );
				quad.material.blending = NoBlending;

			}

		}

	}

	reset() {

		this._queueReset = true;
		this._pathTracer.samples = 0;

	}

	/**
	 * Export the current render result to EXR or PNG format.
	 * Waits for the specified number of samples to accumulate before exporting.
	 * @param {Object} options - Export options
	 * @param {number} [options.minSamples] - Minimum samples to wait for (defaults to current samples)
	 * @param {string} [options.format='exr'] - Export format: 'exr' or 'png'
	 * @param {boolean} [options.denoise=false] - Apply denoising before export
	 * @param {Object} [options.denoiseOptions] - Denoise parameters
	 * @param {number} [options.denoiseOptions.sigma=5.0] - Denoise sigma
	 * @param {number} [options.denoiseOptions.threshold=0.03] - Denoise threshold
	 * @param {number} [options.denoiseOptions.kSigma=1.0] - Denoise kSigma
	 * @param {boolean} [options.includeAlpha=false] - Include alpha channel in export
	 * @param {Function} [options.onProgress] - Progress callback (phase: string, progress: 0-1)
	 * @returns {Promise<{data: ArrayBuffer|Blob, format: string, samples: number, denoised: boolean}>}
	 */
	async exportAsync( options = {} ) {

		const {
			minSamples = this.samples,
			format = 'exr',
			denoise = false,
			denoiseOptions = {},
			includeAlpha = false,
			onProgress = null,
		} = options;

		// Wait for minimum samples
		while ( this.samples < minSamples ) {

			if ( onProgress ) onProgress( 'waiting', this.samples / minSamples );
			await new Promise( resolve => setTimeout( resolve, 100 ) );

		}

		if ( onProgress ) onProgress( 'waiting', 1.0 );

		const renderer = this._renderer;
		const pathTracer = this._pathTracer;

		// Get the appropriate render target based on alpha mode
		const sourceTarget = pathTracer.target;
		const width = sourceTarget.width;
		const height = sourceTarget.height;

		// Optionally apply denoising
		let exportTarget = sourceTarget;
		let denoiseQuad = null;

		if ( denoise ) {

			if ( onProgress ) onProgress( 'denoising', 0.0 );

			// Create temporary render target for denoised output
			exportTarget = new WebGLRenderTarget( width, height, {
				format: RGBAFormat,
				type: FloatType,
			} );

			// Create denoise material and quad
			const denoiseMaterial = new DenoiseMaterial( {
				map: sourceTarget.texture,
				sigma: denoiseOptions.sigma ?? 5.0,
				threshold: denoiseOptions.threshold ?? 0.03,
				kSigma: denoiseOptions.kSigma ?? 1.0,
			} );

			denoiseQuad = new FullScreenQuad( denoiseMaterial );

			// Render denoised result
			const prevRenderTarget = renderer.getRenderTarget();
			const prevAutoClear = renderer.autoClear;

			renderer.setRenderTarget( exportTarget );
			renderer.autoClear = true;
			denoiseQuad.render( renderer );

			renderer.setRenderTarget( prevRenderTarget );
			renderer.autoClear = prevAutoClear;

			if ( onProgress ) onProgress( 'denoising', 1.0 );

		}

		// Export based on format
		let result;

		if ( format === 'exr' ) {

			if ( onProgress ) onProgress( 'exporting', 0.0 );

			const exporter = new EXRExporter();
			const exrData = await exporter.export( renderer, exportTarget, {
				includeAlpha,
				onProgress: ( progress ) => {

					if ( onProgress ) onProgress( 'exporting', progress );

				},
			} );

			result = {
				data: exrData,
				format: 'exr',
				samples: this.samples,
				denoised: denoise,
			};

		} else if ( format === 'png' ) {

			if ( onProgress ) onProgress( 'exporting', 0.0 );

			// Read pixels and convert to PNG
			const pixelCount = width * height;
			const floatBuffer = new Float32Array( pixelCount * 4 );
			renderer.readRenderTargetPixels( exportTarget, 0, 0, width, height, floatBuffer );

			if ( onProgress ) onProgress( 'exporting', 0.3 );

			// Use the renderer's current tone mapping and exposure
			const toneMapping = renderer.toneMapping;
			const exposure = renderer.toneMappingExposure;

			// Convert to 8-bit RGBA
			const uint8Buffer = new Uint8ClampedArray( pixelCount * 4 );
			for ( let i = 0; i < pixelCount; i ++ ) {

				const idx = i * 4;
				let r = floatBuffer[ idx ] * exposure;
				let g = floatBuffer[ idx + 1 ] * exposure;
				let b = floatBuffer[ idx + 2 ] * exposure;
				const a = floatBuffer[ idx + 3 ];

				// Apply the renderer's tone mapping
				switch ( toneMapping ) {

				case LinearToneMapping:
					// Clamp only
					r = Math.max( 0.0, r );
					g = Math.max( 0.0, g );
					b = Math.max( 0.0, b );
					break;
				case ReinhardToneMapping:
					r = r / ( 1.0 + r );
					g = g / ( 1.0 + g );
					b = b / ( 1.0 + b );
					break;
				case CineonToneMapping: {

					// Optimized filmic curve by Jim Hejl and Richard Burgess-Dawson
					r = Math.max( 0.0, r - 0.004 );
					g = Math.max( 0.0, g - 0.004 );
					b = Math.max( 0.0, b - 0.004 );
					r = ( r * ( 6.2 * r + 0.5 ) ) / ( r * ( 6.2 * r + 1.7 ) + 0.06 );
					g = ( g * ( 6.2 * g + 0.5 ) ) / ( g * ( 6.2 * g + 1.7 ) + 0.06 );
					b = ( b * ( 6.2 * b + 0.5 ) ) / ( b * ( 6.2 * b + 1.7 ) + 0.06 );
					break;

				}

				case ACESFilmicToneMapping: {

					// ACES filmic tone mapping approximation
					const aAces = 2.51;
					const bAces = 0.03;
					const cAces = 2.43;
					const dAces = 0.59;
					const eAces = 0.14;
					r = Math.max( 0.0, Math.min( 1.0, ( r * ( aAces * r + bAces ) ) / ( r * ( cAces * r + dAces ) + eAces ) ) );
					g = Math.max( 0.0, Math.min( 1.0, ( g * ( aAces * g + bAces ) ) / ( g * ( cAces * g + dAces ) + eAces ) ) );
					b = Math.max( 0.0, Math.min( 1.0, ( b * ( aAces * b + bAces ) ) / ( b * ( cAces * b + dAces ) + eAces ) ) );
					break;

				}

				case AgXToneMapping: {

					// AgX tone mapping (approximation)
					r = Math.max( 0.0, r );
					g = Math.max( 0.0, g );
					b = Math.max( 0.0, b );
					const agx = ( v ) => {

						const x = Math.log2( v * 0.18 + 1.0 );
						const s = x / ( 1.0 + x );
						return s;

					};

					r = agx( r );
					g = agx( g );
					b = agx( b );
					break;

				}

				case NeutralToneMapping: {

					// Khronos neutral tone mapping
					const startCompression = 0.8 - 0.04;
					const desaturation = 0.15;
					const xMin = startCompression;
					const xMax = startCompression + 0.16;
					const applyNeutral = ( v ) => {

						if ( v <= xMin ) return v;
						if ( v >= xMax ) return 1.0;
						const t = ( v - xMin ) / ( xMax - xMin );
						return xMin + ( xMax - xMin ) * ( t * t * ( 3 - 2 * t ) ) * ( 1.0 - desaturation ) + desaturation * t;

					};

					r = applyNeutral( r );
					g = applyNeutral( g );
					b = applyNeutral( b );
					break;

				}

				case NoToneMapping:
				default:
					// No tone mapping
					break;

				}

				// Gamma correction (linear to sRGB)
				uint8Buffer[ idx ] = Math.pow( Math.min( r, 1.0 ), 1.0 / 2.2 ) * 255;
				uint8Buffer[ idx + 1 ] = Math.pow( Math.min( g, 1.0 ), 1.0 / 2.2 ) * 255;
				uint8Buffer[ idx + 2 ] = Math.pow( Math.min( b, 1.0 ), 1.0 / 2.2 ) * 255;
				uint8Buffer[ idx + 3 ] = a * 255;

			}

			if ( onProgress ) onProgress( 'exporting', 0.6 );

			// Create canvas and convert to PNG blob
			const canvas = document.createElement( 'canvas' );
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext( '2d' );

			// Flip vertically (WebGL coordinates to canvas)
			const flippedData = new Uint8ClampedArray( uint8Buffer.length );
			for ( let y = 0; y < height; y ++ ) {

				const srcRow = ( height - 1 - y ) * width * 4;
				const dstRow = y * width * 4;
				flippedData.set( uint8Buffer.slice( srcRow, srcRow + width * 4 ), dstRow );

			}

			const flippedImageData = new ImageData( flippedData, width, height );
			ctx.putImageData( flippedImageData, 0, 0 );

			const pngBlob = await new Promise( ( resolve, reject ) => {

				canvas.toBlob( ( blob ) => {

					if ( blob ) resolve( blob );
					else reject( new Error( 'Failed to create PNG blob' ) );

				}, 'image/png' );

			} );

			if ( onProgress ) onProgress( 'exporting', 1.0 );

			result = {
				data: pngBlob,
				format: 'png',
				samples: this.samples,
				denoised: denoise,
			};

		} else {

			throw new Error( `Unsupported export format: ${ format }` );

		}

		// Cleanup temporary resources
		if ( denoise ) {

			denoiseQuad.material.dispose();
			denoiseQuad.dispose();
			exportTarget.dispose();

		}

		return result;

	}

	dispose() {

		this._quad.dispose();
		this._quad.material.dispose();
		this._pathTracer.dispose();

	}

	_updateScale() {

		// update the path tracer scale if it has changed
		if ( this.synchronizeRenderSize ) {

			this._renderer.getDrawingBufferSize( _resolution );

			const w = Math.floor( this.renderScale * _resolution.x );
			const h = Math.floor( this.renderScale * _resolution.y );

			this._pathTracer.getSize( _resolution );
			if ( _resolution.x !== w || _resolution.y !== h ) {

				const lowResScale = this.lowResScale;
				this._pathTracer.setSize( w, h );
				this._lowResPathTracer.setSize( Math.floor( w * lowResScale ), Math.floor( h * lowResScale ) );

			}

		}

	}

}
