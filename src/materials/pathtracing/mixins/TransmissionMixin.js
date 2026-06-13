/**
 * Transmission (glass / transparent) material feature mixin.
 *
 * Provides:
 *   - FEATURE_TRANSMISSION define
 *   - transmissiveBounces uniform
 *   - GLSL include chunk for transmission-related shader code
 *
 * Usage:
 *   import { TransmissionMixin } from './mixins/TransmissionMixin.js';
 *   // In constructor:
 *   Object.assign( defines, TransmissionMixin.FEATURE_DEFINES );
 *   Object.assign( uniforms, TransmissionMixin.FEATURE_UNIFORMS );
 *   // In fragment shader, inject TRANSMISSION_GLSL_INCLUDE where indicated.
 */

export const TransmissionMixin = {

	FEATURE_DEFINES: {

		FEATURE_TRANSMISSION: 1,

	},

	FEATURE_UNIFORMS: {

		transmissiveBounces: { value: 10 },

	},

};

/**
 * GLSL snippet injected at the TRANSMISSION_GLSL_INCLUDE marker.
 * Currently empty — all transmission code lives in the transmissive strategy module.
 * Reserved for future transmission-specific extensions (dispersion, absorption).
 */
export const TRANSMISSION_GLSL_INCLUDE = /* glsl */`
	// Transmission strategy is provided by the BSDF strategy module (transmissive_strategy).
`;
