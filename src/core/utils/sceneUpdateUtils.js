/**
 * Backward-compatible re-export shim.
 *
 * sceneUpdateUtils has been split into focused modules:
 *   - textureUtils.js    — texture collection and deduplication
 *   - lightUtils.js      — light and IES texture collection
 *   - compileTrigger.js  — material recompilation triggers
 *
 * This file re-exports everything so existing imports continue to work.
 * Prefer importing from the individual modules directly.
 */
export { getTextureHash, getTextures } from './textureUtils.js';
export { getLights, getIesTextures } from './lightUtils.js';
export { triggerMaterialCompile, triggerCompileAll } from './compileTrigger.js';
