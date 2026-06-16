import {
	PerspectiveCamera, Scene, Vector2, Clock, NormalBlending, NoBlending, AdditiveBlending,
	WebGLRenderTarget, RGBAFormat, FloatType, NearestFilter,
	NoToneMapping, LinearSRGBColorSpace, ShaderMaterial,
} from 'three';
import { PathTracingSceneGenerator } from './PathTracingSceneGenerator.js';
import { PathTracingRenderer } from './PathTracingRenderer.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GradientEquirectTexture } from '../textures/GradientEquirectTexture.js';
import { getIesTextures, getLights, getTextures } from './utils/sceneUpdateUtils.js';
import { ClampedInterpolationMaterial } from '../materials/fullscreen/ClampedInterpolationMaterial.js';
import { CubeToEquirectGenerator } from '../utils/CubeToEquirectGenerator.js';
import { EXRExporter } from '../utils/EXRExporter.js';

function supportsFloatBlending( renderer ) {

	return renderer.extensions.get( 'EXT_float_blend' );

}

// ---------------------------------------------------------------------------
// Denoise copy material — applies smart de-noise without tonemapping / color-
// space conversion so the raw HDR values are preserved for EXR export.
// ---------------------------------------------------------------------------
function createDenoiseCopyMaterial() {

	return new ShaderMaterial( {

		uniforms: {
			map: { value: null },
			sigma: { value: 5.0 },
			threshold: { value: 0.03 },
			kSigma: { value: 1.0 },
		},

		vertexShader: /* glsl */`
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
		`,

		fragmentShader: /* glsl */`
			uniform sampler2D map;
			uniform float sigma;
			uniform float threshold;
			uniform float kSigma;
			varying vec2 vUv;

			#define INV_SQRT_OF_2PI 0.39894228040143267793994605993439
			#define INV_PI 0.31830988618379067153776752674503

			vec4 smartDeNoise( sampler2D tex, vec2 uv, float sigma, float kSigma, float threshold ) {
				float radius = round( kSigma * sigma );
				float radQ = radius * radius;
				float invSigmaQx2 = 0.5 / ( sigma * sigma );
				float invSigmaQx2PI = INV_PI * invSigmaQx2;
				float invThresholdSqx2 = 0.5 / ( threshold * threshold );
				float invThresholdSqrt2PI = INV_SQRT_OF_2PI / threshold;
				vec4 centrPx = texture2D( tex, uv );
				centrPx.rgb *= centrPx.a;
				float zBuff = 0.0;
				vec4 aBuff = vec4( 0.0 );
				vec2 size = vec2( textureSize( tex, 0 ) );
				vec2 d;
				for ( d.x = - radius; d.x <= radius; d.x ++ ) {
					float pt = sqrt( radQ - d.x * d.x );
					for ( d.y = - pt; d.y <= pt; d.y ++ ) {
						float blurFactor = exp( - dot( d, d ) * invSigmaQx2 ) * invSigmaQx2PI;
						vec4 walkPx = texture2D( tex, uv + d / size );
						walkPx.rgb *= walkPx.a;
						vec4 dC = walkPx - centrPx;
						float deltaFactor = exp( - dot( dC.rgba, dC.rgba ) * invThresholdSqx2 ) * invThresholdSqrt2PI * blurFactor;
						zBuff += deltaFactor;
						aBuff += deltaFactor * walkPx;
					}
				}
				return aBuff / zBuff;
			}

			void main() {
				gl_FragColor = smartDeNoise( map, vUv, sigma, kSigma, threshold );
			}
		`,

		blending: NoBlending,
		depthWrite: false,
		depthTest: false,

	} );

}

// ---------------------------------------------------------------------------
// CPU-side tone mapping and color-space helpers for PNG export
// ---------------------------------------------------------------------------
function acesFilmicToneMap( x ) {

	const a = 2.51;
	const b = 0.03;
	const c = 2.43;
	const d = 0.59;
	const e = 0.14;
	return Math.max( 0, Math.min( 1, ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ) ) );

}

function linearToSRGB( x ) {

	if ( x <= 0.0031308 ) return 12.92 * x;
	return 1.055 * Math.pow( Math.max( 0, x ), 1.0 / 2.4 ) - 0.055;

}

