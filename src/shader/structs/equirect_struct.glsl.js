// @module equirect_struct
// @description EquirectHdrInfo struct for environment map HDR sampling.
// @provides EquirectHdrInfo
// @depends (none)
// @included_by equirect_functions, direct_light_contribution_function, PhysicalPathTracingMaterial

export const equirect_struct = /* glsl */`

	struct EquirectHdrInfo {

		sampler2D marginalWeights;
		sampler2D conditionalWeights;
		sampler2D map;

		float totalSum;

	};

`;
