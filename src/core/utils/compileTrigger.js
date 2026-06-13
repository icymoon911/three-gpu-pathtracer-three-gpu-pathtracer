/**
 * Shader compilation trigger utilities.
 *
 * Extracted from sceneUpdateUtils.js to provide a focused module for
 * triggering material recompilation when scene content changes.
 */

/**
 * Force a material to recompile by toggling needsUpdate.
 * This triggers the 'recompilation' event on MaterialBase subclasses
 * and ensures the shader is recompiled with current defines/uniforms.
 * @param {import('three').Material} material
 */
export function triggerMaterialCompile( material ) {

	material.needsUpdate = true;

}

/**
 * Mark all materials in an array for recompilation.
 * @param {import('three').Material[]} materials
 */
export function triggerCompileAll( materials ) {

	for ( let i = 0, l = materials.length; i < l; i ++ ) {

		materials[ i ].needsUpdate = true;

	}

}
