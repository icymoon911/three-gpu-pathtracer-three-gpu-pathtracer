import { DataUtils } from 'three';

/**
 * OpenEXR exporter for WebGL render targets.
 * Exports FloatType render target data as half-float RGB(A) EXR files.
 */
export class EXRExporter {

	constructor() {

		this.compression = 'none'; // 'none' or 'zip'

	}

	/**
	 * Export render target pixels to OpenEXR format.
	 * @param {WebGLRenderer} renderer - Three.js WebGL renderer
	 * @param {WebGLRenderTarget} renderTarget - Source render target (FloatType)
	 * @param {Object} options - Export options
	 * @param {number} [options.x=0] - X offset
	 * @param {number} [options.y=0] - Y offset
	 * @param {number} [options.width] - Width to export (defaults to render target width)
	 * @param {number} [options.height] - Height to export (defaults to render target height)
	 * @param {boolean} [options.includeAlpha=false] - Include alpha channel
	 * @param {Function} [options.onProgress] - Progress callback (0-1)
	 * @returns {Promise<ArrayBuffer>} EXR file data as ArrayBuffer
	 */
	async export( renderer, renderTarget, options = {} ) {

		const {
			x = 0,
			y = 0,
			width = renderTarget.width,
			height = renderTarget.height,
			includeAlpha = false,
			onProgress = null,
		} = options;

		// Read pixel data from render target
		const pixelCount = width * height;
		const floatBuffer = new Float32Array( pixelCount * 4 );

		if ( onProgress ) onProgress( 0.0 );

		renderer.readRenderTargetPixels( renderTarget, x, y, width, height, floatBuffer );

		if ( onProgress ) onProgress( 0.3 );

		// Convert to half-float
		const halfBuffer = new Uint16Array( pixelCount * 4 );
		for ( let i = 0, l = floatBuffer.length; i < l; i ++ ) {

			halfBuffer[ i ] = DataUtils.toHalfFloat( floatBuffer[ i ] );

		}

		if ( onProgress ) onProgress( 0.5 );

		// Build EXR file
		const exrData = this._buildEXR( halfBuffer, width, height, includeAlpha );

		if ( onProgress ) onProgress( 1.0 );

		return exrData;

	}

