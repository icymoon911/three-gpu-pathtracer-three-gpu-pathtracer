/**
 * PresetManager - Save, restore, and batch-render rendering presets for WebGLPathTracer.
 *
 * A preset captures:
 *   - Camera position, rotation, and projection parameters
 *   - WebGLPathTracer parameters (bounces, transmissiveBounces, filterGlossyFactor,
 *     renderScale, tiles, minSamples, etc.)
 *   - Scene environment parameters (environmentIntensity, backgroundBlurriness,
 *     backgroundIntensity)
 *   - Denoise and export settings
 *
 * Presets can be serialized to/from JSON for sharing and version control.
 */

const PRESET_VERSION = 1;

const BUILTIN_PRESETS = {

	'High Quality': {
		name: 'High Quality',
		pathTracer: {
			bounces: 8,
			transmissiveBounces: 6,
			filterGlossyFactor: 0.5,
			renderScale: 1.0,
			tiles: [ 2, 2 ],
			minSamples: 5,
			renderDelay: 100,
			fadeDuration: 500,
		},
		denoise: {
			enabled: false,
			sigma: 5.0,
			threshold: 0.03,
			kSigma: 1.0,
		},
		export: {
			format: 'png',
			minSamples: 100,
			includeAlpha: false,
		},
	},

	'Fast Preview': {
		name: 'Fast Preview',
		pathTracer: {
			bounces: 3,
			transmissiveBounces: 2,
			filterGlossyFactor: 0.5,
			renderScale: 0.5,
			tiles: [ 4, 4 ],
			minSamples: 1,
			renderDelay: 0,
			fadeDuration: 200,
		},
		denoise: {
			enabled: false,
			sigma: 5.0,
			threshold: 0.03,
			kSigma: 1.0,
		},
		export: {
			format: 'png',
			minSamples: 20,
			includeAlpha: false,
		},
	},

	'Denoised Output': {
		name: 'Denoised Output',
		pathTracer: {
			bounces: 5,
			transmissiveBounces: 4,
			filterGlossyFactor: 0.5,
			renderScale: 1.0,
			tiles: [ 2, 2 ],
			minSamples: 5,
			renderDelay: 100,
			fadeDuration: 500,
		},
		denoise: {
			enabled: true,
			sigma: 8.0,
			threshold: 0.03,
			kSigma: 1.0,
		},
		export: {
			format: 'png',
			minSamples: 50,
			includeAlpha: false,
		},
	},

};

export class PresetManager {

	/**
	 * @param {import('./WebGLPathTracer.js').WebGLPathTracer} pathTracer - The WebGLPathTracer instance
	 * @param {import('three').Scene} scene - The Three.js scene
	 * @param {import('three').Camera} camera - The Three.js camera
	 */
	constructor( pathTracer, scene, camera ) {

		this._pathTracer = pathTracer;
		this._scene = scene;
		this._camera = camera;

		// Map of preset name -> preset data
		this._presets = new Map();

		// Initialize with built-in presets
		for ( const [ name, preset ] of Object.entries( BUILTIN_PRESETS ) ) {

			this._presets.set( name, structuredClone( preset ) );

		}

		// Name of the currently active preset (null if no preset is active)
		this._activePreset = null;

	}

	/**
	 * Returns an array of all preset names.
	 * @returns {string[]}
	 */
	getPresetNames() {

		return Array.from( this._presets.keys() );

	}

	/**
	 * Returns the preset data for the given name, or null if not found.
	 * @param {string} name
	 * @returns {Object|null}
	 */
	getPreset( name ) {

		const preset = this._presets.get( name );
		return preset ? structuredClone( preset ) : null;

	}

	/**
	 * Returns the name of the currently active preset, or null.
	 * @returns {string|null}
	 */
	get activePreset() {

		return this._activePreset;

	}

