/**
 * Texture collection and deduplication utilities.
 *
 * Extracted from sceneUpdateUtils.js to provide a focused module for
 * texture-related operations used during scene updates.
 */

function uuidSort( a, b ) {

	if ( a.uuid < b.uuid ) return 1;
	if ( a.uuid > b.uuid ) return - 1;
	return 0;

}

/**
 * Hash a texture by its source UUID and color space to determine uniqueness.
 * When rendering textures to the texture array they must have a consistent color space.
 * @param {import('three').Texture} t
 * @returns {string}
 */
export function getTextureHash( t ) {

	return `${ t.source.uuid }:${ t.colorSpace }`;

}

/**
 * Reduce the set of textures to just those with a unique source while retaining
 * the order of the textures.
 * @param {import('three').Texture[]} textures
 * @returns {import('three').Texture[]}
 */
function reduceTexturesToUniqueSources( textures ) {

	const sourceSet = new Set();
	const result = [];
	for ( let i = 0, l = textures.length; i < l; i ++ ) {

		const tex = textures[ i ];
		const hash = getTextureHash( tex );
		if ( ! sourceSet.has( hash ) ) {

			sourceSet.add( hash );
			result.push( tex );

		}

	}

	return result;

}

/**
 * Collect all unique textures from an array of materials, deduplicated by source
 * and sorted by UUID for deterministic ordering.
 * @param {import('three').Material[]} materials
 * @returns {import('three').Texture[]}
 */
export function getTextures( materials ) {

	const textureSet = new Set();
	for ( let i = 0, l = materials.length; i < l; i ++ ) {

		const material = materials[ i ];
		for ( const key in material ) {

			const value = material[ key ];
			if ( value && value.isTexture ) {

				textureSet.add( value );

			}

		}

	}

	const textureArray = Array.from( textureSet );
	return reduceTexturesToUniqueSources( textureArray ).sort( uuidSort );

}
