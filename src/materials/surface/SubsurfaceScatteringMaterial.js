import { Color, MeshPhysicalMaterial } from 'three';

/**
 * A material that supports subsurface scattering (SSS), suitable for rendering
 * translucent surfaces like skin, wax, candles, marble, leaves, etc.
 *
 * Extends MeshPhysicalMaterial with additional SSS parameters that the path
 * tracer reads via the material texture packing system.
 *
 * @example
 * const sssMat = new SubsurfaceScatteringMaterial({
 *     color: 0xffccaa,
 *     subsurfaceColor: new Color(0xff4422),
 *     sssThickness: 1.5,
 *     scatterDistance: 0.8,
 *     roughness: 0.5,
 * });
 */
export class SubsurfaceScatteringMaterial extends MeshPhysicalMaterial {

	constructor( params ) {

		super( params );

		this.isSubsurfaceScatteringMaterial = true;

		/** Color of light scattered inside the medium */
		this.subsurfaceColor = new Color( 1, 1, 1 );

		/** Optional texture to modulate subsurfaceColor per-texel */
		this.subsurfaceColorMap = null;

		/**
		 * Effective thickness of the medium at the surface point.
		 * Larger values produce stronger scattering / more translucency.
		 * Use 0 to disable SSS on this material.
		 */
		this.sssThickness = 0.0;

		/** Optional texture to modulate sssThickness per-texel */
		this.sssThicknessMap = null;

		/**
		 * Distance over which the scattered light is attenuated.
		 * Smaller values produce denser, more opaque scattering.
		 * Works together with subsurfaceColor to determine extinction.
		 */
		this.scatterDistance = 1.0;

		this.setValues( params );

	}

	copy( source ) {

		super.copy( source );

		this.subsurfaceColor.copy( source.subsurfaceColor );
		this.subsurfaceColorMap = source.subsurfaceColorMap;
		this.sssThickness = source.sssThickness;
		this.sssThicknessMap = source.sssThicknessMap;
		this.scatterDistance = source.scatterDistance;

		return this;

	}

}
