/**
 * BSDF strategy modules and coordinator.
 *
 * The BSDF system is organized as a strategy pattern:
 *   - ggx_base            — Microfacet distribution primitives (Trowbridge-Reitz/GGX)
 *   - metallic_strategy   — GGX specular/metallic lobe (uses ggx_base)
 *   - transmissive_strategy — Transmission/refraction lobe
 *   - sheen_strategy       — Velvet sheen lobe for cloth-like materials
 *   - clearcoat_strategy   — Clearcoat lobe with fixed IOR (uses ggx_base)
 *   - iridescence_strategy — Thin-film spectral iridescence
 *   - fog_strategy         — Volumetric fog intersection and sampling
 *   - bsdf_functions       — Coordinator: composes all strategies + diffuse + unified sampling
 */

// Individual strategy modules (can be used independently)
export * from './ggx_base.glsl.js';
export * from './metallic_strategy.glsl.js';
export * from './transmissive_strategy.glsl.js';
export * from './sheen_functions.glsl.js';
export * from './clearcoat_strategy.glsl.js';
export * from './iridescence_functions.glsl.js';
export * from './fog_functions.glsl.js';

// Coordinator: composes all strategies into a single bsdf_functions export
export * from './bsdf_functions.glsl.js';

// Backward-compat: ggx_functions was the original export name for GGX primitives.
// It was renamed to ggx_base_functions but is re-exported here for existing consumers.
export { ggx_base_functions as ggx_functions } from './ggx_base.glsl.js';
