/**
 * Sheen (cloth-like / fabric) material feature mixin.
 *
 * Provides:
 *   - (No additional defines — sheen code is always compiled when present in BSDF)
 *   - (No additional uniforms — sheen data is read from the material texture)
 *   - GLSL include chunk for sheen-related shader code
 *
 * The sheen BSDF strategy is provided by the sheen_strategy module and composed
 * into bsdf_functions by the BSDF coordinator.
 */

export const SheenMixin = {

	FEATURE_DEFINES: {},

	FEATURE_UNIFORMS: {},

};

/**
 * GLSL snippet injected at the SHEEN_GLSL_INCLUDE marker.
 * Currently empty — all sheen code lives in the sheen strategy module.
 * Reserved for future sheen-specific extensions (fibers, anisotropy).
 */
export const SHEEN_GLSL_INCLUDE = /* glsl */`
	// Sheen strategy is provided by the BSDF strategy module (sheen_strategy).
`;
