import { Color, MeshStandardMaterial } from 'three';

export class VolumetricCloudMaterial extends MeshStandardMaterial {

	constructor( params ) {

		super( params );

		this.isFogVolumeMaterial = true;
		this.isVolumetricCloudMaterial = true;

		this.density = 0.02;
		this.emissive = new Color();
		this.emissiveIntensity = 0.0;
		this.opacity = 0.2;
		this.transparent = true;
		this.roughness = 1.0;
		this.metalness = 0.0;

		// cloud-specific parameters
		// cloud color is derived from the base 'color' property
		this.noiseScale = 1.0;
		this.noiseOctaves = 4;
		this.coverage = 0.5;
		this.windSpeed = 0.1;
		this.windDirection = 1.0; // angle in radians

		this.setValues( params );

	}

	get cloudColor() {

		return this.color;

	}

	set cloudColor( c ) {

		this.color = c;

	}

}
