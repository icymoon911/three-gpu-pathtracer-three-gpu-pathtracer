/**
 * Backward-compatible shim.
 * GGX functions have been moved to ggx_base.glsl.js as part of the BSDF strategy refactor.
 * This file re-exports the same content so existing direct imports continue to work.
 */
export { ggx_base_functions as ggx_functions } from './ggx_base.glsl.js';