	/**
	 * Build OpenEXR file structure.
	 * @private
	 */
	_buildEXR( halfBuffer, width, height, includeAlpha ) {

		const channels = includeAlpha
			? [ 'A', 'B', 'G', 'R' ]
			: [ 'B', 'G', 'R' ];
		const channelCount = channels.length;

		// Calculate sizes
		const headerSize = this._calculateHeaderSize( channels );
		const scanlineTableSize = height * 8; // 8 bytes per scanline offset (64-bit offsets)
		const scanlineDataSize = width * channelCount * 2; // 2 bytes per half-float
		const scanlineBlockSize = scanlineDataSize + 8; // 8 bytes for y (int32) + size (int32)
		const pixelDataSize = scanlineBlockSize * height;
		const totalSize = headerSize + scanlineTableSize + pixelDataSize;

		const buffer = new ArrayBuffer( totalSize );
		const view = new DataView( buffer );
		let offset = 0;

		// Magic number and version
		view.setUint32( offset, 20000630, true ); // EXR magic number
		offset += 4;
		view.setUint32( offset, 2, true ); // Version 2, single-part scanline
		offset += 4;

		// Header attributes
		offset = this._writeAttribute( view, offset, 'channels', 'chlist', this._writeChannelList( channels ) );
		offset = this._writeAttribute( view, offset, 'compression', 'compression', new Uint8Array( [ 0 ] ) ); // NO_COMPRESSION
		offset = this._writeAttribute( view, offset, 'dataWindow', 'box2i', this._writeBox2i( 0, 0, width - 1, height - 1 ) );
		offset = this._writeAttribute( view, offset, 'displayWindow', 'box2i', this._writeBox2i( 0, 0, width - 1, height - 1 ) );
		offset = this._writeAttribute( view, offset, 'lineOrder', 'lineorder', new Uint8Array( [ 0 ] ) ); // INCREASING_Y
		offset = this._writeAttribute( view, offset, 'pixelAspectRatio', 'float', this._writeFloat( 1.0 ) );
		offset = this._writeAttribute( view, offset, 'screenWindowCenter', 'v2f', this._writeV2f( 0.0, 0.0 ) );
		offset = this._writeAttribute( view, offset, 'screenWindowWidth', 'float', this._writeFloat( 1.0 ) );

		// End of header
		view.setUint8( offset, 0 );
		offset += 1;

		// Scanline offset table (64-bit offsets stored as pairs of uint32 little-endian)
		let currentScanlineOffset = headerSize + scanlineTableSize;
		for ( let i = 0; i < height; i ++ ) {

			// Write 64-bit offset as two 32-bit values (low, high)
			view.setUint32( offset, currentScanlineOffset, true );
			view.setUint32( offset + 4, 0, true );
			offset += 8;
			currentScanlineOffset += scanlineBlockSize;

		}

		// Write scanline data
		for ( let y = 0; y < height; y ++ ) {

			// Scanline header: y coordinate (int32) + data size (int32)
			view.setInt32( offset, y, true );
			offset += 4;
			view.setInt32( offset, scanlineDataSize, true );
			offset += 4;

			// Write channels in alphabetical order (A, B, G, R or B, G, R)
			const rowOffset = y * width * 4;
			for ( let c = 0; c < channelCount; c ++ ) {

				const channel = channels[ c ];
				let channelIndex;
				switch ( channel ) {

				case 'R': channelIndex = 0; break;
				case 'G': channelIndex = 1; break;
				case 'B': channelIndex = 2; break;
				case 'A': channelIndex = 3; break;

				}

				for ( let x = 0; x < width; x ++ ) {

					const pixelIndex = rowOffset + x * 4 + channelIndex;
					view.setUint16( offset, halfBuffer[ pixelIndex ], true );
					offset += 2;

				}

			}

		}

		return buffer;

	}

	/**
	 * Calculate header size (excluding scanline offset table).
	 * @private
	 */
	_calculateHeaderSize( channels ) {

		let size = 8; // Magic (4) + version (4)

		// Channels attribute: name\0 + type\0 + size(4) + data
		// Channel entry: name\0 + pixelType(4) + pLinear(1) + reserved(3) + xSampling(4) + ySampling(4) = nameLen + 1 + 16
		const channelDataSize = channels.reduce( ( sum, ch ) => sum + ch.length + 1 + 16, 0 ) + 1; // +1 for null terminator
		size += ( 'channels'.length + 1 ) + ( 'chlist'.length + 1 ) + 4 + channelDataSize;

		// Compression attribute
		size += ( 'compression'.length + 1 ) + ( 'compression'.length + 1 ) + 4 + 1;

		// Data window attribute (box2i = 16 bytes)
		size += ( 'dataWindow'.length + 1 ) + ( 'box2i'.length + 1 ) + 4 + 16;

		// Display window attribute (box2i = 16 bytes)
		size += ( 'displayWindow'.length + 1 ) + ( 'box2i'.length + 1 ) + 4 + 16;

		// Line order attribute (lineorder = 1 byte)
		size += ( 'lineOrder'.length + 1 ) + ( 'lineorder'.length + 1 ) + 4 + 1;

		// Pixel aspect ratio attribute (float = 4 bytes)
		size += ( 'pixelAspectRatio'.length + 1 ) + ( 'float'.length + 1 ) + 4 + 4;

		// Screen window center attribute (v2f = 8 bytes)
		size += ( 'screenWindowCenter'.length + 1 ) + ( 'v2f'.length + 1 ) + 4 + 8;

		// Screen window width attribute (float = 4 bytes)
		size += ( 'screenWindowWidth'.length + 1 ) + ( 'float'.length + 1 ) + 4 + 4;

		// End of header (null byte)
		size += 1;

		return size;

	}

