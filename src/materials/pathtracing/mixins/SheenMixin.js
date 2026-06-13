/**
 * SheenMixin - Adds sheen (velvet/fabric) material properties to PhysicalPathTracingMaterial.
 *
 * Sheen is a surface lobe that models the effect of fine fibers on fabrics and
 * similar materials. This mixin ensures the sheen feature flag is present.
 */
export const SheenMixin = {

	name: 'SheenMixin',

	getDefines() {

		return {
			FEATURE_SHEEN: 1,
		};

	},

	getUniforms() {

		return {};

	},

	getGLSL() {

		return '';

	},

	onBeforeRender( material ) {

		void material;

	},

};
