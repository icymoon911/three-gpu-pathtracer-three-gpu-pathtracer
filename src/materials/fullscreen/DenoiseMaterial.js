import { NoBlending } from 'three';
import { MaterialBase } from '../MaterialBase.js';

export class DenoiseMaterial extends MaterialBase {

	constructor( parameters ) {

		super( {

			blending: NoBlending,

			transparent: false,

			depthWrite: false,

			depthTest: false,

			defines: {

				USE_SLIDER: 0,

			},

			uniforms: {

				sigma: { value: 5.0 },
				threshold: { value: 0.03 },
				kSigma: { value: 1.0 },

				// Sample count drives the adaptive denoise strength: at low sample
				// counts the filter shrinks its kernel and relaxes the edge threshold
				// to preserve detail; as samples accumulate it converges toward the
				// full sigma / threshold / kSigma values configured above.
				samples: { value: 1 },

				map: { value: null },
				opacity: { value: 1 },

			},

			vertexShader: /* glsl */`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}

			`,

			fragmentShader: /* glsl */`

				//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
				//  Copyright (c) 2018-2019 Michele Morrone
				//  All rights reserved.
				//
				//  https://michelemorrone.eu - https://BrutPitt.com
				//
				//  me@michelemorrone.eu - brutpitt@gmail.com
				//  twitter: @BrutPitt - github: BrutPitt
				//
				//  https://github.com/BrutPitt/glslSmartDeNoise/
				//
				//  This software is distributed under the terms of the BSD 2-Clause license
				//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

				uniform sampler2D map;

				uniform float sigma;
				uniform float threshold;
				uniform float kSigma;
				uniform int samples;
				uniform float opacity;

				varying vec2 vUv;

				#define INV_SQRT_OF_2PI 0.39894228040143267793994605993439
				#define INV_PI 0.31830988618379067153776752674503

				// Parameters:
				//   sampler2D tex   - sampler image / texture
				//   vec2 uv         - actual fragment coord
				//   float sigma  >  0 - sigma Standard Deviation
				//   float kSigma >= 0 - sigma coefficient
				//     kSigma * sigma  -->  radius of the circular kernel
				//   float threshold   - edge sharpening threshold
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

					// Guard against division by zero when all weights collapse (e.g.
					// uniform regions with a very tight threshold).
					if ( zBuff < 1e-6 ) return centrPx;
					return aBuff / zBuff;

				}

				void main() {

					// Adaptive denoise: at low sample counts the rendered image is
					// extremely noisy, so a large bilateral kernel obliterates fine
					// detail.  We scale sigma and kSigma down and raise the colour
					// threshold proportionally so that the filter acts as a gentle
					// localised blur that still respects strong edges.  As samples
					// accumulate the parameters converge toward the user-configured
					// values and the filter can safely smooth the remaining noise.
					float effectiveSigma = sigma;
					float effectiveThreshold = threshold;
					float effectiveKSigma = kSigma;

					if ( samples > 0 && samples < 100 ) {

						float sampleFactor = float( samples ) / 100.0;

						// Smoothstep gives a gentle ease-in so the first few samples
						// barely filter at all, ramping up smoothly as the image
						// stabilises.
						float adaptiveFactor = smoothstep( 0.0, 1.0, sampleFactor );

						// Shrink spatial kernel at low sample counts (fewer neighbours
						// are averaged → details survive).
						effectiveSigma = mix( max( sigma * 0.25, 1.0 ), sigma, adaptiveFactor );

						// Relax colour threshold at low sample counts so that noise
						// variations do not trigger the edge-preservation term and
						// prevent useful neighbouring samples from contributing.
						effectiveThreshold = mix(
							max( threshold * 4.0, 0.08 ),
							threshold,
							adaptiveFactor
						);

						// Tighten kernel radius.
						effectiveKSigma = mix( max( kSigma * 0.5, 0.5 ), kSigma, adaptiveFactor );

					}

					gl_FragColor = smartDeNoise(
						map, vec2( vUv.x, vUv.y ),
						effectiveSigma, effectiveKSigma, effectiveThreshold
					);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
					#include <premultiplied_alpha_fragment>

					gl_FragColor.a *= opacity;

				}

			`

		} );

		this.setValues( parameters );

	}

}
