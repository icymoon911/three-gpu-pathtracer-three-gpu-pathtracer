import {
	ACESFilmicToneMapping,
	Scene,
	EquirectangularReflectionMapping,
	WebGLRenderer,
	PerspectiveCamera,
	Mesh,
	SphereGeometry,
	BoxGeometry,
	PlaneGeometry,
	MeshStandardMaterial,
	MeshPhysicalMaterial,
	DoubleSide,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { getScaledSettings } from './utils/getScaledSettings.js';
import { LoaderElement } from './utils/LoaderElement.js';
import { WebGLPathTracer, PresetManager } from 'three-gpu-pathtracer';

const ENV_URL = 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/master/hdri/studio_small_05_1k.hdr';

let pathTracer, renderer, controls;
let camera, scene;
let loader;
let presetManager;
let batchResults = [];

// UI elements
let presetListEl, statusEl, progressBarEl, progressFillEl, samplesEl;
let btnCapture, btnBatch, btnDownloadResults, btnExport, btnImport, fileInput;

// Track which presets are selected for batch rendering
const selectedPresets = new Set();

init();

async function init() {

	const { tiles, renderScale } = getScaledSettings();

	loader = new LoaderElement();
	loader.attach( document.body );

	// Get UI elements
	presetListEl = document.getElementById( 'preset-list' );
	statusEl = document.getElementById( 'preset-status' );
	progressBarEl = document.getElementById( 'progress-bar' );
	progressFillEl = progressBarEl.querySelector( '.fill' );
	samplesEl = document.getElementById( 'samples-display' );
	btnCapture = document.getElementById( 'btn-capture' );
	btnBatch = document.getElementById( 'btn-batch' );
	btnDownloadResults = document.getElementById( 'btn-download-results' );
	btnExport = document.getElementById( 'btn-export' );
	btnImport = document.getElementById( 'btn-import' );
	fileInput = document.getElementById( 'file-input' );

	// renderer
	renderer = new WebGLRenderer( { antialias: true } );
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	document.body.appendChild( renderer.domElement );

	// path tracer
	pathTracer = new WebGLPathTracer( renderer );
	pathTracer.filterGlossyFactor = 0.5;
	pathTracer.renderScale = renderScale;
	pathTracer.tiles.set( tiles, tiles );

	// camera
	camera = new PerspectiveCamera( 50, 1, 0.1, 100 );
	camera.position.set( 5, 4, 8 );

	// scene
	scene = new Scene();
	scene.backgroundBlurriness = 0.1;
	scene.environmentIntensity = 2;

	// controls
	controls = new OrbitControls( camera, renderer.domElement );
	controls.target.set( 0, 1, 0 );
	controls.addEventListener( 'change', () => pathTracer.updateCamera() );
	controls.update();

	// Create a simple scene with primitives
	createScene();

	// Load environment
	const envTexture = await new HDRLoader().loadAsync( ENV_URL );
	envTexture.mapping = EquirectangularReflectionMapping;
	scene.background = envTexture;
	scene.environment = envTexture;

	// Initialize path tracer
	pathTracer.setScene( scene, camera );
	loader.setPercentage( 1 );

	// Initialize preset manager
	presetManager = new PresetManager( pathTracer, scene, camera );

	// Add a custom preset to demonstrate
	presetManager.addPreset( {
		name: 'ACES Cinematic',
		pathTracer: {
			bounces: 6,
			transmissiveBounces: 4,
			filterGlossyFactor: 0.3,
			renderScale: 1.0,
			tiles: [ 2, 2 ],
			minSamples: 5,
			renderDelay: 100,
			fadeDuration: 500,
		},
		scene: {
			environmentIntensity: 3,
			backgroundBlurriness: 0.15,
			backgroundIntensity: 1,
		},
		denoise: {
			enabled: false,
		},
		export: {
			format: 'png',
			minSamples: 80,
			includeAlpha: false,
		},
	} );

	presetManager.addPreset( {
		name: 'Reinhard Low-Light',
		pathTracer: {
			bounces: 4,
			transmissiveBounces: 3,
			filterGlossyFactor: 0.5,
			renderScale: 0.75,
			tiles: [ 3, 3 ],
			minSamples: 3,
			renderDelay: 50,
			fadeDuration: 300,
		},
		scene: {
			environmentIntensity: 1,
			backgroundBlurriness: 0.2,
			backgroundIntensity: 0.5,
		},
		denoise: {
			enabled: true,
			sigma: 6.0,
			threshold: 0.02,
			kSigma: 1.5,
		},
		export: {
			format: 'png',
			minSamples: 40,
			includeAlpha: false,
		},
	} );

	// Set up UI event handlers
	setupUI();

	// Refresh the preset list display
	refreshPresetList();

	window.addEventListener( 'resize', onResize );

	onResize();
	animate();

}

function createScene() {

	// Floor
	const floorGeo = new PlaneGeometry( 20, 20 );
	const floorMat = new MeshStandardMaterial( {
		color: 0x888888,
		roughness: 0.1,
		metalness: 0.9,
		side: DoubleSide,
	} );
	const floor = new Mesh( floorGeo, floorMat );
	floor.rotation.x = - Math.PI / 2;
	floor.position.y = 0;
	scene.add( floor );

	// Metallic sphere
	const sphereGeo = new SphereGeometry( 1, 64, 64 );
	const sphereMat = new MeshStandardMaterial( {
		color: 0xffffff,
		roughness: 0.05,
		metalness: 1.0,
	} );
	const sphere = new Mesh( sphereGeo, sphereMat );
	sphere.position.set( - 2, 1, 0 );
	scene.add( sphere );

	// Glass-like sphere
	const glassGeo = new SphereGeometry( 0.8, 64, 64 );
	const glassMat = new MeshPhysicalMaterial( {
		color: 0xaaddff,
		roughness: 0.0,
		metalness: 0.0,
		transmission: 0.95,
		ior: 1.5,
		thickness: 1.6,
	} );
	const glassSphere = new Mesh( glassGeo, glassMat );
	glassSphere.position.set( 1.5, 0.8, 1 );
	scene.add( glassSphere );

	// Rough box
	const boxGeo = new BoxGeometry( 1.5, 2, 1.5 );
	const boxMat = new MeshStandardMaterial( {
		color: 0xdd5533,
		roughness: 0.7,
		metalness: 0.1,
	} );
	const box = new Mesh( boxGeo, boxMat );
	box.position.set( 0, 1, - 2 );
	scene.add( box );

	// Small shiny sphere
	const smallSphereGeo = new SphereGeometry( 0.4, 32, 32 );
	const smallSphereMat = new MeshStandardMaterial( {
		color: 0xffcc00,
		roughness: 0.2,
		metalness: 0.8,
	} );
	const smallSphere = new Mesh( smallSphereGeo, smallSphereMat );
	smallSphere.position.set( 2.5, 0.4, - 1.5 );
	scene.add( smallSphere );

}

function setupUI() {

	btnCapture.addEventListener( 'click', () => {

		const name = prompt( 'Enter preset name:', `Custom ${ presetManager.getPresetNames().length + 1 }` );
		if ( name ) {

			presetManager.capture( name );
			refreshPresetList();
			setStatus( `Captured preset: "${ name }"` );

		}

	} );

	btnExport.addEventListener( 'click', () => {

		presetManager.downloadJSON( 'render-presets.json' );
		setStatus( 'Presets exported as JSON' );

	} );

	btnImport.addEventListener( 'click', () => {

		fileInput.click();

	} );

	fileInput.addEventListener( 'change', async ( e ) => {

		const file = e.target.files[ 0 ];
		if ( file ) {

			try {

				const importedNames = await presetManager.importFromFile( file );
				refreshPresetList();
				setStatus( `Imported ${ importedNames.length } preset(s): ${ importedNames.join( ', ' ) }` );

			} catch ( err ) {

				setStatus( `Import error: ${ err.message }` );

			}

		}

		// Reset file input so the same file can be imported again
		fileInput.value = '';

	} );

	btnBatch.addEventListener( 'click', async () => {

		if ( selectedPresets.size === 0 ) {

			setStatus( 'Select at least one preset to batch render' );
			return;

		}

		const presetNames = Array.from( selectedPresets );
		btnBatch.disabled = true;
		btnCapture.disabled = true;
		showProgress( true );
		batchResults = [];

		setStatus( `Batch rendering ${ presetNames.length } preset(s)...` );

		try {

			batchResults = await presetManager.batchRender( presetNames, {
				onProgress: ( presetIndex, presetName, phase, progress, totalPresets ) => {

					const totalProgress = ( presetIndex + progress ) / totalPresets;
					setProgress( totalProgress );

					if ( phase === 'restoring' ) {

						setStatus( `[${ presetIndex + 1 }/${ totalPresets }] Restoring "${ presetName }"...` );

					} else if ( phase === 'rendering' ) {

						setStatus( `[${ presetIndex + 1 }/${ totalPresets }] Rendering "${ presetName }" (${ Math.round( progress * 100 ) }%)` );

					} else if ( phase === 'denoising' ) {

						setStatus( `[${ presetIndex + 1 }/${ totalPresets }] Denoising "${ presetName }"...` );

					} else if ( phase === 'exporting' ) {

						setStatus( `[${ presetIndex + 1 }/${ totalPresets }] Exporting "${ presetName }"...` );

					}

				},
			} );

			btnDownloadResults.disabled = false;
			setStatus( `Batch render complete! ${ batchResults.length } result(s) ready.` );

		} catch ( err ) {

			setStatus( `Batch render error: ${ err.message }` );

		} finally {

			btnBatch.disabled = false;
			btnCapture.disabled = false;
			showProgress( false );

			// Restore the first rendered preset to show its result
			if ( presetNames.length > 0 ) {

				presetManager.restore( presetNames[ 0 ] );
				refreshPresetList();

			}

		}

	} );

	btnDownloadResults.addEventListener( 'click', () => {

		if ( batchResults.length > 0 ) {

			presetManager.downloadResults( batchResults, 'batch-render' );
			setStatus( `Downloaded ${ batchResults.length } result(s)` );

		}

	} );

}

function refreshPresetList() {

	presetListEl.innerHTML = '';
	const names = presetManager.getPresetNames();

	for ( const name of names ) {

		const item = document.createElement( 'div' );
		item.className = 'preset-item';
		if ( presetManager.activePreset === name ) {

			item.classList.add( 'active' );

		}

		// Checkbox for batch selection
		const checkbox = document.createElement( 'input' );
		checkbox.type = 'checkbox';
		checkbox.checked = selectedPresets.has( name );
		checkbox.addEventListener( 'change', ( e ) => {

			e.stopPropagation();
			if ( checkbox.checked ) {

				selectedPresets.add( name );

			} else {

				selectedPresets.delete( name );

			}

		} );

		// Name label
		const nameSpan = document.createElement( 'span' );
		nameSpan.className = 'preset-name';
		nameSpan.textContent = name;
		nameSpan.addEventListener( 'click', () => {

			// Toggle selection
			checkbox.checked = ! checkbox.checked;
			checkbox.dispatchEvent( new Event( 'change' ) );

		} );

		// Restore button
		const restoreBtn = document.createElement( 'button' );
		restoreBtn.className = 'preset-restore';
		restoreBtn.textContent = 'Apply';
		restoreBtn.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			presetManager.restore( name );
			controls.update();
			refreshPresetList();
			setStatus( `Restored preset: "${ name }"` );

		} );

		item.appendChild( checkbox );
		item.appendChild( nameSpan );
		item.appendChild( restoreBtn );

		presetListEl.appendChild( item );

	}

}

function setStatus( msg ) {

	statusEl.textContent = msg;

}

function showProgress( visible ) {

	progressBarEl.style.display = visible ? 'block' : 'none';
	if ( ! visible ) progressFillEl.style.width = '0%';

}

function setProgress( value ) {

	progressFillEl.style.width = `${ Math.round( value * 100 ) }%`;

}

function onResize() {

	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setPixelRatio( window.devicePixelRatio );

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	pathTracer.updateCamera();

}

function animate() {

	requestAnimationFrame( animate );

	pathTracer.renderSample();

	samplesEl.textContent = `Samples: ${ pathTracer.samples }${ pathTracer.isCompiling ? ' (compiling)' : '' }`;

	loader.setSamples( pathTracer.samples, pathTracer.isCompiling );

}
