/**
 * Struct definitions for shader data.
 *
 * Dependency graph:
 *   camera_struct       → (none)
 *   equirect_struct     → (none)
 *   lights_struct       → texture_sample_functions
 *   material_struct     → texture_sample_functions
 *   surface_record_struct → (none)
 */
export * from './camera_struct.glsl.js';
export * from './equirect_struct.glsl.js';
export * from './lights_struct.glsl.js';
export * from './material_struct.glsl.js';
export * from './surface_record_struct.glsl.js';
