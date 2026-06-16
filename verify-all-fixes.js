// Verification script for all 5 bug fixes
// 1. PathTracingSceneGenerator.generate() - undefined `length` variable
// 2. WebGLPathTracer.dispose() - incomplete resource cleanup
// 3. _getLightHash() - missing position/rotation
// 4. mergeGeometries() - color attribute itemSize mismatch
// 5. WebGLPathTracer.exportAsync() - tone mapping support

import { readFileSync } from 'fs';

console.log( '=== Verifying all 5 bug fixes ===\n' );

// ---------------------------------------------------------------
// Fix 1: PathTracingSceneGenerator.generate() - `length` → materials.length
// ---------------------------------------------------------------
console.log( 'Fix 1: PathTracingSceneGenerator.generate() — undefined `length` variable' );
{

	const src = readFileSync( './src/core/PathTracingSceneGenerator.js', 'utf8' );
	const badPattern = /this\._materialUuids\.length\s*!==\s*length[^.]/;
	const goodPattern = /this\._materialUuids\.length\s*!==\s*materials\.length/;

	const hasBug = badPattern.test( src );
	const hasFix = goodPattern.test( src );

	console.log( '  Old buggy reference (length without materials.):', hasBug ? '✗ STILL PRESENT' : '✓ removed' );
	console.log( '  New correct reference (materials.length):', hasFix ? '✓ present' : '✗ missing' );
	console.log( '  Result:', ! hasBug && hasFix ? '✓ PASS' : '✗ FAIL' );

}
console.log();

// ---------------------------------------------------------------
// Fix 2: WebGLPathTracer.dispose() - full resource cleanup
// ---------------------------------------------------------------
console.log( 'Fix 2: WebGLPathTracer.dispose() — complete resource cleanup' );
{

	const src = readFileSync( './src/core/WebGLPathTracer.js', 'utf8' );

	// Extract the dispose method body
	const disposeMatch = src.match( /dispose\(\)\s*\{([\s\S]*?)^\t\}/m );
	if ( ! disposeMatch ) {

		console.log( '  ✗ FAIL: Could not find dispose() method' );

	} else {

		const body = disposeMatch[ 1 ];
		const checks = [
			{ name: '_quad.dispose', test: /this\._quad\.dispose\(\)/ },
			{ name: '_pathTracer.dispose', test: /this\._pathTracer\.dispose\(\)/ },
			{ name: '_lowResPathTracer.dispose', test: /this\._lowResPathTracer\.dispose\(\)/ },
			{ name: '_generator.bvh.dispose', test: /this\._generator\.bvh.*\.dispose\(\)/ },
			{ name: '_generator.geometry.dispose', test: /this\._generator\.geometry\.dispose\(\)/ },
			{ name: '_internalBackground.dispose', test: /this\._internalBackground\.dispose\(\)/ },
			{ name: '_colorBackground.dispose', test: /this\._colorBackground\.dispose\(\)/ },
		];

		let allPassed = true;
		for ( const check of checks ) {

			const found = check.test.test( body );
			console.log( `  ${ check.name }:`, found ? '✓' : '✗' );
			if ( ! found ) allPassed = false;

		}

		console.log( '  Result:', allPassed ? '✓ PASS' : '✗ FAIL' );

	}

}
console.log();

// ---------------------------------------------------------------
// Fix 3: _getLightHash() - position + rotation
// ---------------------------------------------------------------
console.log( 'Fix 3: _getLightHash() — position and rotation in light hash' );
{

	const src = readFileSync( './src/core/WebGLPathTracer.js', 'utf8' );

	// Extract the _getLightHash method body
	const hashMatch = src.match( /_getLightHash\(\s*light\s*\)\s*\{([\s\S]*?)^\t\}/m );
	if ( ! hashMatch ) {

		console.log( '  ✗ FAIL: Could not find _getLightHash() method' );

	} else {

		const body = hashMatch[ 1 ];
		const hasPosition = /light\.position\.(x|y|z)/.test( body );
		const hasRotation = /light\.rotation\.(x|y|z)/.test( body );
		const hasIntensity = /light\.intensity/.test( body );
		const hasColor = /light\.color/.test( body );

		console.log( '  intensity:', hasIntensity ? '✓' : '✗' );
		console.log( '  color:', hasColor ? '✓' : '✗' );
		console.log( '  position (x,y,z):', hasPosition ? '✓' : '✗' );
		console.log( '  rotation (x,y,z):', hasRotation ? '✓' : '✗' );

		const allPassed = hasPosition && hasRotation && hasIntensity && hasColor;
		console.log( '  Result:', allPassed ? '✓ PASS' : '✗ FAIL' );

	}

}
console.log();

