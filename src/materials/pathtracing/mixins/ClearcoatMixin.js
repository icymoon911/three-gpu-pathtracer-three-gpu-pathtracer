/**
 * Clearcoat (layered / automotive) material feature mixin.
 *
 * Provides:
 *   - (No additional defines — clearcoat code is always compiled when present in BSDF)
 *   - (No additional uniforms — clearcoat data is read from the material texture)
 *   - GLSL include chunk for clearcoat-related shader code
 *
 * The clearcoat BSDF strategy is provided by the clearcoat_strategy module and
 * composed into bsdf_functions by the BSDF coordinator.
 */

export const ClearcoatMixin = {

	FEATURE_DEFINES: {},

	FEATURE_UNIFORMS: {},

};

/**
 * GLSL snippet injected at the CLEARCOAT_GLSL_INCLUDE marker.
 * Currently empty — all clearcoat code lives in the clearcoat strategy module.
 * Reserved for future clearcoat-specific extensions (multi-layer, flakes).
 */
export const CLEARCOAT_GLSL_INCLUDE = /* glsl */`
	// Clearcoat strategy is provided by the BSDF strategy module (clearcoat_strategy).
`;
