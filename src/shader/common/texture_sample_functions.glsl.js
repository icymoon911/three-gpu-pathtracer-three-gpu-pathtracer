// @module texture_sample_functions
// @description Texture sampling utilities for 1D attribute textures and barycentric interpolation.
// @provides texelFetch1D, uTexelFetch1D, textureSampleBarycoord
// @depends (none)
// @included_by attenuate_hit_function, get_surface_record_function, lights_struct, material_struct

export const texture_sample_functions = /*glsl */`

	// add texel fetch functions for texture arrays
	vec4 texelFetch1D( sampler2DArray tex, int layer, uint index ) {

		uint width = uint( textureSize( tex, 0 ).x );
		uvec2 uv;
		uv.x = index % width;
		uv.y = index / width;

		return texelFetch( tex, ivec3( uv, layer ), 0 );

	}

	vec4 textureSampleBarycoord( sampler2DArray tex, int layer, vec3 barycoord, uvec3 faceIndices ) {

		return
			barycoord.x * texelFetch1D( tex, layer, faceIndices.x ) +
			barycoord.y * texelFetch1D( tex, layer, faceIndices.y ) +
			barycoord.z * texelFetch1D( tex, layer, faceIndices.z );

	}

`;
