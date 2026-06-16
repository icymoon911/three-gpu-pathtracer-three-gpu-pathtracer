import { PerspectiveCamera, Scene, Vector2, Clock, NormalBlending, NoBlending, AdditiveBlending, WebGLRenderTarget, RGBAFormat, UnsignedByteType } from 'three';
import { PathTracingSceneGenerator } from './PathTracingSceneGenerator.js';
import { PathTracingRenderer } from './PathTracingRenderer.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GradientEquirectTexture } from '../textures/GradientEquirectTexture.js';
import { getIesTextures, getLights, getTextures } from './utils/sceneUpdateUtils.js';
import { ClampedInterpolationMaterial } from '../materials/fullscreen/ClampedInterpolationMaterial.js';
import { CubeToEquirectGenerator } from '../utils/CubeToEquirectGenerator.js';

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

		// change detection hashes
		this._previousCameraHash = '';
		this._previousCameraPoseHash = '';
		this._previousLightsHash = '';
		this._previousMaterialsHash = '';
		this._previousEnvironmentHash = '';
		this._previousEnvVersion = 0;
		this._previousBgVersion = 0;

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

		this._updateCameraInternal();
		this.reset();

	}

	_updateCameraInternal() {

		const camera = this.camera;
		camera.updateMatrixWorld();

		this._pathTracer.setCamera( camera );
		this._lowResPathTracer.setCamera( camera );

	}

	updateCameraOnly( preserveSamples = false ) {

		const camera = this.camera;
		camera.updateMatrixWorld();

		this._pathTracer.setCamera( camera );
		this._lowResPathTracer.setCamera( camera );

		if ( ! preserveSamples ) {

			this.reset();

		}

	}

	updateMaterials() {

		this._updateMaterialsInternal();
		this.reset();

	}

	_updateMaterialsInternal() {

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

	}

	updateLights() {

		this._updateLightsInternal();
		this.reset();

	}

	_updateLightsInternal() {

		const scene = this.scene;
		const renderer = this._renderer;
		const material = this._pathTracer.material;

		const lights = getLights( scene );
		const iesTextures = getIesTextures( lights );
		material.lights.updateFrom( lights, iesTextures );
		material.iesProfiles.setTextures( renderer, iesTextures );

	}

	updateEnvironment() {

		this._updateEnvironmentInternal();
		this.reset();

	}

	_updateEnvironmentInternal() {

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

		const envVersion = ( scene.environment && typeof scene.environment._version === 'number' ) ? scene.environment._version : 0;
		const envChanged = this._previousEnvironment !== scene.environment || this._previousEnvVersion !== envVersion;

		if ( envChanged ) {

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
		this._previousEnvVersion = envVersion;

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

		// use internal methods to avoid per-method resets; reset once at the end
		this._updateCameraInternal();
		this._updateMaterialsInternal();
		this._updateEnvironmentInternal();
		this._updateLightsInternal();
		this.reset();

		// invalidate change detection hashes so the next _detectChanges() picks up fresh state
		this._previousCameraHash = '';
		this._previousLightsHash = '';
		this._previousMaterialsHash = '';
		this._previousEnvironmentHash = '';

		return results;

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

	async exportAsync( options = {} ) {

		const { type = 'image/png', quality = 1.0 } = options;

		const renderer = this._renderer;
		const pathTracer = this._pathTracer;
		const quad = this._quad;

		const texture = pathTracer.target.texture;
		const w = texture.image ? texture.image.width : texture.width;
		const h = texture.image ? texture.image.height : texture.height;

		// set up the quad with the path tracer output
		quad.material.map = texture;
		quad.material.opacity = 1;

		// create a temporary UByte render target for the export (8-bit per channel, suitable for PNG)
		const exportTarget = new WebGLRenderTarget( w, h, {
			format: RGBAFormat,
			type: UnsignedByteType,
		} );

		// save previous state
		const prevRenderTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;

		// render the quad (ClampedInterpolationMaterial respects the renderer's tone mapping setting
		// via three.js's built-in TONE_MAPPING shader chunk)
		renderer.setRenderTarget( exportTarget );
		renderer.autoClear = false;
		renderer.clear();
		quad.render( renderer );

		// read pixels
		const pixelBuffer = new Uint8Array( w * h * 4 );
		renderer.readRenderTargetPixels( exportTarget, 0, 0, w, h, pixelBuffer );

		// restore state
		renderer.setRenderTarget( prevRenderTarget );
		renderer.autoClear = prevAutoClear;

		// clean up
		exportTarget.dispose();

		// flip vertically (WebGL origin is bottom-left, canvas/images are top-left)
		const rowSize = w * 4;
		const tempRow = new Uint8Array( rowSize );
		for ( let y = 0, halfH = Math.floor( h / 2 ); y < halfH; y ++ ) {

			const topOffset = y * rowSize;
			const bottomOffset = ( h - 1 - y ) * rowSize;
			tempRow.set( pixelBuffer.subarray( topOffset, topOffset + rowSize ) );
			pixelBuffer.copyWithin( topOffset, bottomOffset, bottomOffset + rowSize );
			pixelBuffer.set( tempRow, bottomOffset );

		}

		// create blob from pixel data
		const canvas = document.createElement( 'canvas' );
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext( '2d' );
		const imageData = new ImageData( new Uint8ClampedArray( pixelBuffer ), w, h );
		ctx.putImageData( imageData, 0, 0 );

		return new Promise( ( resolve, reject ) => {

			canvas.toBlob(
				blob => blob ? resolve( URL.createObjectURL( blob ) ) : reject( new Error( 'WebGLPathTracer: failed to create blob' ) ),
				type,
				quality,
			);

		} );

	}

	reset() {

		this._queueReset = true;
		this._pathTracer.samples = 0;

	}

	dispose() {

		this._quad.dispose();
		this._quad.material.dispose();
		this._pathTracer.dispose();
		this._lowResPathTracer.dispose();

		if ( this._generator ) {

			if ( this._generator.bvh ) {

				this._generator.bvh.dispose();

			}

			if ( this._generator.geometry ) {

				this._generator.geometry.dispose();

			}

		}

		if ( this._internalBackground ) {

			this._internalBackground.dispose();
			this._internalBackground = null;

		}

		if ( this._colorBackground ) {

			this._colorBackground.dispose();
			this._colorBackground = null;

		}

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

	_getCameraHash() {

		const camera = this.camera;
		const m = camera.matrixWorld.elements;
		const p = camera.projectionMatrix.elements;
		let hash = `m:${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]},${m[6]},${m[7]},${m[8]},${m[9]},${m[10]},${m[11]},${m[12]},${m[13]},${m[14]},${m[15]}` +
			`|p:${p[0]},${p[5]},${p[10]},${p[11]},${p[14]},${p[15]}`;

		// include PhysicalCamera DOF parameters
		if ( camera.isPhysicalCamera || camera.fStop !== undefined ) {

			hash += `|dof:${camera.fStop},${camera.focusDistance},${camera.apertureBlades},${camera.apertureRotation},${camera.anamorphicRatio}`;

		}

		return hash;

	}

	_getLightsHash() {

		const scene = this.scene;
		if ( ! scene ) return '';

		const lights = getLights( scene );
		const parts = [];
		for ( let i = 0; i < lights.length; i ++ ) {

			const l = lights[ i ];
			l.updateMatrixWorld();

			const m = l.matrixWorld.elements;
			let part = `${l.uuid}:${l.intensity}:${l.color.getHex()}` +
				`:p:${m[12]},${m[13]},${m[14]}` +
				`:r:${m[0]},${m[1]},${m[2]},${m[4]},${m[5]},${m[6]},${m[8]},${m[9]},${m[10]}`;

			// include ShapedAreaLight shape
			if ( l.isCircular !== undefined ) {

				part += `:circ:${l.isCircular}`;

			}

			// include PhysicalSpotLight radius
			if ( l.isSpotLight && l.radius !== undefined ) {

				part += `:rad:${l.radius}`;

			}

			parts.push( part );

		}

		return parts.join( '|' );

	}

	_detectChanges() {

		const changePriority = [ 'geometry', 'environment', 'materials', 'lights', 'camera' ];
		const detected = new Set();

		// camera check (includes DOF parameters for PhysicalCamera)
		const cameraHash = this._getCameraHash();
		if ( cameraHash !== this._previousCameraHash ) {

			detected.add( 'camera' );

		}

		// lights check (includes ShapedAreaLight.isCircular and PhysicalSpotLight.radius)
		const lightsHash = this._getLightsHash();
		if ( lightsHash !== this._previousLightsHash ) {

			detected.add( 'lights' );

		}

		// materials check
		const materials = this._materials || [];
		const materialsHash = materials.map( m => `${m.uuid}:${m.version}` ).join( '|' );
		if ( materialsHash !== this._previousMaterialsHash ) {

			detected.add( 'materials' );

		}

		// environment check (includes ProceduralEquirectTexture version tracking)
		const scene = this.scene;
		if ( scene ) {

			const env = scene.environment;
			const bg = scene.background;

			let envHash = '';
			let envVersion = 0;
			if ( env ) {

				envHash = env.uuid || env.source?.uuid || '';
				envVersion = ( typeof env._version === 'number' ) ? env._version : 0;

			}

			let bgHash = '';
			let bgVersion = 0;
			if ( bg && ! bg.isColor ) {

				bgHash = bg.uuid || bg.source?.uuid || '';
				bgVersion = ( typeof bg._version === 'number' ) ? bg._version : 0;

			} else if ( bg && bg.isColor ) {

				bgHash = `color:${bg.getHex()}`;

			}

			const fullEnvHash = `${envHash}:${envVersion}:${bgHash}:${bgVersion}`;
			if ( fullEnvHash !== this._previousEnvironmentHash ) {

				detected.add( 'environment' );

			}

		}

		// store updated hashes
		this._previousCameraHash = cameraHash;
		this._previousLightsHash = lightsHash;
		this._previousMaterialsHash = materialsHash;

		if ( scene ) {

			const env = scene.environment;
			const bg = scene.background;
			let envHash = '';
			let envVersion = 0;
			if ( env ) {

				envHash = env.uuid || env.source?.uuid || '';
				envVersion = ( typeof env._version === 'number' ) ? env._version : 0;

			}

			let bgHash = '';
			let bgVersion = 0;
			if ( bg && ! bg.isColor ) {

				bgHash = bg.uuid || bg.source?.uuid || '';
				bgVersion = ( typeof bg._version === 'number' ) ? bg._version : 0;

			} else if ( bg && bg.isColor ) {

				bgHash = `color:${bg.getHex()}`;

			}

			this._previousEnvironmentHash = `${envHash}:${envVersion}:${bgHash}:${bgVersion}`;

		}

		if ( detected.size === 0 ) return 'none';

		// return the most expensive (heaviest) change type so a single pass covers everything
		for ( const type of changePriority ) {

			if ( detected.has( type ) ) return type;

		}

		return 'none';

	}

	_applyExplicitChanges( changes ) {

		if ( changes.environment ) {

			this._updateEnvironmentInternal();

		}

		if ( changes.lights ) {

			this._updateLightsInternal();

		}

		if ( changes.materials ) {

			this._updateMaterialsInternal();

		}

		if ( changes.camera ) {

			this._updateCameraInternal();

		}

		// single reset after all updates
		this.reset();

	}

	updateScene( changes ) {

		if ( changes ) {

			this._applyExplicitChanges( changes );
			const types = Object.keys( changes ).filter( k => changes[ k ] );
			if ( types.length === 0 ) return 'none';

			const priority = [ 'geometry', 'environment', 'materials', 'lights', 'camera' ];
			for ( const t of priority ) {

				if ( changes[ t ] ) return t;

			}

			return types[ 0 ];

		}

		// auto-detect
		const changeType = this._detectChanges();

		if ( changeType === 'none' ) {

			return 'none';

		}

		if ( changeType === 'camera' ) {

			// check if only DOF parameters changed (pose unchanged)
			const camera = this.camera;
			const m = camera.matrixWorld.elements;
			const p = camera.projectionMatrix.elements;
			const poseHash = `m:${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]},${m[6]},${m[7]},${m[8]},${m[9]},${m[10]},${m[11]},${m[12]},${m[13]},${m[14]},${m[15]}` +
				`|p:${p[0]},${p[5]},${p[10]},${p[11]},${p[14]},${p[15]}`;
			const prevPoseHash = this._previousCameraPoseHash || '';
			this._previousCameraPoseHash = poseHash;

			if ( poseHash === prevPoseHash ) {

				// only DOF params changed - update camera without clearing accumulated samples
				this.updateCameraOnly( true );
				return 'camera';

			}

			// full camera update (pose changed)
			this.updateCamera();
			return 'camera';

		}

		// for any heavier change, run all relevant updates with a single reset at the end
		if ( changeType === 'geometry' || changeType === 'all' ) {

			// geometry change requires full scene rebuild
			this.setScene( this.scene, this.camera );
			return changeType;

		}

		// environment, materials, lights: run applicable updates without individual resets, then reset once
		if ( changeType === 'environment' ) {

			this._updateEnvironmentInternal();

		}

		if ( changeType === 'materials' || changeType === 'environment' ) {

			this._updateMaterialsInternal();

		}

		if ( changeType === 'lights' || changeType === 'materials' || changeType === 'environment' ) {

			this._updateLightsInternal();

		}

		this.reset();
		return changeType;

	}

}
