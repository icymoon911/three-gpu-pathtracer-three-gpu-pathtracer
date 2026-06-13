/**
 * Light collection utilities.
 *
 * Extracted from sceneUpdateUtils.js to provide a focused module for
 * gathering lights and IES textures from a scene.
 */

function uuidSort( a, b ) {

	if ( a.uuid < b.uuid ) return 1;
	if ( a.uuid > b.uuid ) return - 1;
	return 0;

}

/**
 * Collect all visible lights from a scene, sorted by UUID for deterministic ordering.
 * Recognizes RectAreaLight, SpotLight, PointLight, and DirectionalLight.
 * @param {import('three').Scene} scene
 * @returns {import('three').Light[]}
 */
export function getLights( scene ) {

	const lights = [];
	scene.traverse( c => {

		if ( c.visible ) {

			if (
				c.isRectAreaLight ||
				c.isSpotLight ||
				c.isPointLight ||
				c.isDirectionalLight
			) {

				lights.push( c );

			}

		}

	} );

	return lights.sort( uuidSort );

}

/**
 * Collect unique IES profile textures from an array of lights, sorted by UUID.
 * @param {import('three').Light[]} lights
 * @returns {import('three').DataTexture[]}
 */
export function getIesTextures( lights ) {

	const textures = lights.map( l => l.iesMap || null ).filter( t => t );
	const textureSet = new Set( textures );
	return Array.from( textureSet ).sort( uuidSort );

}
