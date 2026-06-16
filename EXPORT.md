# Export Functionality

This document describes the HDR export capabilities added to three-gpu-pathtracer.

## Overview

The library now supports exporting path-traced render results in two formats:

1. **OpenEXR (.exr)** - High Dynamic Range format preserving full floating-point precision
2. **PNG (.png)** - Tone-mapped and gamma-corrected 8-bit format for standard displays

## Features

- ✅ **HDR Export**: Export to OpenEXR with half-float precision (16-bit per channel)
- ✅ **Denoising**: Optional AI-based denoising before export using `DenoiseMaterial`
- ✅ **Alpha Channel**: Proper alpha handling for transparent backgrounds
- ✅ **Progress Tracking**: Callback-based progress reporting for long exports
- ✅ **Sample Accumulation**: Wait for minimum sample count before export
- ✅ **TypeScript Support**: Full type definitions included

## API Reference

### WebGLPathTracer.exportAsync()

Export the current render result with optional denoising and format conversion.

```javascript
const result = await pathTracer.exportAsync({
  minSamples: 100,        // Wait for at least 100 samples
  format: 'exr',          // 'exr' or 'png'
  denoise: true,          // Apply denoising
  denoiseOptions: {
    sigma: 5.0,           // Denoise strength
    threshold: 0.03,      // Edge preservation threshold
    kSigma: 1.0           // Kernel size multiplier
  },
  includeAlpha: true,     // Include alpha channel
  onProgress: (phase, progress) => {
    console.log(`${phase}: ${(progress * 100).toFixed(0)}%`);
  }
});
```

#### Parameters

- **minSamples** (number, optional): Minimum samples to accumulate before export. Defaults to current sample count.
- **format** (string, optional): Export format - `'exr'` (default) or `'png'`
- **denoise** (boolean, optional): Apply denoising before export. Default: `false`
- **denoiseOptions** (object, optional): Denoise parameters
  - **sigma** (number): Denoise strength. Default: `5.0`
  - **threshold** (number): Edge preservation threshold. Default: `0.03`
  - **kSigma** (number): Kernel size multiplier. Default: `1.0`
- **includeAlpha** (boolean, optional): Include alpha channel in export. Default: `false`
- **onProgress** (function, optional): Progress callback with signature `(phase: string, progress: number)`

#### Progress Phases

1. **waiting**: Waiting for minimum samples to accumulate
2. **denoising**: Applying denoise filter (only if `denoise: true`)
3. **exporting**: Encoding and writing output data

#### Returns

Promise resolving to:

```typescript
{
  data: ArrayBuffer | Blob,  // EXR (ArrayBuffer) or PNG (Blob)
  format: 'exr' | 'png',
  samples: number,           // Actual sample count at export time
  denoised: boolean          // Whether denoising was applied
}
```

## Usage Examples

### Basic EXR Export

```javascript
import { WebGLPathTracer } from 'three-gpu-pathtracer';

const pathTracer = new WebGLPathTracer(renderer);
// ... setup scene ...

// Export current result
const result = await pathTracer.exportAsync({ format: 'exr' });

// Download the file
const blob = new Blob([result.data], { type: 'image/x-exr' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'render.exr';
link.click();
```

### Export with Denoising

```javascript
// Wait for 200 samples, denoise, then export
const result = await pathTracer.exportAsync({
  minSamples: 200,
  format: 'exr',
  denoise: true,
  denoiseOptions: {
    sigma: 8.0,        // Stronger denoising
    threshold: 0.05,   // More aggressive edge detection
    kSigma: 1.5        // Larger kernel
  },
  onProgress: (phase, progress) => {
    updateProgressBar(phase, progress);
  }
});
```

### PNG Export for Web Display

```javascript
// Export tone-mapped PNG for immediate display
const result = await pathTracer.exportAsync({
  format: 'png',
  denoise: true
});

// Use the blob directly
const img = new Image();
img.src = URL.createObjectURL(result.data);
document.body.appendChild(img);
```

