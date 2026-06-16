/**
 * EXRExporter - Exports WebGLRenderTarget float data to OpenEXR format.
 *
 * Supports FLOAT (32-bit per channel) and HALF (16-bit per channel) pixel types.
 * Output is uncompressed scanline-based EXR.
 */

// EXR constants
const EXR_MAGIC = 20000630;
const EXR_VERSION = 2;
const EXR_FLOAT = 1;
const EXR_HALF = 2;
const COMPRESSION_NONE = 0;
const LINE_ORDER_INCREASING = 0;

function writeString( view, offset, str ) {

	for ( let i = 0; i < str.length; i ++ ) {

		view.setUint8( offset ++, str.charCodeAt( i ) );

	}

	view.setUint8( offset ++, 0 ); // null terminator
	return offset;

}

function writeAttribute( dataView, offset, name, type, valueWriter ) {

	// attribute name (null-terminated)
	offset = writeString( dataView, offset, name );

	// attribute type (null-terminated)
	offset = writeString( dataView, offset, type );

	// placeholder for size (will be filled later)
	const sizeOffset = offset;
	offset += 4;

	// value
	const valueStart = offset;
	offset = valueWriter( dataView, offset );

	// write size
	const size = offset - valueStart;
	dataView.setUint32( sizeOffset, size, true );

	return offset;

}

function floatToHalf( float ) {

	// IEEE 754 float32 to float16 conversion
	const floatView = new Float32Array( 1 );
	const intView = new Uint32Array( floatView.buffer );
	floatView[ 0 ] = float;
	const f = intView[ 0 ];

	const sign = ( f >> 16 ) & 0x8000;
	const exponent = ( ( f >> 23 ) & 0xff ) - 127 + 15;
	const mantissa = f & 0x7fffff;

	if ( exponent <= 0 ) {

		if ( exponent < - 10 ) return sign;
		const m = ( mantissa | 0x800000 ) >> ( 1 - exponent );
		return sign | ( m >> 13 );

	} else if ( exponent >= 31 ) {

		return sign | 0x7c00 | ( mantissa ? 0x200 : 0 );

	}

	return sign | ( exponent << 10 ) | ( mantissa >> 13 );

}

export class EXRExporter {

	constructor() {

		this.type = 'half'; // 'float' or 'half'

	}

	/**
	 * Export a render target's pixel data to EXR format.
	 *
	 * @param {WebGLRenderer} renderer - The WebGL renderer
	 * @param {WebGLRenderTarget} renderTarget - The render target to export from
	 * @param {Object} [options] - Export options
	 * @param {string} [options.type='half'] - Pixel type: 'float' (32-bit) or 'half' (16-bit)
	 * @param {number} [options.channels=4] - Number of channels (3 for RGB, 4 for RGBA)
	 * @param {Function} [options.onProgress] - Progress callback (progress: number 0-1, stage: string)
	 * @returns {ArrayBuffer} - The EXR file as an ArrayBuffer
	 */
	export( renderer, renderTarget, options = {} ) {

		const type = options.type || this.type;
		const numChannels = options.channels || 4;
		const onProgress = options.onProgress || null;
		const width = renderTarget.width;
		const height = renderTarget.height;
		const useHalf = type === 'half';

		if ( onProgress ) onProgress( 0.0, 'readback' );

		// read pixels from the render target
		const pixelBuffer = new Float32Array( width * height * 4 );
		renderer.readRenderTargetPixels( renderTarget, 0, 0, width, height, pixelBuffer );

		if ( onProgress ) onProgress( 0.1, 'encoding' );

		const result = this.encodeEXR( pixelBuffer, width, height, numChannels, useHalf, ( p, stage ) => {

			if ( onProgress ) onProgress( 0.1 + p * 0.9, stage || 'encoding' );

		} );

		if ( onProgress ) onProgress( 1.0, 'complete' );

		return result;

	}

