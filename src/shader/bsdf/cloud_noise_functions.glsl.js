export const cloud_noise_functions = /* glsl */`

	// Permutation polynomial hash
	vec3 mod289_v3( vec3 x ) { return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0; }
	vec4 mod289_v4( vec4 x ) { return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0; }
	vec4 permute_v4( vec4 x ) { return mod289_v4( ( ( x * 34.0 ) + 10.0 ) * x ); }
	vec4 taylorInvSqrt_v4( vec4 r ) { return 1.79284291400159 - 0.85373472095314 * r; }

	// Simplex 3D noise
	float snoise( vec3 v ) {

		const vec2 C = vec2( 1.0 / 6.0, 1.0 / 3.0 );
		const vec4 D = vec4( 0.0, 0.5, 1.0, 2.0 );

		// First corner
		vec3 i = floor( v + dot( v, C.yyy ) );
		vec3 x0 = v - i + dot( i, C.xxx );

		// Other corners
		vec3 g = step( x0.yzx, x0.xyz );
		vec3 l = 1.0 - g;
		vec3 i1 = min( g.xyz, l.zxy );
		vec3 i2 = max( g.xyz, l.zxy );

		vec3 x1 = x0 - i1 + C.xxx;
		vec3 x2 = x0 - i2 + C.yyy;
		vec3 x3 = x0 - D.yyy;

		// Permutations
		i = mod289_v3( i );
		vec4 p = permute_v4( permute_v4( permute_v4(
			i.z + vec4( 0.0, i1.z, i2.z, 1.0 ) )
			+ i.y + vec4( 0.0, i1.y, i2.y, 1.0 ) )
			+ i.x + vec4( 0.0, i1.x, i2.x, 1.0 ) );

		// Gradients: 7x7 points over a square, mapped onto an octahedron
		float n_ = 0.142857142857;
		vec3 ns = n_ * D.wyz - D.xzx;

		vec4 j = p - 49.0 * floor( p * ns.z * ns.z );

		vec4 x_ = floor( j * ns.z );
		vec4 y_ = floor( j - 7.0 * x_ );

		vec4 x = x_ * ns.x + ns.yyyy;
		vec4 y = y_ * ns.x + ns.yyyy;
		vec4 h = 1.0 - abs( x ) - abs( y );

		vec4 b0 = vec4( x.xy, y.xy );
		vec4 b1 = vec4( x.zw, y.zw );

		vec4 s0 = floor( b0 ) * 2.0 + 1.0;
		vec4 s1 = floor( b1 ) * 2.0 + 1.0;
		vec4 sh = - step( h, vec4( 0.0 ) );

		vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
		vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

		vec3 p0 = vec3( a0.xy, h.x );
		vec3 p1 = vec3( a0.zw, h.y );
		vec3 p2 = vec3( a1.xy, h.z );
		vec3 p3 = vec3( a1.zw, h.w );

		// Normalise gradients
		vec4 norm = taylorInvSqrt_v4( vec4( dot( p0, p0 ), dot( p1, p1 ), dot( p2, p2 ), dot( p3, p3 ) ) );
		p0 *= norm.x;
		p1 *= norm.y;
		p2 *= norm.z;
		p3 *= norm.w;

		// Mix final noise value
		vec4 m = max( 0.5 - vec4( dot( x0, x0 ), dot( x1, x1 ), dot( x2, x2 ), dot( x3, x3 ) ), 0.0 );
		m = m * m;
		return 105.0 * dot( m * m, vec4( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 ), dot( p3, x3 ) ) );

	}

	// Fractal Brownian Motion using simplex noise
	float fbm( vec3 p, int octaves ) {

		float value = 0.0;
		float amplitude = 0.5;
		float frequency = 1.0;

		for ( int i = 0; i < 8; i ++ ) {

			if ( i >= octaves ) break;
			value += amplitude * snoise( p * frequency );
			frequency *= 2.0;
			amplitude *= 0.5;

		}

		return value;

	}

	// Cloud density function using FBM noise
	// Returns density at a given point in space
	float cloudDensity( vec3 position, float noiseScale, int octaves, float coverage ) {

		vec3 scaledPos = position * noiseScale;

		// base cloud shape using FBM
		float noise = fbm( scaledPos, octaves );

		// remap noise to density: coverage controls how much of the volume is filled
		float density = smoothstep( 1.0 - coverage, 1.0, noise * 0.5 + 0.5 );

		return density;

	}

`;
