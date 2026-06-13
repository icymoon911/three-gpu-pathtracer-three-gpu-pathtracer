import { PerspectiveCamera, Vector3, Box3, Sphere } from 'three';

const _target = new Vector3();
const _box = new Box3();
const _sphere = new Sphere();

export class PhysicalCamera extends PerspectiveCamera {

	set bokehSize( size ) {

		this.fStop = this.getFocalLength() / size;

	}

	get bokehSize() {

		return this.getFocalLength() / this.fStop;

	}

	constructor( ...args ) {

		super( ...args );
		this.fStop = 1.4;
		this.apertureBlades = 0;
		this.apertureRotation = 0;
		this.focusDistance = 25;
		this.anamorphicRatio = 1;

		// auto-focus support
		this.autoFocus = false;
		this.focusTarget = new Vector3();
		this._hasFocusTarget = false;

	}

	/**
	 * Set a specific focus target point for auto-focus.
	 *
	 * @param {Vector3} target - The world-space point to focus on
	 * @returns {PhysicalCamera} this
	 */
	setFocusTarget( target ) {

		this.focusTarget.copy( target );
		this._hasFocusTarget = true;
		return this;

	}

	/**
	 * Clear the focus target, reverting to scene-center auto-focus.
	 *
	 * @returns {PhysicalCamera} this
	 */
	clearFocusTarget() {

		this._hasFocusTarget = false;
		return this;

	}

	/**
	 * Update the focus distance based on auto-focus settings.
	 *
	 * If autoFocus is enabled and a focusTarget is set, uses the distance to the focus target.
	 * If autoFocus is enabled without a focusTarget, computes the distance to the center of
	 * the scene's bounding sphere.
	 * If autoFocus is disabled, does nothing.
	 *
	 * @param {Scene|Object3D} [scene] - The scene to compute focus from (required if no focusTarget is set)
	 * @returns {PhysicalCamera} this
	 */
	updateFocus( scene ) {

		if ( ! this.autoFocus ) return this;

		if ( this._hasFocusTarget ) {

			// focus on the specific target point
			_target.copy( this.focusTarget );
			this.focusDistance = this.distanceTo( _target );

		} else if ( scene ) {

			// compute focus based on scene bounding sphere center
			_box.setFromObject( scene );
			_box.getBoundingSphere( _sphere );

			if ( _sphere.radius > 0 ) {

				_target.copy( _sphere.center );
				this.focusDistance = this.distanceTo( _target );

			}

		}

		return this;

	}

	copy( source, recursive ) {

		super.copy( source, recursive );

		this.fStop = source.fStop;
		this.apertureBlades = source.apertureBlades;
		this.apertureRotation = source.apertureRotation;
		this.focusDistance = source.focusDistance;
		this.anamorphicRatio = source.anamorphicRatio;
		this.autoFocus = source.autoFocus;
		this.focusTarget.copy( source.focusTarget );
		this._hasFocusTarget = source._hasFocusTarget;

		return this;

	}

}
