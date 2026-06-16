#!/bin/bash

echo "=== Verifying implementation structure ==="
echo ""

echo "1. Checking updateScene() method exists..."
if grep -q "updateScene( options = {} )" src/core/WebGLPathTracer.js; then
    echo "   ✓ updateScene() method found"
else
    echo "   ✗ updateScene() method not found"
fi

echo ""
echo "2. Checking _detectChanges() method exists..."
if grep -q "_detectChanges()" src/core/WebGLPathTracer.js; then
    echo "   ✓ _detectChanges() method found"
else
    echo "   ✗ _detectChanges() method not found"
fi

echo ""
echo "3. Checking DOF parameter detection..."
if grep -q "camera.fStop !== prevDOF.fStop" src/core/WebGLPathTracer.js; then
    echo "   ✓ fStop detection found"
else
    echo "   ✗ fStop detection not found"
fi

if grep -q "camera.focusDistance !== prevDOF.focusDistance" src/core/WebGLPathTracer.js; then
    echo "   ✓ focusDistance detection found"
else
    echo "   ✗ focusDistance detection not found"
fi

if grep -q "camera.apertureBlades !== prevDOF.apertureBlades" src/core/WebGLPathTracer.js; then
    echo "   ✓ apertureBlades detection found"
else
    echo "   ✗ apertureBlades detection not found"
fi

if grep -q "camera.anamorphicRatio !== prevDOF.anamorphicRatio" src/core/WebGLPathTracer.js; then
    echo "   ✓ anamorphicRatio detection found"
else
    echo "   ✗ anamorphicRatio detection not found"
fi

echo ""
echo "4. Checking light shape detection..."
if grep -q "isCircular.*in light" src/core/WebGLPathTracer.js; then
    echo "   ✓ isCircular detection found"
else
    echo "   ✗ isCircular detection not found"
fi

if grep -q "radius.*in light" src/core/WebGLPathTracer.js; then
    echo "   ✓ radius detection found"
else
    echo "   ✗ radius detection not found"
fi

echo ""
echo "5. Checking ProceduralEquirectTexture version tracking..."
if grep -q "_updateVersion" src/textures/ProceduralEquirectTexture.js; then
    echo "   ✓ _updateVersion counter found"
else
    echo "   ✗ _updateVersion counter not found"
fi

if grep -q "_updateVersion ++" src/textures/ProceduralEquirectTexture.js; then
    echo "   ✓ Version increment in update() found"
else
    echo "   ✗ Version increment not found"
fi

echo ""
echo "6. Checking most expensive change logic..."
if grep -q "mostExpensiveChange = 'materials'" src/core/WebGLPathTracer.js; then
    echo "   ✓ Materials change tracking found"
else
    echo "   ✗ Materials change tracking not found"
fi

if grep -q "mostExpensiveChange = 'environment'" src/core/WebGLPathTracer.js; then
    echo "   ✓ Environment change tracking found"
else
    echo "   ✗ Environment change tracking not found"
fi

if grep -q "mostExpensiveChange = 'lights'" src/core/WebGLPathTracer.js; then
    echo "   ✓ Lights change tracking found"
else
    echo "   ✗ Lights change tracking not found"
fi

echo ""
echo "7. Checking DOF-only optimization..."
if grep -q "_cameraDOFOnlyChange" src/core/WebGLPathTracer.js; then
    echo "   ✓ DOF-only flag found"
else
    echo "   ✗ DOF-only flag not found"
fi

if grep -q "updateCamera( true )" src/core/WebGLPathTracer.js; then
    echo "   ✓ Camera-only update call found"
else
    echo "   ✗ Camera-only update call not found"
fi

echo ""
echo "8. Checking updateCamera() parameter..."
if grep -q "updateCamera( cameraOnly = false )" src/core/WebGLPathTracer.js; then
    echo "   ✓ updateCamera() parameter found"
else
    echo "   ✗ updateCamera() parameter not found"
fi

echo ""
echo "9. Checking type definitions..."
if grep -q "updateScene( options?:" src/index.d.ts; then
    echo "   ✓ updateScene() type definition found"
else
    echo "   ✗ updateScene() type definition not found"
fi

if grep -q "'none' | 'camera' | 'lights' | 'materials' | 'environment' | 'geometry' | 'all'" src/index.d.ts; then
    echo "   ✓ Union return type found"
else
    echo "   ✗ Union return type not found"
fi

if grep -q "updateCamera( cameraOnly?: boolean )" src/index.d.ts; then
    echo "   ✓ updateCamera() parameter type found"
else
    echo "   ✗ updateCamera() parameter type not found"
fi

echo ""
echo "10. Checking single reset logic..."
if grep -q "needsReset = true" src/core/WebGLPathTracer.js; then
    echo "   ✓ Single reset flag found"
else
    echo "   ✗ Single reset flag not found"
fi

if grep -q "if ( needsReset )" src/core/WebGLPathTracer.js; then
    echo "   ✓ Conditional reset found"
else
    echo "   ✗ Conditional reset not found"
fi

echo ""
echo "=== Structure verification complete ==="
