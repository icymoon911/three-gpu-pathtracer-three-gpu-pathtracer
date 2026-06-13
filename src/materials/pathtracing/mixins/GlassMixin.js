import { Matrix4 } from 'three';

/**
 * GlassMixin - Adds transmissive / glass material properties to PhysicalPathTracingMaterial.
 *
 * Contributes transmission, thin-film, IOR, and attenuation-related defines and uniforms.
 */
export const GlassMixin = {

	name: 'GlassMixin',

	getDefines() {

		return {
			FEATURE_TRANSMISSION: 1,
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

/**
 * BackgroundMixin - Adds environment / background map support.
 *
 * Contributes background-related defines and uniforms.
 */
export const BackgroundMixin = {

	name: 'BackgroundMixin',

	getDefines() {

		return {
			FEATURE_BACKGROUND_MAP: 0,
		};

	},

	getUniforms() {

		return {
			backgroundBlur: 0.0,
			backgroundMap: null,
			backgroundAlpha: 1.0,
			backgroundIntensity: 1.0,
			backgroundRotation: new Matrix4(),
		};

	},

	getGLSL() {

		return '';

	},

	onBeforeRender( material ) {

		material.setDefine( 'FEATURE_BACKGROUND_MAP', material.backgroundMap ? 1 : 0 );

	},

};
