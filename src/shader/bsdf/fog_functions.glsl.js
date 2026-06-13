// @module fog_strategy
// @description Volumetric fog BSDF strategy.
//   Provides fog volume intersection and isotropic scattering sampling.
// @provides intersectFogVolume, sampleFogVolume
// @depends material_struct (Material)
// @depends surface_record_struct (ScatterRecord)
// @included_by bsdf_functions, trace_scene_function

export const fog_functions = /* glsl */`

	// returns the hit distance given the material density
	float intersectFogVolume( Material material, float u ) {

		// https://raytracing.github.io/books/RayTracingTheNextWeek.html#volumes/constantdensitymediums
		return material.opacity == 0.0 ? INFINITY : ( - 1.0 / material.opacity ) * log( u );

	}

	ScatterRecord sampleFogVolume( SurfaceRecord surf, vec2 uv ) {

		ScatterRecord sampleRec;
		sampleRec.specularPdf = 0.0;
		sampleRec.pdf = 1.0 / ( 2.0 * PI );
		sampleRec.direction = sampleSphere( uv );
		sampleRec.color = surf.color;
		return sampleRec;

	}

`;