	/**
	 * Capture the current rendering state as a new preset (or overwrite an existing one).
	 * @param {string} name - Preset name
	 * @returns {Object} The captured preset data
	 */
	capture( name ) {

		const pathTracer = this._pathTracer;
		const scene = this._scene;
		const camera = this._camera;

		const preset = {
			name,
			version: PRESET_VERSION,
			camera: {
				position: [ camera.position.x, camera.position.y, camera.position.z ],
				rotation: [ camera.rotation.x, camera.rotation.y, camera.rotation.z, camera.rotation.order ],
				fov: camera.fov ?? 50,
				near: camera.near ?? 0.1,
				far: camera.far ?? 2000,
				zoom: camera.zoom ?? 1,
			},
			pathTracer: {
				bounces: pathTracer.bounces,
				transmissiveBounces: pathTracer.transmissiveBounces,
				filterGlossyFactor: pathTracer.filterGlossyFactor,
				renderScale: pathTracer.renderScale,
				tiles: [ pathTracer.tiles.x, pathTracer.tiles.y ],
				minSamples: pathTracer.minSamples,
				renderDelay: pathTracer.renderDelay,
				fadeDuration: pathTracer.fadeDuration,
				stableNoise: pathTracer.stableNoise,
				multipleImportanceSampling: pathTracer.multipleImportanceSampling,
			},
			scene: {
				environmentIntensity: scene.environmentIntensity ?? 1,
				backgroundBlurriness: scene.backgroundBlurriness ?? 0,
				backgroundIntensity: scene.backgroundIntensity ?? 1,
			},
			denoise: {
				enabled: false,
				sigma: 5.0,
				threshold: 0.03,
				kSigma: 1.0,
			},
			export: {
				format: 'png',
				minSamples: 50,
				includeAlpha: false,
			},
		};

		// Capture PhysicalCamera-specific DOF parameters if available
		if ( camera.isPhysicalCamera || camera.focusDistance !== undefined ) {

			preset.camera.focusDistance = camera.focusDistance ?? 25;
			preset.camera.fStop = camera.fStop ?? 1.4;
			preset.camera.bokehSize = camera.bokehSize ?? 0;
			preset.camera.apertureBlades = camera.apertureBlades ?? 0;
			preset.camera.apertureRotation = camera.apertureRotation ?? 0;
			preset.camera.anamorphicRatio = camera.anamorphicRatio ?? 1;

		}

		this._presets.set( name, preset );
		this._activePreset = name;

		return structuredClone( preset );

	}

	/**
	 * Add or replace a preset from raw data.
	 * @param {Object} presetData - The preset data object
	 */
	addPreset( presetData ) {

		if ( ! presetData || ! presetData.name ) {

			throw new Error( 'Preset data must have a "name" field.' );

		}

		this._presets.set( presetData.name, structuredClone( presetData ) );

	}

	/**
	 * Remove a preset by name. Built-in presets can be removed too.
	 * @param {string} name
	 * @returns {boolean} Whether the preset existed
	 */
	removePreset( name ) {

		const existed = this._presets.delete( name );
		if ( existed && this._activePreset === name ) {

			this._activePreset = null;

		}

		return existed;

	}