function convertFloatPixelsToUint8( floatPixels, width, height, channels ) {

	const pixelCount = width * height;
	const out = new Uint8Array( pixelCount * channels );

	for ( let i = 0; i < pixelCount; i ++ ) {

		const si = i * 4;
		const di = i * channels;
		const r = floatPixels[ si ];
		const g = floatPixels[ si + 1 ];
		const b = floatPixels[ si + 2 ];

		// ACES filmic tone mapping
		const tr = acesFilmicToneMap( r );
		const tg = acesFilmicToneMap( g );
		const tb = acesFilmicToneMap( b );

		// Linear → sRGB
		out[ di ] = Math.round( Math.max( 0, Math.min( 1, linearToSRGB( tr ) ) ) * 255 );
		out[ di + 1 ] = Math.round( Math.max( 0, Math.min( 1, linearToSRGB( tg ) ) ) * 255 );
		out[ di + 2 ] = Math.round( Math.max( 0, Math.min( 1, linearToSRGB( tb ) ) ) * 255 );

		if ( channels === 4 ) {

			// Alpha: clamp to [0,1] and convert
			const a = floatPixels[ si + 3 ];
			out[ di + 3 ] = Math.round( Math.max( 0, Math.min( 1, a ) ) * 255 );

		}

	}

	return out;

}

// ---------------------------------------------------------------------------
// Minimal PNG encoder — produces valid PNG from raw Uint8Array pixel data.
// Uses zlib stored blocks (no compression) for maximum compatibility.
// ---------------------------------------------------------------------------
const _crcTable = ( () => {

	const table = new Uint32Array( 256 );
	for ( let n = 0; n < 256; n ++ ) {

		let c = n;
		for ( let k = 0; k < 8; k ++ ) {

			c = ( c & 1 ) ? ( 0xEDB88320 ^ ( c >>> 1 ) ) : ( c >>> 1 );

		}

		table[ n ] = c;

	}

	return table;

} )();

function crc32( data, start, end ) {

	let crc = 0xFFFFFFFF;
	for ( let i = start; i < end; i ++ ) {

		crc = _crcTable[ ( crc ^ data[ i ] ) & 0xFF ] ^ ( crc >>> 8 );

	}

	return ( crc ^ 0xFFFFFFFF ) >>> 0;

}

function adler32( data ) {

	let a = 1, b = 0;
	for ( let i = 0; i < data.length; i ++ ) {

		a = ( a + data[ i ] ) % 65521;
		b = ( b + a ) % 65521;

	}

	return ( ( b << 16 ) | a ) >>> 0;

}

function writePngChunk( view, offset, type, data ) {

	// length
	view.setUint32( offset, data.length, false );
	offset += 4;

	// type
	const typeStart = offset;
	for ( let i = 0; i < 4; i ++ ) {

		view.setUint8( offset ++, type.charCodeAt( i ) );

	}

	// data
	const dataStart = offset;
	for ( let i = 0; i < data.length; i ++ ) {

		view.setUint8( offset ++, data[ i ] );

	}

	// CRC over type + data
	const crc = crc32( new Uint8Array( view.buffer ), typeStart, dataStart + data.length );
	view.setUint32( offset, crc, false );
	offset += 4;

	return offset;

}

function buildZlibStoredData( rawData ) {

	// zlib header (CMF + FLG)
	const maxBlock = 65535;
	const numBlocks = Math.max( 1, Math.ceil( rawData.length / maxBlock ) );
	const zlibSize = 2 + rawData.length + numBlocks * 5 + 4;
	const zlib = new Uint8Array( zlibSize );
	let zi = 0;

	zlib[ zi ++ ] = 0x78; // CMF: deflate, window 32768
	zlib[ zi ++ ] = 0x01; // FLG: no dict, check bits

	for ( let block = 0; block < numBlocks; block ++ ) {

		const start = block * maxBlock;
		const end = Math.min( start + maxBlock, rawData.length );
		const len = end - start;
		const isLast = block === numBlocks - 1;

		zlib[ zi ++ ] = isLast ? 0x01 : 0x00; // BFINAL + BTYPE 00 (stored)
		zlib[ zi ++ ] = len & 0xFF;
		zlib[ zi ++ ] = ( len >> 8 ) & 0xFF;
		zlib[ zi ++ ] = ( ~ len ) & 0xFF;
		zlib[ zi ++ ] = ( ( ~ len ) >> 8 ) & 0xFF;

		for ( let j = start; j < end; j ++ ) {

			zlib[ zi ++ ] = rawData[ j ];

		}

	}

	// Adler-32 checksum
	const checksum = adler32( rawData );
	zlib[ zi ++ ] = ( checksum >> 24 ) & 0xFF;
	zlib[ zi ++ ] = ( checksum >> 16 ) & 0xFF;
	zlib[ zi ++ ] = ( checksum >> 8 ) & 0xFF;
	zlib[ zi ++ ] = checksum & 0xFF;

	return zlib.slice( 0, zi );

}

