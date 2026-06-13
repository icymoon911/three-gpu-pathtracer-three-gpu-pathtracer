/**
 * MetalMixin - Adds metallic material properties to PhysicalPathTracingMaterial.
 *
 * Contributes metalness-related defines and uniforms. When registered on a
 * material, it ensures the metalness feature flags and uniform accessors are
 * available for the shader pipeline.
 */
export const MetalMixin = {

	name: 'MetalMixin',

	getDefines() {

		return {
			FEATURE_METALNESS: 1,
		};

	},

	getUniforms() {

		return {};

	},

	getGLSL() {

		// Metal-specific defines are handled through the standard material_struct
		// and bsdf_functions pipeline. This mixin ensures the FEATURE_METALNESS
		// define is present so conditional compilation can gate metalness code paths.
		return '';

	},

	onBeforeRender( material ) {

		// Metalness is always available through the material struct; no dynamic
		// define toggling is needed at render time.
		void material;

	},

};