	/**
	 * Restore a preset by name. This performs a thorough state reset:
	 *   - Camera position/rotation/projection parameters are restored
	 *   - Path tracer parameters are applied
	 *   - Scene environment parameters are applied
	 *   - Samples are reset to zero (accumulation restarts)
	 *   - updateScene is called to ensure all changes propagate
	 *
	 * @param {string} name - Preset name
	 * @returns {Object|null} The restored preset data, or null if not found
	 */
	restore( name ) {

		const preset = this._presets.get( name );
		if ( ! preset ) return null;

		const pathTracer = this._pathTracer;
		const scene = this._scene;
		const camera = this._camera;

		// --- Restore camera state ---
		const camData = preset.camera;
		if ( camData ) {

			if ( camData.position ) {

				camera.position.fromArray( camData.position );

			}

			if ( camData.rotation ) {

				camera.rotation.fromArray( camData.rotation );

			}

			if ( camData.fov !== undefined && camera.fov !== undefined ) {

				camera.fov = camData.fov;

			}

			if ( camData.near !== undefined ) camera.near = camData.near;
			if ( camData.far !== undefined ) camera.far = camData.far;
			if ( camData.zoom !== undefined ) camera.zoom = camData.zoom;

			// DOF parameters for PhysicalCamera
			if ( camData.focusDistance !== undefined && camera.focusDistance !== undefined ) {

				camera.focusDistance = camData.focusDistance;

			}

			if ( camData.fStop !== undefined && camera.fStop !== undefined ) {

				camera.fStop = camData.fStop;

			}

			if ( camData.bokehSize !== undefined && camera.bokehSize !== undefined ) {

				camera.bokehSize = camData.bokehSize;

			}

			if ( camData.apertureBlades !== undefined && camera.apertureBlades !== undefined ) {

				camera.apertureBlades = camData.apertureBlades;

			}

			if ( camData.apertureRotation !== undefined && camera.apertureRotation !== undefined ) {

				camera.apertureRotation = camData.apertureRotation;

			}

			if ( camData.anamorphicRatio !== undefined && camera.anamorphicRatio !== undefined ) {

				camera.anamorphicRatio = camData.anamorphicRatio;

			}

			camera.updateProjectionMatrix();
			camera.updateMatrixWorld( true );

		}

		// --- Restore path tracer parameters ---
		const ptData = preset.pathTracer;
		if ( ptData ) {

			if ( ptData.bounces !== undefined ) pathTracer.bounces = ptData.bounces;
			if ( ptData.transmissiveBounces !== undefined ) pathTracer.transmissiveBounces = ptData.transmissiveBounces;
			if ( ptData.filterGlossyFactor !== undefined ) pathTracer.filterGlossyFactor = ptData.filterGlossyFactor;
			if ( ptData.renderScale !== undefined ) pathTracer.renderScale = ptData.renderScale;
			if ( ptData.tiles ) pathTracer.tiles.fromArray( ptData.tiles );
			if ( ptData.minSamples !== undefined ) pathTracer.minSamples = ptData.minSamples;
			if ( ptData.renderDelay !== undefined ) pathTracer.renderDelay = ptData.renderDelay;
			if ( ptData.fadeDuration !== undefined ) pathTracer.fadeDuration = ptData.fadeDuration;
			if ( ptData.stableNoise !== undefined ) pathTracer.stableNoise = ptData.stableNoise;
			if ( ptData.multipleImportanceSampling !== undefined ) pathTracer.multipleImportanceSampling = ptData.multipleImportanceSampling;

		}

		// --- Restore scene environment parameters ---
		const sceneData = preset.scene;
		if ( sceneData ) {

			if ( sceneData.environmentIntensity !== undefined ) scene.environmentIntensity = sceneData.environmentIntensity;
			if ( sceneData.backgroundBlurriness !== undefined ) scene.backgroundBlurriness = sceneData.backgroundBlurriness;
			if ( sceneData.backgroundIntensity !== undefined ) scene.backgroundIntensity = sceneData.backgroundIntensity;

		}

		// --- Force a complete state reset ---
		// Update camera to reset accumulation and propagate camera changes
		pathTracer.updateCamera();

		// Update environment to propagate scene environment changes
		pathTracer.updateEnvironment();

		// Explicit reset to ensure samples are zeroed
		pathTracer.reset();

		this._activePreset = name;

		return structuredClone( preset );

	}

	/**
	 * Serialize all presets to a JSON string.
	 * @returns {string}
	 */
	exportJSON() {

		const presets = {};
		for ( const [ name, preset ] of this._presets ) {

			presets[ name ] = preset;

		}

		return JSON.stringify( {
			version: PRESET_VERSION,
			presets,
		}, null, 2 );

	}

	/**
	 * Import presets from a JSON string. Existing presets with the same name are overwritten.
	 * @param {string} json - JSON string
	 * @returns {string[]} Names of imported presets
	 */
	importJSON( json ) {

		const data = JSON.parse( json );

		if ( ! data || ! data.presets ) {

			throw new Error( 'Invalid preset JSON: missing "presets" field.' );

		}

		const importedNames = [];
		for ( const [ name, preset ] of Object.entries( data.presets ) ) {

			preset.name = name;
			this._presets.set( name, structuredClone( preset ) );
			importedNames.push( name );

		}

		return importedNames;

	}

	/**
	 * Export all presets as a downloadable JSON file.
	 * @param {string} [filename='render-presets.json']
	 */
	downloadJSON( filename = 'render-presets.json' ) {

		const json = this.exportJSON();
		const blob = new Blob( [ json ], { type: 'application/json' } );
		const url = URL.createObjectURL( blob );

		const a = document.createElement( 'a' );
		a.href = url;
		a.download = filename;
		a.click();

		URL.revokeObjectURL( url );

	}

	/**
	 * Import presets from a File object (e.g., from an <input type="file">).
	 * @param {File} file
	 * @returns {Promise<string[]>} Names of imported presets
	 */
	async importFromFile( file ) {

		const json = await file.text();
		return this.importJSON( json );

	}

