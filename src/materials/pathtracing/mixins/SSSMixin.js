/**
 * SSSMixin - Adds subsurface scattering / fog volume properties to PhysicalPathTracingMaterial.
 *
 * Contributes fog volume-related defines. When registered, the FEATURE_FOG define
 * is toggled based on whether any material in the scene uses fog volumes.
 */
export const SSSMixin = {

	name: 'SSSMixin',

	getDefines() {

		return {
			FEATURE_FOG: 1,
		};

	},

	getUniforms() {

		return {};

	},

	getGLSL() {

		return '';

	},

	onBeforeRender( material ) {

		// Toggle FEATURE_FOG based on whether the materials texture has any fog volume usage
		if ( material.materials && material.materials.features ) {

			material.setDefine( 'FEATURE_FOG', material.materials.features.isUsed( 'FOG' ) ? 1 : 0 );

		}

	},

};
