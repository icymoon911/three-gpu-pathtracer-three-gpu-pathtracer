import { ShaderMaterial } from 'three';

export class MaterialBase extends ShaderMaterial {

	set needsUpdate( v ) {

		super.needsUpdate = true;
		this.dispatchEvent( {

			type: 'recompilation',

		} );

	}

	constructor( shader ) {

		super( shader );

		for ( const key in this.uniforms ) {

			Object.defineProperty( this, key, {

				get() {

					return this.uniforms[ key ].value;

				},

				set( v ) {

					this.uniforms[ key ].value = v;

				}

			} );

		}

	}

	/**
	 * Sets a named define value and triggers recompilation if the value changed.
	 * Passing undefined or null removes the define.
	 * @param {string} name - The define name
	 * @param {*} value - The define value, or undefined/null to remove
	 * @returns {boolean} true if the define was changed
	 */
	setDefine( name, value = undefined ) {

		if ( value === undefined || value === null ) {

			if ( name in this.defines ) {

				delete this.defines[ name ];
				this.needsUpdate = true;
				return true;

			}

		} else {

			if ( this.defines[ name ] !== value ) {

				this.defines[ name ] = value;
				this.needsUpdate = true;
				return true;

			}

		}

		return false;

	}

	/**
	 * Removes a named define and triggers recompilation if it existed.
	 * @param {string} name - The define name to remove
	 * @returns {boolean} true if the define was removed
	 */
	removeDefine( name ) {

		if ( name in this.defines ) {

			delete this.defines[ name ];
			this.needsUpdate = true;
			return true;

		}

		return false;

	}

	/**
	 * Checks whether a named define exists.
	 * @param {string} name - The define name
	 * @returns {boolean}
	 */
	hasDefine( name ) {

		return name in this.defines;

	}

	/**
	 * Returns the value of a named define, or undefined if not set.
	 * @param {string} name - The define name
	 * @returns {*}
	 */
	getDefine( name ) {

		return this.defines[ name ];

	}

	/**
	 * Batch-apply an object of defines. Each define is set without triggering
	 * individual recompilations; a single recompilation is triggered at the end
	 * if any define changed.
	 * @param {Object} defines - Key/value pairs of defines to apply
	 * @returns {boolean} true if any define was changed
	 */
	applyDefines( defines ) {

		let changed = false;

		for ( const name in defines ) {

			const value = defines[ name ];

			if ( value === undefined || value === null ) {

				if ( name in this.defines ) {

					delete this.defines[ name ];
					changed = true;

				}

			} else {

				if ( this.defines[ name ] !== value ) {

					this.defines[ name ] = value;
					changed = true;

				}

			}

		}

		if ( changed ) {

			this.needsUpdate = true;

		}

		return changed;

	}

	/**
	 * Batch-apply an object of uniforms. Each uniform value is set without
	 * triggering recompilation. Property accessors are created for any new
	 * uniform keys that don't already have one.
	 * @param {Object} uniforms - Key/value pairs where each value is a { value: ... } uniform object
	 */
	applyUniforms( uniforms ) {

		for ( const name in uniforms ) {

			if ( ! this.uniforms[ name ] ) {

				this.uniforms[ name ] = uniforms[ name ];

				// Create property accessor for the new uniform
				if ( ! ( name in this ) ) {

					Object.defineProperty( this, name, {

						get() {

							return this.uniforms[ name ].value;

						},

						set( v ) {

							this.uniforms[ name ].value = v;

						},

						configurable: true,

					} );

				}

			} else {

				this.uniforms[ name ].value = uniforms[ name ].value;

			}

		}

	}

	/**
	 * Checks whether a named uniform exists.
	 * @param {string} name - The uniform name
	 * @returns {boolean}
	 */
	hasUniform( name ) {

		return name in this.uniforms;

	}

	/**
	 * Returns the value of a named uniform, or undefined if not set.
	 * @param {string} name - The uniform name
	 * @returns {*}
	 */
	getUniform( name ) {

		return this.uniforms[ name ] ? this.uniforms[ name ].value : undefined;

	}

}
