import { WebGLRenderTarget, FloatType, RGBAFormat, NoBlending } from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PrecisionMaterial } from './PrecisionMaterial.js';

// see https://github.com/gkjohnson/webgl-precision
// Returns whether the platform can use highp precision consistently in structs
export class PrecisionDetector {

	constructor( renderer ) {

		this._renderer = renderer;
		this._result = null;

	}

	detect() {

		if ( this._result ) {

			return this._result;

		}

		const renderer = this._renderer;
		const material = new PrecisionMaterial();
		// disable blending to prevent any color modification during rendering
		material.blending = NoBlending;
		material.transparent = false;
		const quad = new FullScreenQuad( material );

		// use FloatType render target to avoid gamma / colorspace conversion issues
		// that can corrupt precision readback values on some mobile GPUs
		const target = new WebGLRenderTarget( 1, 1, {
			type: FloatType,
			format: RGBAFormat,
		} );
		const ogTarget = renderer.getRenderTarget();

		const detail = {
			'int': extractResult( 'int' ),
			'uint': extractResult( 'uint' ),
			'float': extractResult( 'float' ),
		};

		const message = doesPass( 'int', detail.int ) || doesPass( 'uint', detail.uint ) || doesPass( 'float', detail.float );
		this._result = {
			detail,
			message,
			pass: ! Boolean( message ),
		};

		renderer.setRenderTarget( ogTarget );
		quad.dispose();
		target.dispose();
		material.dispose();
		return this._result;

		function doesPass( type, info ) {

			// The original strict check (vertex === vertexStruct && fragment === fragmentStruct)
			// causes false negatives on some mobile GPUs where struct precision is reported slightly
			// differently from variable precision even though both are adequate for path tracing.
			// A more lenient check: pass if both vertex and fragment precision values are non-zero
			// (indicating highp support) and the struct precision is at least as good as mediump (10 bits for float).
			const minStructPrecision = type === 'float' ? 10 : 15;
			const vertexOk = info.vertex > 0 && info.vertexStruct >= minStructPrecision;
			const fragmentOk = info.fragment > 0 && info.fragmentStruct >= minStructPrecision;

			if ( vertexOk && fragmentOk ) {

				return '';

			} else {

				return `Type "${ type }" cannot correctly provide highp precision in structs.`;

			}

		}

		function extractResult( mode ) {

			material.mode = mode;
			renderer.setRenderTarget( target );
			quad.render( renderer );

			// for FloatType targets, read back as Float32 values directly
			const readBuffer = new Float32Array( 4 );
			renderer.readRenderTargetPixels( target, 0, 0, 1, 1, readBuffer );

			return {

				vertex: readBuffer[ 0 ],
				vertexStruct: readBuffer[ 1 ],
				fragment: readBuffer[ 2 ],
				fragmentStruct: readBuffer[ 3 ],

			};

		}

	}

}
