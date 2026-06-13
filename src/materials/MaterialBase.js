import { ShaderMaterial } from 'three';

/**
 * MaterialBase - Enhanced base class for shader materials.
 *
 * Provides a unified define/uniform management mechanism and mixin support.
 * Subclasses can declare their required defines and uniforms via `declareDefines()`
 * and `declareUniforms()`, and register feature mixins via `registerMixin()`.
 */
export class MaterialBase extends ShaderMaterial {

	set needsUpdate( v ) {

		super.needsUpdate = true;
		this.dispatchEvent( {

			type: 'recompilation',

		} );

	}

	constructor( shader ) {

		super( shader );

		// Track registered mixins for lifecycle management
		this._registeredMixins = [];

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

	// sets the given named define value and sets "needsUpdate" to true if it's different
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
	 * Bulk-declare a set of defines. Only triggers a single needsUpdate if any value changed.
	 * @param {Object} defineMap - key/value pairs of defines to set
	 * @returns {boolean} true if any define was changed
	 */
	declareDefines( defineMap ) {

		let changed = false;
		for ( const name in defineMap ) {

			const value = defineMap[ name ];
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
	 * Bulk-declare a set of uniforms. Creates accessor properties for each new uniform.
	 * Only triggers a single needsUpdate if any new uniforms were added.
	 * @param {Object} uniformMap - key/{value} pairs of uniforms to add
	 * @returns {boolean} true if any uniform was added
	 */
	declareUniforms( uniformMap ) {

		let changed = false;
		for ( const name in uniformMap ) {

			if ( ! ( name in this.uniforms ) ) {

				this.uniforms[ name ] = { value: uniformMap[ name ] };
				changed = true;

				// Create accessor property for the new uniform
				Object.defineProperty( this, name, {

					get() {

						return this.uniforms[ name ].value;

					},

					set( v ) {

						this.uniforms[ name ].value = v;

					},

					configurable: true,

				} );

			} else {

				// Uniform already exists - update value if different
				if ( this.uniforms[ name ].value !== uniformMap[ name ] ) {

					this.uniforms[ name ].value = uniformMap[ name ];
					changed = true;

				}

			}

		}

		return changed;

	}

	/**
	 * Register a mixin that contributes defines, uniforms, and/or GLSL code.
	 * A mixin must be an object with optional methods:
	 *   - getDefines() -> Object
	 *   - getUniforms() -> Object
	 *   - getGLSL() -> string (GLSL code to inject)
	 *   - onBeforeRender( material ) -> void
	 *   - onRegister( material ) -> void
	 * @param {Object} mixin
	 */
	registerMixin( mixin ) {

		if ( this._registeredMixins.includes( mixin ) ) {

			return;

		}

		this._registeredMixins.push( mixin );

		if ( mixin.getDefines ) {

			this.declareDefines( mixin.getDefines() );

		}

		if ( mixin.getUniforms ) {

			this.declareUniforms( mixin.getUniforms() );

		}

		if ( mixin.onRegister ) {

			mixin.onRegister( this );

		}

	}

	/**
	 * Unregister a previously registered mixin.
	 * @param {Object} mixin
	 */
	unregisterMixin( mixin ) {

		const idx = this._registeredMixins.indexOf( mixin );
		if ( idx !== - 1 ) {

			this._registeredMixins.splice( idx, 1 );
			if ( mixin.onUnregister ) {

				mixin.onUnregister( this );

			}

		}

	}

	/**
	 * Collect GLSL code contributions from all registered mixins.
	 * @returns {string} concatenated GLSL code
	 */
	getMixinGLSL() {

		let glsl = '';
		for ( const mixin of this._registeredMixins ) {

			if ( mixin.getGLSL ) {

				glsl += mixin.getGLSL() + '\n';

			}

		}

		return glsl;

	}

	/**
	 * Invoke onBeforeRender lifecycle on all registered mixins, then call own onBeforeRender.
	 */
	runMixinBeforeRender() {

		for ( const mixin of this._registeredMixins ) {

			if ( mixin.onBeforeRender ) {

				mixin.onBeforeRender( this );

			}

		}

	}

}