	/**
	 * Write attribute to buffer.
	 * @private
	 */
	_writeAttribute( view, offset, name, type, data ) {

		// Write name
		for ( let i = 0; i < name.length; i ++ ) {

			view.setUint8( offset ++, name.charCodeAt( i ) );

		}

		view.setUint8( offset ++, 0 ); // Null terminator

		// Write type
		for ( let i = 0; i < type.length; i ++ ) {

			view.setUint8( offset ++, type.charCodeAt( i ) );

		}

		view.setUint8( offset ++, 0 ); // Null terminator

		// Write size
		view.setInt32( offset, data.length, true );
		offset += 4;

		// Write data
		for ( let i = 0; i < data.length; i ++ ) {

			view.setUint8( offset ++, data[ i ] );

		}

		return offset;

	}

	/**
	 * Write channel list.
	 * @private
	 */
	_writeChannelList( channels ) {

		const parts = [];

		for ( const channel of channels ) {

			// Channel name
			const nameBytes = new TextEncoder().encode( channel + '\0' );
			parts.push( nameBytes );

			// Pixel type (1 = HALF), linear, reserved (3 bytes), xSampling, ySampling
			const channelInfo = new Uint8Array( 16 );
			const infoView = new DataView( channelInfo.buffer );
			infoView.setInt32( 0, 1, true ); // HALF type
			infoView.setUint8( 4, 0 ); // linear
			infoView.setUint8( 5, 0 ); // reserved
			infoView.setUint8( 6, 0 ); // reserved
			infoView.setUint8( 7, 0 ); // reserved
			infoView.setInt32( 8, 1, true ); // xSampling
			infoView.setInt32( 12, 1, true ); // ySampling
			parts.push( channelInfo );

		}

		// Null terminator
		parts.push( new Uint8Array( [ 0 ] ) );

		// Concatenate
		const totalLength = parts.reduce( ( sum, p ) => sum + p.length, 0 );
		const result = new Uint8Array( totalLength );
		let offset = 0;
		for ( const part of parts ) {

			result.set( part, offset );
			offset += part.length;

		}

		return result;

	}

	/**
	 * Write box2i (4 int32 values).
	 * @private
	 */
	_writeBox2i( xMin, yMin, xMax, yMax ) {

		const buffer = new ArrayBuffer( 16 );
		const view = new DataView( buffer );
		view.setInt32( 0, xMin, true );
		view.setInt32( 4, yMin, true );
		view.setInt32( 8, xMax, true );
		view.setInt32( 12, yMax, true );
		return new Uint8Array( buffer );

	}

	/**
	 * Write float value.
	 * @private
	 */
	_writeFloat( value ) {

		const buffer = new ArrayBuffer( 4 );
		const view = new DataView( buffer );
		view.setFloat32( 0, value, true );
		return new Uint8Array( buffer );

	}

	/**
	 * Write v2f (2 float values).
	 * @private
	 */
	_writeV2f( x, y ) {

		const buffer = new ArrayBuffer( 8 );
		const view = new DataView( buffer );
		view.setFloat32( 0, x, true );
		view.setFloat32( 4, y, true );
		return new Uint8Array( buffer );

	}

	/**
	 * Create a downloadable blob from EXR data.
	 * @param {ArrayBuffer} exrData - EXR file data
	 * @returns {Blob} EXR file as Blob
	 */
	toBlob( exrData ) {

		return new Blob( [ exrData ], { type: 'image/x-exr' } );

	}

	/**
	 * Trigger download of EXR file.
	 * @param {ArrayBuffer} exrData - EXR file data
	 * @param {string} filename - Filename for download
	 */
	download( exrData, filename = 'render.exr' ) {

		const blob = this.toBlob( exrData );
		const url = URL.createObjectURL( blob );
		const link = document.createElement( 'a' );
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL( url );

	}

}