	/**
	 * Encode float pixel data directly to EXR format.
	 *
	 * @param {Float32Array} pixels - Float pixel data (RGBA, 4 floats per pixel)
	 * @param {number} width - Image width
	 * @param {number} height - Image height
	 * @param {number} [numChannels=4] - Number of channels (3 or 4)
	 * @param {boolean} [useHalf=false] - Use half-precision floats
	 * @param {Function} [onProgress] - Progress callback (progress: number 0-1, stage: string)
	 * @returns {ArrayBuffer} - The EXR file as an ArrayBuffer
	 */
	encodeEXR( pixels, width, height, numChannels = 4, useHalf = false, onProgress = null ) {

		const bytesPerChannel = useHalf ? 2 : 4;
		const channelType = useHalf ? EXR_HALF : EXR_FLOAT;
		const channelNames = numChannels === 3 ? [ 'B', 'G', 'R' ] : [ 'A', 'B', 'G', 'R' ];
		const sourceChannelMap = numChannels === 3 ? [ 2, 1, 0 ] : [ 3, 2, 1, 0 ]; // EXR stores channels alphabetically

		if ( onProgress ) onProgress( 0.0, 'header' );

		// Helper: exact byte size of a writeAttribute call
		// writeAttribute writes: name (null-term) + type (null-term) + 4-byte size + value
		const attrSize = ( name, type, valueSize ) =>
			( name.length + 1 ) + ( type.length + 1 ) + 4 + valueSize;

		// Channel list value: per channel (name null-term + pixelType(4) + pLinear(1) + reserved(3) + xSampling(4) + ySampling(4)) + end null byte
		const channelListValueSize = channelNames.length * ( 2 + 4 + 1 + 3 + 4 + 4 ) + 1;

		// Exact header size
		const headerSize = 4 + 4 + // magic + version
			attrSize( 'channels', 'chlist', channelListValueSize ) +
			attrSize( 'compression', 'compression', 1 ) +
			attrSize( 'dataWindow', 'box2i', 16 ) +
			attrSize( 'displayWindow', 'box2i', 16 ) +
			attrSize( 'lineOrder', 'lineOrder', 1 ) +
			attrSize( 'pixelAspectRatio', 'float', 4 ) +
			attrSize( 'screenWindowCenter', 'v2f', 8 ) +
			attrSize( 'screenWindowWidth', 'float', 4 ) +
			1; // header terminator

		// Scanline offset table: 8 bytes per scanline
		const offsetTableSize = height * 8;

		// Scanline data: each scanline has y (4 bytes) + pixelDataSize (4 bytes) + pixel data
		const scanlineDataSize = width * numChannels * bytesPerChannel;
		const totalScanlineSize = height * ( 4 + 4 + scanlineDataSize );

		// Allocate the output buffer
		const totalSize = headerSize + offsetTableSize + totalScanlineSize;
		const buffer = new ArrayBuffer( totalSize );
		const dataView = new DataView( buffer );

		let offset = 0;

		// Write magic number
		dataView.setUint32( offset, EXR_MAGIC, true );
		offset += 4;

		// Write version
		dataView.setUint32( offset, EXR_VERSION, true );
		offset += 4;

		// Write channels attribute
		offset = writeAttribute( dataView, offset, 'channels', 'chlist', ( dv, off ) => {

			for ( let c = 0; c < channelNames.length; c ++ ) {

				off = writeString( dv, off, channelNames[ c ] );
				dv.setInt32( off, channelType, true );
				off += 4;
				dv.setUint8( off, 0 ); // pLinear
				off ++;
				dv.setUint8( off, 0 ); // reserved[0]
				off ++;
				dv.setUint8( off, 0 ); // reserved[1]
				off ++;
				dv.setUint8( off, 0 ); // reserved[2]
				off ++;
				dv.setInt32( off, 1, true ); // xSampling
				off += 4;
				dv.setInt32( off, 1, true ); // ySampling
				off += 4;

			}

			dv.setUint8( off, 0 ); // end of channel list
			off ++;
			return off;

		} );

		// Write compression attribute
		offset = writeAttribute( dataView, offset, 'compression', 'compression', ( dv, off ) => {

			dv.setUint8( off, COMPRESSION_NONE );
			return off + 1;

		} );

		// Write dataWindow attribute
		offset = writeAttribute( dataView, offset, 'dataWindow', 'box2i', ( dv, off ) => {

			dv.setInt32( off, 0, true );
			off += 4;
			dv.setInt32( off, 0, true );
			off += 4;
			dv.setInt32( off, width - 1, true );
			off += 4;
			dv.setInt32( off, height - 1, true );
			off += 4;
			return off;

		} );

		// Write displayWindow attribute
		offset = writeAttribute( dataView, offset, 'displayWindow', 'box2i', ( dv, off ) => {

			dv.setInt32( off, 0, true );
			off += 4;
			dv.setInt32( off, 0, true );
			off += 4;
			dv.setInt32( off, width - 1, true );
			off += 4;
			dv.setInt32( off, height - 1, true );
			off += 4;
			return off;

		} );

		// Write lineOrder attribute
		offset = writeAttribute( dataView, offset, 'lineOrder', 'lineOrder', ( dv, off ) => {

			dv.setUint8( off, LINE_ORDER_INCREASING );
			return off + 1;

		} );

		// Write pixelAspectRatio attribute
		offset = writeAttribute( dataView, offset, 'pixelAspectRatio', 'float', ( dv, off ) => {

			dv.setFloat32( off, 1.0, true );
			return off + 4;

		} );

		// Write screenWindowCenter attribute
		offset = writeAttribute( dataView, offset, 'screenWindowCenter', 'v2f', ( dv, off ) => {

			dv.setFloat32( off, 0.0, true );
			off += 4;
			dv.setFloat32( off, 0.0, true );
			off += 4;
			return off;

		} );

		// Write screenWindowWidth attribute
		offset = writeAttribute( dataView, offset, 'screenWindowWidth', 'float', ( dv, off ) => {

			dv.setFloat32( off, 1.0, true );
			return off + 4;

		} );

		// Write header terminator (empty attribute name)
		dataView.setUint8( offset, 0 );
		offset ++;

		if ( onProgress ) onProgress( 0.05, 'offsetTable' );

		// Write scanline offset table
		const offsetTableStart = offset;
		let scanlineOffset = offset + offsetTableSize;
		for ( let y = 0; y < height; y ++ ) {

			dataView.setUint32( offsetTableStart + y * 8, scanlineOffset & 0xFFFFFFFF, true );
			dataView.setUint32( offsetTableStart + y * 8 + 4, Math.floor( scanlineOffset / 0x100000000 ), true );
			scanlineOffset += 4 + 4 + scanlineDataSize;

		}

		offset += offsetTableSize;

		if ( onProgress ) onProgress( 0.1, 'scanlines' );

		// Write scanline data
		const progressInterval = Math.max( 1, Math.floor( height / 20 ) );
		for ( let y = 0; y < height; y ++ ) {

			// EXR stores scanlines from top to bottom (y=0 is top)
			// WebGL stores pixels from bottom to top, so we flip
			const sourceY = height - 1 - y;

			// y coordinate
			dataView.setInt32( offset, y, true );
			offset += 4;

			// pixel data size
			dataView.setInt32( offset, scanlineDataSize, true );
			offset += 4;

			// pixel data: interleaved by channel (B, G, R, [A])
			for ( let c = 0; c < numChannels; c ++ ) {

				const sourceChannel = sourceChannelMap[ c ];
				for ( let x = 0; x < width; x ++ ) {

					const srcIdx = ( sourceY * width + x ) * 4 + sourceChannel;
					const value = pixels[ srcIdx ];

					if ( useHalf ) {

						dataView.setUint16( offset, floatToHalf( value ), true );
						offset += 2;

					} else {

						dataView.setFloat32( offset, value, true );
						offset += 4;

					}

				}

			}

			// Report progress periodically during scanline encoding
			if ( onProgress && ( y % progressInterval === 0 || y === height - 1 ) ) {

				onProgress( 0.1 + 0.9 * ( ( y + 1 ) / height ), 'scanlines' );

			}

		}

		// Trim to actual size
		return buffer.slice( 0, offset );

	}

	/**
	 * Create a downloadable blob URL for the EXR data.
	 *
	 * @param {ArrayBuffer} exrData - The EXR ArrayBuffer
	 * @returns {string} - Object URL for download
	 */
	createDownloadURL( exrData ) {

		const blob = new Blob( [ exrData ], { type: 'image/x-exr' } );
		return URL.createObjectURL( blob );

	}

	/**
	 * Trigger a download of the EXR file.
	 *
	 * @param {ArrayBuffer} exrData - The EXR ArrayBuffer
	 * @param {string} [filename='render.exr'] - The filename
	 */
	download( exrData, filename = 'render.exr' ) {

		const url = this.createDownloadURL( exrData );
		const a = document.createElement( 'a' );
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL( url );

	}

}
