/**
 * IridescenceMixin - Adds iridescence (thin-film interference) properties to PhysicalPathTracingMaterial.
 *
 * Iridescence models the color-shifting effect seen in soap bubbles, oil films,
 * and certain beetle shells. This mixin ensures the feature flag is present.
 */
export const IridescenceMixin = {

	name: 'IridescenceMixin',

	getDefines() {

		return {
			FEATURE_IRIDESCENCE: 1,
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
