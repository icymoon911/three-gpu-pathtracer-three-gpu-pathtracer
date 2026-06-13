export const fog_functions = /* glsl */`

	// returns the hit distance given the material density
	float intersectFogVolume( Material material, float u ) {

		// https://raytracing.github.io/books/RayTracingTheNextWeek.html#volumes/constantdensitymediums
		return material.opacity == 0.0 ? INFINITY : ( - 1.0 / material.opacity ) * log( u );

	}

	// returns the hit distance for volumetric cloud with noise-modulated density
	// uses delta tracking / ray marching to find the intersection point
	float intersectCloudVolume( Material material, Ray ray, float u ) {

		if ( material.opacity == 0.0 ) return INFINITY;

		float noiseScale = material.cloudNoiseScale;
		float coverage = material.cloudCoverage;
		int octaves = int( material.cloudNoiseOctaves );
		float baseDensity = material.opacity;

		// delta tracking: step through the volume and accumulate density
		// until we exceed the random threshold -log(u)
		float threshold = - log( u );
		float accumulatedDensity = 0.0;
		float stepSize = 0.5 / noiseScale; // adaptive step size based on noise scale
		float t = 0.0;
		float maxDist = 100.0; // max march distance

		for ( int i = 0; i < 64; i ++ ) {

			t += stepSize;
			if ( t > maxDist ) break;

			vec3 samplePos = ray.origin + ray.direction * t;
			float density = cloudDensity( samplePos, noiseScale, octaves, coverage );
			accumulatedDensity += density * baseDensity * stepSize;

			if ( accumulatedDensity >= threshold ) {

				return t;

			}

		}

		return INFINITY;

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