### Alpha Channel Export

```javascript
// Export with alpha for compositing
const result = await pathTracer.exportAsync({
  format: 'exr',
  includeAlpha: true
});

// Alpha channel will be preserved in the EXR file
```

### Getting Both Raw and Denoised Versions

```javascript
// Export raw (no denoising)
const rawResult = await pathTracer.exportAsync({
  format: 'exr',
  denoise: false
});

// Export denoised version
const denoisedResult = await pathTracer.exportAsync({
  format: 'exr',
  denoise: true
});

// Save both for comparison
saveEXR(rawResult.data, 'render_raw.exr');
saveEXR(denoisedResult.data, 'render_denoised.exr');
```

## EXRExporter Class

For advanced use cases, you can use the `EXRExporter` class directly:

```javascript
import { EXRExporter } from 'three-gpu-pathtracer';

const exporter = new EXRExporter();

// Export any WebGLRenderTarget with FloatType
const exrData = await exporter.export(renderer, renderTarget, {
  x: 0,              // X offset (default: 0)
  y: 0,              // Y offset (default: 0)
  width: 1920,       // Width (default: renderTarget.width)
  height: 1080,      // Height (default: renderTarget.height)
  includeAlpha: false,
  onProgress: (progress) => console.log(`${(progress * 100).toFixed(0)}%`)
});

// Helper methods
const blob = exporter.toBlob(exrData);
exporter.download(exrData, 'output.exr');
```

## Technical Details

### EXR Format

- **Compression**: None (NO_COMPRESSION)
- **Pixel Type**: Half-float (16-bit IEEE 754)
- **Channels**: RGB or RGBA (B, G, R order in file, or A, B, G, R with alpha)
- **Line Order**: Increasing Y
- **Coordinate System**: Bottom-left origin (OpenGL convention)

### PNG Export

- **Tone Mapping**: Reinhard operator (`color / (1 + color)`)
- **Gamma Correction**: sRGB (2.2 gamma)
- **Bit Depth**: 8-bit per channel
- **Coordinate Flip**: Automatically flipped from WebGL to canvas coordinates

### Alpha Mode Handling

When `PathTracingRenderer` is in alpha mode (transparent background), the export correctly reads from the blended render target (`_blendTargets[1]`) rather than the primary target, ensuring alpha values are preserved.

## Performance Considerations

- **EXR Export**: Fast, minimal CPU overhead. Primary cost is `readRenderTargetPixels()` GPU→CPU transfer.
- **PNG Export**: Slower due to tone mapping, gamma correction, and canvas operations.
- **Denoising**: Adds GPU render pass. Complexity scales with `kSigma` (kernel size).
- **High Resolution**: At 4K (3840×2160), expect:
  - EXR: ~50-100ms
  - PNG: ~200-400ms
  - Denoise: ~50-200ms depending on settings

## Limitations

- EXR compression is not implemented (files are larger but faster to write)
- PNG export applies fixed Reinhard tone mapping (no exposure control)
- Denoise is edge-aware but may blur fine details at high sigma values
- No support for multi-part EXR or deep data

## Troubleshooting

### "Invalid EXR file" when opening

Some EXR viewers may not support uncompressed EXR files. Try:
- Opening in Blender, Nuke, or other professional VFX software
- Using OpenEXR reference tools (`exrheader`, `exr2jpg`)

### Alpha channel missing

Ensure `includeAlpha: true` is set and your scene has transparent background:
```javascript
scene.background = null;
pathTracer.material.backgroundAlpha = 0;
```

### Export too slow

- Reduce resolution with `renderScale`
- Disable denoising if not needed
- Use EXR instead of PNG for faster export

## TypeScript

Full type definitions are included:

```typescript
import { ExportOptions, ExportResult, EXRExporter } from 'three-gpu-pathtracer';

const options: ExportOptions = {
  minSamples: 100,
  format: 'exr',
  denoise: true
};

const result: ExportResult = await pathTracer.exportAsync(options);
```