	/**
	 * Batch render multiple presets. For each preset:
	 *   1. Restore the preset state (full reset, samples → 0)
	 *   2. Wait for the required number of samples to accumulate
	 *   3. Export the result via exportAsync
	 *
	 * @param {string[]} presetNames - Names of presets to render
	 * @param {Object} [options] - Batch render options
	 * @param {Function} [options.onProgress] - Progress callback:
	 *   (presetIndex, presetName, phase, progress, totalPresets) => void
	 *   phase: 'restoring' | 'rendering' | 'waiting' | 'denoising' | 'exporting'
	 *   progress: 0-1
	 * @param {Function} [options.renderSample] - Function to call to render a sample.
	 *   Defaults to calling pathTracer.renderSample() on the next animation frame.
	 *   Signature: () => void
	 * @returns {Promise<Array<{presetName: string, result: Object}>>} Array of export results
	 */
	async batchRender( presetNames, options = {} ) {

		const {
			onProgress = null,
			renderSample = null,
		} = options;

		const results = [];
		const totalPresets = presetNames.length;

		for ( let i = 0; i < totalPresets; i ++ ) {

			const name = presetNames[ i ];
			const preset = this._presets.get( name );
			if ( ! preset ) {

				throw new Error( `Preset "${ name }" not found.` );

			}

			if ( onProgress ) onProgress( i, name, 'restoring', 0, totalPresets );

			// Restore preset state (full reset)
			this.restore( name );

			if ( onProgress ) onProgress( i, name, 'restoring', 1, totalPresets );

			// Determine export parameters from the preset
			const exportOpts = preset.export || {};
			const denoiseOpts = preset.denoise || {};
			const minSamples = exportOpts.minSamples ?? preset.pathTracer?.minSamples ?? 50;
			const format = exportOpts.format ?? 'png';
			const denoise = denoiseOpts.enabled ?? false;
			const includeAlpha = exportOpts.includeAlpha ?? false;

			// Wait for samples to accumulate by rendering frames
			const pathTracer = this._pathTracer;

			if ( onProgress ) onProgress( i, name, 'rendering', 0, totalPresets );

			while ( pathTracer.samples < minSamples ) {

				if ( renderSample ) {

					renderSample();

				} else {

					// Default: render one sample per animation frame
					await new Promise( resolve => {

						requestAnimationFrame( () => {

							pathTracer.renderSample();
							resolve();

						} );

					} );

				}

				if ( onProgress ) {

					onProgress( i, name, 'rendering', pathTracer.samples / minSamples, totalPresets );

				}

			}

			// Render a few more frames to ensure fade-in is complete
			for ( let f = 0; f < 3; f ++ ) {

				await new Promise( resolve => {

					requestAnimationFrame( () => {

						pathTracer.renderSample();
						resolve();

					} );

				} );

			}

			// Export
			if ( onProgress ) onProgress( i, name, 'exporting', 0, totalPresets );

			const exportResult = await pathTracer.exportAsync( {
				format,
				minSamples,
				denoise,
				denoiseOptions: denoise ? {
					sigma: denoiseOpts.sigma ?? 5.0,
					threshold: denoiseOpts.threshold ?? 0.03,
					kSigma: denoiseOpts.kSigma ?? 1.0,
				} : {},
				includeAlpha,
				onProgress: ( phase, progress ) => {

					if ( onProgress ) onProgress( i, name, phase, progress, totalPresets );

				},
			} );

			results.push( {
				presetName: name,
				result: exportResult,
			} );

		}

		return results;

	}

	/**
	 * Trigger download of all batch render results.
	 * @param {Array<{presetName: string, result: Object}>} results - Results from batchRender
	 * @param {string} [prefix='render'] - Filename prefix
	 */
	downloadResults( results, prefix = 'render' ) {

		for ( const { presetName, result } of results ) {

			const safeName = presetName.replace( /[^a-zA-Z0-9_-]/g, '_' );
			const ext = result.format === 'exr' ? 'exr' : 'png';
			const filename = `${ prefix }_${ safeName }.${ ext }`;

			let blob;
			if ( result.data instanceof Blob ) {

				blob = result.data;

			} else {

				// ArrayBuffer (EXR)
				blob = new Blob( [ result.data ], { type: 'application/octet-stream' } );

			}

			const url = URL.createObjectURL( blob );
			const a = document.createElement( 'a' );
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL( url );

		}

	}

}