// ---------------------------------------------------------------
// Fix 4: mergeGeometries() - color attribute itemSize mismatch
// ---------------------------------------------------------------
console.log( 'Fix 4: mergeGeometries() — color attribute itemSize mismatch' );
{

	const src = readFileSync( './src/core/utils/mergeGeometries.js', 'utf8' );

	// The bug was: attr.setXYZW(index, targetAttribute.getX(index), ...)
	// - Writing to source (attr) instead of target
	// - Reading from target instead of source
	// - Wrong loop bounds

	const hasOldBug = /attr\.setXYZW\s*\(\s*index\s*,\s*targetAttribute\.getX/.test( src );
	const hasTargetWrite = /targetAttribute\.setXYZW\s*\(\s*offset\s*\+\s*i/.test( src );
	const hasSourceRead = /attr\.getX\s*\(\s*i\s*\)/.test( src );
	const hasAlphaPadding = /attr\.itemSize\s*>=\s*4\s*\?\s*attr\.getW\s*\(\s*i\s*\)\s*:\s*1\.0/.test( src );
	const hasTruncation = /targetAttribute\.setXYZ\s*\(\s*offset\s*\+\s*i/.test( src );

	console.log( '  Old bug (attr.setXYZW reading from targetAttribute):', hasOldBug ? '✗ STILL PRESENT' : '✓ removed' );
	console.log( '  Write to targetAttribute with offset+i:', hasTargetWrite ? '✓' : '✗' );
	console.log( '  Read from source attr with i:', hasSourceRead ? '✓' : '✗' );
	console.log( '  Alpha padding (itemSize 3→4, default 1.0):', hasAlphaPadding ? '✓' : '✗' );
	console.log( '  Truncation path (itemSize 4→3):', hasTruncation ? '✓' : '✗' );

	const allPassed = ! hasOldBug && hasTargetWrite && hasSourceRead && hasAlphaPadding && hasTruncation;
	console.log( '  Result:', allPassed ? '✓ PASS' : '✗ FAIL' );

}
console.log();

// ---------------------------------------------------------------
// Fix 5: exportAsync() - tone mapping support
// ---------------------------------------------------------------
console.log( 'Fix 5: WebGLPathTracer.exportAsync() — tone mapping configurable' );
{

	const src = readFileSync( './src/core/WebGLPathTracer.js', 'utf8' );
	const dts = readFileSync( './src/index.d.ts', 'utf8' );

	const hasMethod = /async\s+exportAsync\s*\(/.test( src );
	const hasToneMappingParam = /toneMapping\s*=\s*null/.test( src );
	const hasToneMappingApply = /renderer\.toneMapping\s*=\s*toneMapping/.test( src );
	const hasToneMappingRestore = /renderer\.toneMapping\s*=\s*prevToneMapping/.test( src );
	const hasBlobReturn = /canvas\.toBlob/.test( src );
	const hasTypeDecl = /exportAsync\s*\(/.test( dts );
	const hasMimeType = /mimeType/.test( src );
	const hasRenderTargetCleanup = /exportTarget\.dispose\(\)/.test( src );

	console.log( '  exportAsync method exists:', hasMethod ? '✓' : '✗' );
	console.log( '  toneMapping parameter (default null = use renderer):', hasToneMappingParam ? '✓' : '✗' );
	console.log( '  Applies tone mapping override:', hasToneMappingApply ? '✓' : '✗' );
	console.log( '  Restores original tone mapping:', hasToneMappingRestore ? '✓' : '✗' );
	console.log( '  Returns Blob via canvas.toBlob:', hasBlobReturn ? '✓' : '✗' );
	console.log( '  mimeType option:', hasMimeType ? '✓' : '✗' );
	console.log( '  Temporary render target disposed:', hasRenderTargetCleanup ? '✓' : '✗' );
	console.log( '  TypeScript declaration present:', hasTypeDecl ? '✓' : '✗' );

	const allPassed = hasMethod && hasToneMappingParam && hasToneMappingApply && hasToneMappingRestore && hasBlobReturn && hasTypeDecl && hasMimeType && hasRenderTargetCleanup;
	console.log( '  Result:', allPassed ? '✓ PASS' : '✗ FAIL' );

}
console.log();

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
console.log( '=== Build verification ===' );
console.log( 'Run `npm run build` to confirm compilation.' );
console.log( '=== All verifications complete ===' );