function buildPngRawData( pixels, width, height, channels ) {

	// PNG raw data: for each scanline, filter byte (0=None) + pixel data
	// Note: WebGL pixels are bottom-to-top, PNG is top-to-bottom → flip
	const rowBytes = width * channels;
	const rawData = new Uint8Array( height * ( 1 + rowBytes ) );
	let ri = 0;

	for ( let y = 0; y < height; y ++ ) {

		rawData[ ri ++ ] = 0; // filter: None
		const srcRow = ( height - 1 - y ) * rowBytes;
		for ( let j = 0; j < rowBytes; j ++ ) {

			rawData[ ri ++ ] = pixels[ srcRow + j ];

		}

	}

	return rawData;

}

function encodePNG( pixels, width, height, channels = 4 ) {

	const pngSignature = [ 137, 80, 78, 71, 13, 10, 26, 10 ];

	// Build raw pixel data for PNG (with filter bytes and Y-flip)
	const rawData = buildPngRawData( pixels, width, height, channels );

	// Compress with zlib stored blocks
	const zlibData = buildZlibStoredData( rawData );

	// Calculate total buffer size
	// IHDR data = 13 bytes, IDAT data = zlibData.length, IEND data = 0 bytes
	// Each chunk: 4 (len) + 4 (type) + data + 4 (crc) = 12 + data
	const ihdrData = new Uint8Array( 13 );
	const ihdrView = new DataView( ihdrData.buffer );
	ihdrView.setUint32( 0, width, false );
	ihdrView.setUint32( 4, height, false );
	ihdrData[ 8 ] = 8; // bit depth
	ihdrData[ 9 ] = channels === 3 ? 2 : 6; // color type: RGB=2, RGBA=6
	ihdrData[ 10 ] = 0; // compression
	ihdrData[ 11 ] = 0; // filter
	ihdrData[ 12 ] = 0; // interlace

	const totalSize = pngSignature.length
		+ 12 + ihdrData.length
		+ 12 + zlibData.length
		+ 12; // IEND

	const buffer = new ArrayBuffer( totalSize );
	const view = new DataView( buffer );
	const bytes = new Uint8Array( buffer );
	let offset = 0;

	// PNG signature
	for ( let i = 0; i < pngSignature.length; i ++ ) {

		bytes[ offset ++ ] = pngSignature[ i ];

	}

	// IHDR chunk
	offset = writePngChunk( view, offset, 'IHDR', ihdrData );

	// IDAT chunk
	offset = writePngChunk( view, offset, 'IDAT', zlibData );

	// IEND chunk
	offset = writePngChunk( view, offset, 'IEND', new Uint8Array( 0 ) );

	return buffer.slice( 0, offset );

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

		// apply auto-focus if enabled
		if ( camera.autoFocus ) {

			camera.updateFocus( this.scene );

		}

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
		const texturesChanged = material.textures.setTextures( renderer, textures, textureSize.x, textureSize.y );
		const materialsChanged = material.materials.updateFrom( materials, textures );

		if ( texturesChanged || materialsChanged ) {

			this.reset();

		}

	}

	updateLights() {

		const scene = this.scene;
		const renderer = this._renderer;
		const material = this._pathTracer.material;

		const lights = getLights( scene );
		const iesTextures = getIesTextures( lights );
		const lightsChanged = material.lights.updateFrom( lights, iesTextures );
		const iesChanged = material.iesProfiles.setTextures( renderer, iesTextures );

		if ( lightsChanged || iesChanged ) {

			this.reset();

		}

	}

	updateEnvironment() {

		const scene = this.scene;
		const material = this._pathTracer.material;
		let changed = false;

		if ( this._internalBackground ) {

			this._internalBackground.dispose();
			this._internalBackground = null;

		}

		// update scene background
		const prevBlur = material.backgroundBlur;
		const prevIntensity = material.backgroundIntensity;
		material.backgroundBlur = scene.backgroundBlurriness;
		material.backgroundIntensity = scene.backgroundIntensity ?? 1;
		material.backgroundRotation.makeRotationFromEuler( scene.backgroundRotation ).invert();
		if ( scene.background === null ) {

			if ( material.backgroundMap !== null || material.backgroundAlpha !== 0 ) changed = true;
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
				changed = true;

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
				changed = true;

			}

		} else {

			if ( material.backgroundMap !== scene.background ) changed = true;
			material.backgroundMap = scene.background;
			material.backgroundAlpha = 1;

		}

		if ( prevBlur !== material.backgroundBlur || prevIntensity !== material.backgroundIntensity ) changed = true;

		// update scene environment
		const prevEnvIntensity = material.environmentIntensity;
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

			changed = true;

		} else if ( prevEnvIntensity !== material.environmentIntensity ) {

			changed = true;

		}

		this._previousEnvironment = scene.environment;
		this._previousBackground = scene.background;

		if ( changed ) {

			this.reset();

		}

	}

	/**
	 * Perform an incremental scene update, only updating the specified components.
	 * This avoids full shader recompilation when only specific parts of the scene change.
	 *
	 * @param {Object} options - Which components to update
	 * @param {boolean} [options.materials=true] - Update material textures and parameters
	 * @param {boolean} [options.lights=true] - Update lights and IES profiles
	 * @param {boolean} [options.environment=true] - Update environment map and background
	 * @param {boolean} [options.camera=false] - Update camera (also triggers reset)
	 */
	updateScene( options = {} ) {

		const {
			materials = true,
			lights = true,
			environment = true,
			camera = false,
		} = options;

		if ( camera ) this.updateCamera();
		if ( materials ) this.updateMaterials();
		if ( lights ) this.updateLights();
		if ( environment ) this.updateEnvironment();

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

	/**
	 * Export the current path-traced render result.
	 *
	 * Waits until the accumulated sample count reaches `minSamples`, optionally
	 * applies denoising, and returns the result in the requested format.
	 *
	 * @param {Object} [options]
	 * @param {string}  [options.format='exr']        - 'exr' | 'png' | 'raw'
	 * @param {number}  [options.minSamples]           - Wait until at least this many samples are accumulated
	 * @param {boolean} [options.denoise=false]        - Apply smart de-noise before export
	 * @param {number}  [options.sigma=5]              - Denoise sigma (standard deviation)
	 * @param {number}  [options.threshold=0.03]       - Denoise edge-sharpening threshold
	 * @param {number}  [options.kSigma=1]             - Denoise kernel radius coefficient
	 * @param {string}  [options.type='half']          - EXR precision: 'half' (16-bit) or 'float' (32-bit)
	 * @param {number}  [options.channels=4]           - Number of channels (3=RGB, 4=RGBA)
	 * @param {Function}[options.onProgress]           - Callback (progress: 0-1, stage: string)
	 * @returns {Promise<{data: ArrayBuffer, width: number, height: number, format: string}>}
	 */
	async exportAsync( options = {} ) {

		const {
			format = 'exr',
			minSamples,
			denoise = false,
			sigma = 5.0,
			threshold = 0.03,
			kSigma = 1.0,
			type = 'half',
			channels = 4,
			onProgress = null,
		} = options;

		const targetMinSamples = minSamples !== undefined ? minSamples : this.minSamples;

		// ----------------------------------------------------------------
		// Phase 1 — wait for enough samples
		// ----------------------------------------------------------------
		if ( onProgress ) onProgress( 0, 'waiting' );

		while ( this.samples < targetMinSamples ) {

			this.renderSample();
			await new Promise( r => requestAnimationFrame( r ) );

			if ( onProgress ) {

				const p = targetMinSamples > 0 ? Math.min( this.samples / targetMinSamples, 1 ) : 1;
				onProgress( p * 0.1, 'waiting' );

			}

		}

		if ( onProgress ) onProgress( 0.1, 'preparing' );

		// ----------------------------------------------------------------
		// Phase 2 — save renderer state and prepare for read-back
		// ----------------------------------------------------------------
		const renderer = this._renderer;
		const prevToneMapping = renderer.toneMapping;
		const prevOutputColorSpace = renderer.outputColorSpace;
		const prevAlpha = this._pathTracer.alpha;

		// For raw HDR export, disable tone mapping and color space conversion
		renderer.toneMapping = NoToneMapping;
		renderer.outputColorSpace = LinearSRGBColorSpace;

		// Ensure alpha mode matches current scene so the correct target is populated.
		// In alpha mode PathTracingRenderer writes to blendTargets; in non-alpha mode
		// it writes to primaryTarget.  The `target` getter returns whichever is active.
		this._pathTracer.alpha =
			this._pathTracer.material.backgroundAlpha !== 1 || ! supportsFloatBlending( renderer );

		// ----------------------------------------------------------------
		// Phase 3 — determine source render target
		// The `target` getter correctly returns _blendTargets[1] when alpha
		// mode is active (transparent backgrounds) and _primaryTarget otherwise.
		// ----------------------------------------------------------------
		let sourceTarget = this._pathTracer.target;

		// ----------------------------------------------------------------
		// Phase 4 — optional denoise pass
		// ----------------------------------------------------------------
		let denoiseTarget = null;
		let denoiseCopyQuad = null;

		if ( denoise ) {

			if ( onProgress ) onProgress( 0.15, 'denoising' );

			const w = sourceTarget.width;
			const h = sourceTarget.height;

			// Create a denoise copy material that preserves raw HDR values
			// (no tonemapping_fragment / colorspace_fragment includes).
			const denoiseMat = createDenoiseCopyMaterial();
			denoiseMat.uniforms.sigma.value = sigma;
			denoiseMat.uniforms.threshold.value = threshold;
			denoiseMat.uniforms.kSigma.value = kSigma;
			denoiseMat.uniforms.map.value = sourceTarget.texture;

			denoiseCopyQuad = new FullScreenQuad( denoiseMat );

			denoiseTarget = new WebGLRenderTarget( w, h, {
				format: RGBAFormat,
				type: FloatType,
				magFilter: NearestFilter,
				minFilter: NearestFilter,
			} );

			const ogRenderTarget = renderer.getRenderTarget();
			const ogAutoClear = renderer.autoClear;

			renderer.setRenderTarget( denoiseTarget );
			renderer.autoClear = true;
			denoiseCopyQuad.render( renderer );

			renderer.setRenderTarget( ogRenderTarget );
			renderer.autoClear = ogAutoClear;

			sourceTarget = denoiseTarget;

			if ( onProgress ) onProgress( 0.25, 'readback' );

		}

		// ----------------------------------------------------------------
		// Phase 5 — read pixels
		// ----------------------------------------------------------------
		if ( onProgress && ! denoise ) onProgress( 0.2, 'readback' );

		const width = sourceTarget.width;
		const height = sourceTarget.height;
		const pixelBuffer = new Float32Array( width * height * 4 );
		renderer.readRenderTargetPixels( sourceTarget, 0, 0, width, height, pixelBuffer );

		if ( onProgress ) onProgress( 0.3, 'readback' );

		// ----------------------------------------------------------------
		// Phase 6 — encode to requested format
		// ----------------------------------------------------------------
		let result;

		if ( format === 'exr' ) {

			const exporter = new EXRExporter();
			result = exporter.encodeEXR(
				pixelBuffer, width, height,
				channels, type === 'half',
				( p, stage ) => {

					if ( onProgress ) onProgress( 0.3 + p * 0.65, stage || 'encoding' );

				},
			);

		} else if ( format === 'png' ) {

			if ( onProgress ) onProgress( 0.3, 'tonemap' );

			const pngPixels = convertFloatPixelsToUint8( pixelBuffer, width, height, channels );

			if ( onProgress ) onProgress( 0.5, 'encoding' );

			result = encodePNG( pngPixels, width, height, channels );

		} else {

			// 'raw' — return the Float32Array as-is
			result = pixelBuffer;

		}

		if ( onProgress ) onProgress( 0.95, 'cleanup' );

		// ----------------------------------------------------------------
		// Phase 7 — clean up temporary resources
		// ----------------------------------------------------------------
		if ( denoiseTarget ) denoiseTarget.dispose();
		if ( denoiseCopyQuad ) {

			denoiseCopyQuad.material.dispose();
			denoiseCopyQuad.dispose();

		}

		// Restore renderer state
		renderer.toneMapping = prevToneMapping;
		renderer.outputColorSpace = prevOutputColorSpace;
		this._pathTracer.alpha = prevAlpha;

		if ( onProgress ) onProgress( 1.0, 'complete' );

		return { data: result, width, height, format };

	}

	reset() {

		this._queueReset = true;
		this._pathTracer.samples = 0;

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
