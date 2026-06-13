// @module camera_struct
// @description PhysicalCamera struct for depth-of-field parameters.
// @provides PhysicalCamera
// @depends (none)
// @included_by camera_util_functions, PhysicalPathTracingMaterial (when FEATURE_DOF)

export const camera_struct = /* glsl */`

	struct PhysicalCamera {

		float focusDistance;
		float anamorphicRatio;
		float bokehSize;
		int apertureBlades;
		float apertureRotation;

	};

`;
