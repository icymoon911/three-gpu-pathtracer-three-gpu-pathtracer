/**
 * Iridescence (thin-film) material feature mixin.
 *
 * Provides:
 *   - (No additional defines — iridescence code is always compiled when present in BSDF)
 *   - (No additional uniforms — iridescence data is read from the material texture)
 *   - GLSL include chunk for iridescence-related shader code
 *
 * The iridescence strategy is provided by the iridescence_strategy module and used
 * by the metallic strategy (specular evaluation) in the BSDF coordinator.
 */

export const IridescenceMixin = {

	FEATURE_DEFINES: {},

	FEATURE_UNIFORMS: {},

};

/**
 * GLSL snippet injected at the IRIDESCENCE_GLSL_INCLUDE marker.
 * Currently empty — all iridescence code lives in the iridescence strategy module.
 * Reserved for future iridescence-specific extensions (thick-film, multi-layer).
 */
export const IRIDESCENCE_GLSL_INCLUDE = /* glsl */`
	// Iridescence strategy is provided by the BSDF strategy module (iridescence_strategy).
`;
