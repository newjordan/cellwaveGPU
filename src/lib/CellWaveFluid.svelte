<script lang="ts" module>
	// GPU_STAGE: polish-done

	export const VERT_SOURCE = `
			attribute vec2 position;
			varying vec2 vUv;
			void main() {
				vUv = position * 0.5 + 0.5;
				gl_Position = vec4(position, 0.0, 1.0);
			}
		`;

	export const INIT_FRAG_SOURCE = `
			precision highp float;
			varying vec2 vUv;
			float hash(vec2 p) {
				return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
			}
			void main() {
				float vx = (hash(vUv * 47.3) - 0.5) * 4.0;
				float vy = (hash(vUv * 71.9 + vec2(11.4, 5.2)) - 0.5) * 4.0;
				gl_FragColor = vec4(vx, vy, 0.0, 1.0);
			}
		`;

	export const UPDATE_FRAG_SOURCE = `
			precision highp float;
			varying vec2 vUv;
			uniform sampler2D uVel;
			uniform float uGridSize;
			uniform float uAdvection;
			uniform float uDiffusion;
			uniform vec4 uLayerA[8]; // (enabled, isWave, scale, strength)
			uniform vec4 uLayerB[8]; // (phase, dirX, dirY, twoPiOverLambda)

			uniform float uOccluderCount;
			uniform vec4 uOccluders[8]; // (x0, y0, x1, y1)

			uniform float uCurrentCount;
			uniform vec4 uCurrentsA[8]; // (startX, startY, endX, endY)
			uniform vec4 uCurrentsB[8]; // (width, strength, speed, taper)

			uniform float uEmitterCount;
			uniform vec4 uEmittersA[8]; // (x, y, angle_rad, length)
			uniform vec4 uEmittersB[8]; // (spread, strength, speed, taper)

			vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
			vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
			vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
			vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

			float snoise(vec3 v) {
				const vec2 C = vec2(1.0/6.0, 1.0/3.0);
				const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
				vec3 i  = floor(v + dot(v, C.yyy));
				vec3 x0 = v - i + dot(i, C.xxx);
				vec3 g = step(x0.yzx, x0.xyz);
				vec3 l = 1.0 - g;
				vec3 i1 = min(g.xyz, l.zxy);
				vec3 i2 = max(g.xyz, l.zxy);
				vec3 x1 = x0 - i1 + C.xxx;
				vec3 x2 = x0 - i2 + C.yyy;
				vec3 x3 = x0 - D.yyy;
				i = mod289(i);
				vec4 p = permute(permute(permute(
									i.z + vec4(0.0, i1.z, i2.z, 1.0))
								+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
								+ i.x + vec4(0.0, i1.x, i2.x, 1.0));
				float n_ = 0.142857142857;
				vec3 ns = n_ * D.wyz - D.xzx;
				vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
				vec4 x_ = floor(j * ns.z);
				vec4 y_ = floor(j - 7.0 * x_);
				vec4 xx = x_ * ns.x + ns.yyyy;
				vec4 yy = y_ * ns.x + ns.yyyy;
				vec4 h = 1.0 - abs(xx) - abs(yy);
				vec4 b0 = vec4(xx.xy, yy.xy);
				vec4 b1 = vec4(xx.zw, yy.zw);
				vec4 s0 = floor(b0) * 2.0 + 1.0;
				vec4 s1 = floor(b1) * 2.0 + 1.0;
				vec4 sh = -step(h, vec4(0.0));
				vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
				vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
				vec3 p0 = vec3(a0.xy, h.x);
				vec3 p1 = vec3(a0.zw, h.y);
				vec3 p2 = vec3(a1.xy, h.z);
				vec3 p3 = vec3(a1.zw, h.w);
				vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
				p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
				vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
				m = m * m;
				return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
			}

			void main() {
				float x = vUv.x * uGridSize;
				float y = vUv.y * uGridSize;
				vec2 texel = vec2(1.0 / uGridSize);
				vec2 currentVel = texture2D(uVel, vUv).xy;

				// Advection: semi-Lagrangian back-trace, velocity is in cell units.
				vec2 backUv = clamp(vUv - currentVel * texel, vec2(0.0), vec2(1.0));
				vec2 outV = texture2D(uVel, backUv).xy * uAdvection;

				// Diffusion: 4-neighbor (von Neumann) Laplacian, edge-aware.
				vec2 sumN = vec2(0.0);
				float count = 0.0;
				if (vUv.x + texel.x < 1.0) { sumN += texture2D(uVel, vUv + vec2(texel.x, 0.0)).xy; count += 1.0; }
				if (vUv.x - texel.x > 0.0) { sumN += texture2D(uVel, vUv - vec2(texel.x, 0.0)).xy; count += 1.0; }
				if (vUv.y + texel.y < 1.0) { sumN += texture2D(uVel, vUv + vec2(0.0, texel.y)).xy; count += 1.0; }
				if (vUv.y - texel.y > 0.0) { sumN += texture2D(uVel, vUv - vec2(0.0, texel.y)).xy; count += 1.0; }
				if (count > 0.0) outV += (sumN / count) * uDiffusion;

				for (int i = 0; i < 8; i++) {
					vec4 a = uLayerA[i];
					if (a.x >= 0.5) {
						vec4 b = uLayerB[i];
						float scale = a.z;
						float strength = a.w;
						float phase = b.x;
						if (a.y < 0.5) {
							float sx = x / scale;
							float sy = y / scale;
							outV.x += snoise(vec3(sx, sy, phase)) * strength;
							outV.y += snoise(vec3(sx + 100.0, sy + 100.0, phase)) * strength;
						} else {
							float dirX = b.y;
							float dirY = b.z;
							float k = b.w;
							float s = sin(k * (x * dirX + y * dirY) + 6.28318530718 * phase);
							outV.x += dirX * s * strength;
							outV.y += dirY * s * strength;
						}
					}
				}
				// Currents — directional force tubes between two cell points.
				for (int i = 0; i < 8; i++) {
					if (float(i) >= uCurrentCount) break;
					vec4 a = uCurrentsA[i];
					vec4 b = uCurrentsB[i];
					vec2 segD = vec2(a.z - a.x, a.w - a.y);
					float segLen = length(segD);
					if (segLen > 0.0) {
						vec2 nrm = segD / segLen;
						vec2 rel = vec2(x - a.x, y - a.y);
						float along = dot(rel, nrm);
						if (along >= 0.0 && along <= segLen) {
							float perp = abs(rel.x * nrm.y - rel.y * nrm.x);
							float lateralFall = exp(-0.5 * (perp / b.x) * (perp / b.x));
							float longFall = 1.0 - along / segLen;
							float force = b.y * b.z * lateralFall * pow(longFall, b.w);
							outV += nrm * force;
						}
					}
				}

				// Emitters — cone-shaped fans from a point along an angle.
				for (int i = 0; i < 8; i++) {
					if (float(i) >= uEmitterCount) break;
					vec4 a = uEmittersA[i]; // x, y, angle_rad, length
					vec4 b = uEmittersB[i]; // spread, strength, speed, taper
					vec2 d = vec2(x - a.x, y - a.y);
					float ex = cos(a.z);
					float ey = sin(a.z);
					float along = d.x * ex + d.y * ey;
					if (along >= 0.0 && along <= a.w) {
						float perp = abs(d.x * ey - d.y * ex);
						if (perp <= b.x) {
							float fallLong = 1.0 - along / a.w;
							float fallLat = 1.0 - perp / b.x;
							float fall = pow(fallLong * fallLat, b.w);
							outV += vec2(ex, ey) * (b.y * b.z * fall);
						}
					}
				}

				// Occluders — solid rect blocks. Override velocity to zero
				// for cells inside any occluder. Done last so all upstream
				// contributions are squashed together cleanly.
				for (int i = 0; i < 8; i++) {
					if (float(i) >= uOccluderCount) break;
					vec4 o = uOccluders[i];
					if (x >= o.x && x <= o.z && y >= o.y && y <= o.w) {
						outV = vec2(0.0);
						break;
					}
				}

				gl_FragColor = vec4(outV, 0.0, 1.0);
			}
		`;

	export const RENDER_FRAG_SOURCE = `
			precision highp float;
			varying vec2 vUv;
			uniform sampler2D uVel;
			uniform sampler2D uLut;
			uniform sampler2D uHueLut;
			uniform float uVisScale;
			uniform float uGradientCurve;
			uniform float uGradientContrast;
			uniform float uTintAmount;
			float tanh_(float x) {
				float e2 = exp(2.0 * x);
				return (e2 - 1.0) / (e2 + 1.0);
			}
			void main() {
				vec2 v = texture2D(uVel, vUv).xy;
				float speed = length(v);
				float t = tanh_(speed / uVisScale);
				if (uGradientCurve != 1.0) t = pow(t, uGradientCurve);
				if (uGradientContrast > 0.0) {
					float c = min(uGradientContrast, 0.99);
					float cEdge = 0.5 * (1.0 - c);
					t = smoothstep(cEdge, 1.0 - cEdge, t);
				}
				vec3 col = texture2D(uLut, vec2(t, 0.5)).rgb;
				if (uTintAmount > 0.0) {
					float ang = atan(v.y, v.x);
					float hIdx = ang / 6.28318530718 + 0.5;
					vec3 tintCol = texture2D(uHueLut, vec2(hIdx, 0.5)).rgb;
					float amt = uTintAmount * t;
					col = mix(col, tintCol, amt);
				}
				gl_FragColor = vec4(col, 1.0);
			}
		`;

	export type NoiseLayer = {
		scale: number;
		strength: number;
		speed: number;
		enabled: boolean;
		pattern: 'simplex' | 'wave';
		angle?: number;
	};

	export type ColorStop = { offset: number; color: string };

	export type Occluder = { x0: number; y0: number; x1: number; y1: number };

	export type Current = {
		startX: number; startY: number;
		endX: number; endY: number;
		width: number; strength: number; speed: number; taper: number;
	};

	export type Emitter = {
		x: number; y: number;
		angle: number; // degrees
		length: number; spread: number;
		strength: number; speed: number; taper: number;
	};

	function parseColor(c: string): [number, number, number] {
		if (!c) return [0, 0, 0];
		const s = c.trim();
		if (s[0] === '#') {
			if (s.length === 4) {
				return [
					parseInt(s[1] + s[1], 16),
					parseInt(s[2] + s[2], 16),
					parseInt(s[3] + s[3], 16)
				];
			}
			if (s.length === 7) {
				return [
					parseInt(s.slice(1, 3), 16),
					parseInt(s.slice(3, 5), 16),
					parseInt(s.slice(5, 7), 16)
				];
			}
		}
		const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
		if (m) return [+m[1], +m[2], +m[3]];
		return [0, 0, 0];
	}

	function hslToRgb(h: number, s: number, l: number): [number, number, number] {
		const c = (1 - Math.abs(2 * l - 1)) * s;
		const hp = h * 6;
		const x = c * (1 - Math.abs((hp % 2) - 1));
		let r = 0, g = 0, b = 0;
		if (hp < 1) { r = c; g = x; }
		else if (hp < 2) { r = x; g = c; }
		else if (hp < 3) { g = c; b = x; }
		else if (hp < 4) { g = x; b = c; }
		else if (hp < 5) { r = x; b = c; }
		else { r = c; b = x; }
		const m = l - c / 2;
		return [((r + m) * 255) | 0, ((g + m) * 255) | 0, ((b + m) * 255) | 0];
	}

	export function buildHueLUT(
		saturation: number,
		lightness: number,
		offsetDeg = 0,
		rangeDeg = 360
	): Uint8Array {
		const s = Math.max(0, Math.min(1, saturation));
		const l = Math.max(0, Math.min(1, lightness));
		const offset = ((offsetDeg % 360) + 360) % 360 / 360;
		const range = Math.max(0, Math.min(360, rangeDeg)) / 360;
		const lut = new Uint8Array(256 * 3);
		for (let i = 0; i < 256; i++) {
			let h = offset + (i / 256) * range;
			h = h - Math.floor(h);
			const [r, g, b] = hslToRgb(h, s, l);
			lut[i * 3] = r;
			lut[i * 3 + 1] = g;
			lut[i * 3 + 2] = b;
		}
		return lut;
	}

	export function buildColorLUT(stops: ColorStop[]): Uint8Array {
		const lut = new Uint8Array(256 * 3);
		const sorted = (stops.length ? [...stops] : [
			{ offset: 0, color: '#000000' },
			{ offset: 1, color: '#ffffff' }
		]).sort((a, b) => a.offset - b.offset);
		if (sorted[0].offset > 0) sorted.unshift({ offset: 0, color: sorted[0].color });
		if (sorted[sorted.length - 1].offset < 1) sorted.push({ offset: 1, color: sorted[sorted.length - 1].color });
		const rgbs = sorted.map((s) => parseColor(s.color));
		const offsets = sorted.map((s) => Math.max(0, Math.min(1, s.offset)));
		let segIdx = 0;
		for (let i = 0; i < 256; i++) {
			const t = i / 255;
			while (segIdx < offsets.length - 2 && t > offsets[segIdx + 1]) segIdx++;
			const a = offsets[segIdx];
			const b = offsets[segIdx + 1];
			const span = b - a;
			const local = span > 0 ? (t - a) / span : 0;
			const ra = rgbs[segIdx], rb = rgbs[segIdx + 1];
			const p = i * 3;
			lut[p] = (ra[0] + (rb[0] - ra[0]) * local) | 0;
			lut[p + 1] = (ra[1] + (rb[1] - ra[1]) * local) | 0;
			lut[p + 2] = (ra[2] + (rb[2] - ra[2]) * local) | 0;
		}
		return lut;
	}

	export const DEFAULT_NOISE_LAYERS: NoiseLayer[] = [
		{ scale: 20, strength: 0.6, speed: 0.6, enabled: true, pattern: 'simplex' },
		{ scale: 31, strength: 1.15, speed: 0.5, enabled: true, pattern: 'simplex' },
		{ scale: 28, strength: 0.5, speed: 0.8, enabled: true, pattern: 'wave', angle: 150 },
		{ scale: 18, strength: 0.8, speed: 0.7, enabled: true, pattern: 'wave', angle: 60 }
	];

	export const DEFAULT_COLOR_STOPS: ColorStop[] = [
		{ offset: 0, color: '#000000' },
		{ offset: 1, color: '#ffffff' }
	];
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Renderer, Program, Mesh, Geometry, RenderTarget, Texture } from 'ogl';

	type Props = {
		gridSize?: number;
		advection?: number;
		diffusion?: number;
		visScale?: number;
		noiseLayers?: NoiseLayer[];
		colorStops?: ColorStop[];
		occluders?: Occluder[];
		currents?: Current[];
		emitters?: Emitter[];
		tintAmount?: number;
		tintSaturation?: number;
		tintLightness?: number;
		tintHueOffset?: number;
		tintHueRange?: number;
		gradientCurve?: number;
		gradientContrast?: number;
		speed?: number;
		backgroundColor?: string;
		class?: string;
	};

	let {
		gridSize = 90,
		advection = 0.15,
		diffusion = 0.04,
		visScale = 2.8,
		noiseLayers = DEFAULT_NOISE_LAYERS,
		colorStops = DEFAULT_COLOR_STOPS,
		occluders = [] as Occluder[],
		currents = [] as Current[],
		emitters = [] as Emitter[],
		tintAmount = 0,
		tintSaturation = 1,
		tintLightness = 0.5,
		tintHueOffset = 0,
		tintHueRange = 360,
		gradientCurve = 2,
		gradientContrast = 0.66,
		speed = 0.45,
		backgroundColor = '#000000',
		class: className = ''
	}: Props = $props();

	let containerRef: HTMLDivElement;

	type GpuRefs = {
		renderer: Renderer;
		colorLutTex: Texture;
		hueLutTex: Texture;
		setGridSize: (n: number) => void;
	};
	let gpu: GpuRefs | null = $state(null);

	// Live grid resize on gridSize prop change.
	$effect(() => {
		if (!gpu) return;
		gpu.setGridSize(gridSize);
	});

	// Live LUT rebuild on colorStops change.
	$effect(() => {
		if (!gpu) return;
		for (const s of colorStops) { void s.offset; void s.color; }
		gpu.colorLutTex.image = buildColorLUT(colorStops);
		gpu.colorLutTex.needsUpdate = true;
	});

	// Live hue LUT rebuild on tint S/L/offset/range change.
	$effect(() => {
		if (!gpu) return;
		gpu.hueLutTex.image = buildHueLUT(tintSaturation, tintLightness, tintHueOffset, tintHueRange);
		gpu.hueLutTex.needsUpdate = true;
	});

	onMount(() => {
		const renderer = new Renderer({
			webgl: 2,
			alpha: true,
			depth: false,
			stencil: false,
			antialias: false,
			dpr: Math.min(window.devicePixelRatio || 1, 2),
			powerPreference: 'high-performance'
		});
		const gl = renderer.gl;
		gl.clearColor(0, 0, 0, 0);
		// OGL's Renderer canvas is always an HTMLCanvasElement; the union
		// in the WebGL2RenderingContext.canvas type forces this assertion.
		// eslint-disable-next-line svelte/no-dom-manipulating
		containerRef.appendChild(gl.canvas as HTMLCanvasElement);

		// WebGL2-only enum values not in the WebGL1 union OGL types its gl as.
		const GL_HALF_FLOAT = 0x140b;
		const GL_RGBA16F = 0x881a;

		// Fullscreen-triangle geometry (more efficient than a quad).
		const geometry = new Geometry(gl, {
			position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) }
		});

		// Velocity ping-pong RenderTargets at sim resolution.
		const initialGrid = Math.max(2, Math.floor(gridSize));
		const rtOpts = {
			width: initialGrid,
			height: initialGrid,
			type: GL_HALF_FLOAT,
			format: gl.RGBA,
			internalFormat: GL_RGBA16F,
			magFilter: gl.LINEAR,
			minFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			depth: false,
			stencil: false
		};
		const velA = new RenderTarget(gl, rtOpts);
		const velB = new RenderTarget(gl, rtOpts);

		// Color LUT as 256x1 RGB texture, linear-filtered for smooth gradient sampling.
		const colorLutTex = new Texture(gl, {
			image: buildColorLUT(colorStops),
			width: 256,
			height: 1,
			format: gl.RGB,
			internalFormat: gl.RGB,
			type: gl.UNSIGNED_BYTE,
			magFilter: gl.LINEAR,
			minFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			generateMipmaps: false
		});

		// Hue LUT — same shape, indexed by atan2(vy, vx) → angle/2π+0.5.
		const hueLutTex = new Texture(gl, {
			image: buildHueLUT(tintSaturation, tintLightness, tintHueOffset, tintHueRange),
			width: 256,
			height: 1,
			format: gl.RGB,
			internalFormat: gl.RGB,
			type: gl.UNSIGNED_BYTE,
			magFilter: gl.LINEAR,
			minFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			generateMipmaps: false
		});

		const VERT = VERT_SOURCE;

		// One-shot init: random velocity field at amplitude visible through
		// the default tanh(speed/visScale) tone curve. Real sim will
		// overwrite this in stage 2.
		const INIT_FRAG = INIT_FRAG_SOURCE;

		// Update: per-frame velocity write. Stage 1 = forcing-only (advection
		// + diffusion land in stage 2). Per-layer params packed into two
		// vec4 uniform arrays, sized 8 (max layers). Ashima/Stefan
		// Gustavson 3D simplex noise, public domain.
		const UPDATE_FRAG = UPDATE_FRAG_SOURCE;

		// Render: sample velocity → speed → tanh → gamma → contrast S-curve →
		// LUT → optional directional tint blend with hue LUT.
		const RENDER_FRAG = RENDER_FRAG_SOURCE;

		const initProgram = new Program(gl, { vertex: VERT, fragment: INIT_FRAG });
		const initMesh = new Mesh(gl, { geometry, program: initProgram });

		// Layer / occluder / current / emitter uniform scratch.
		// NOTE: must be plain Array, not Float32Array — OGL's array-uniform
		// binding calls Array.isArray(value) which is false for typed arrays
		// and silently skips the upload.
		const layerA: number[] = new Array(8 * 4).fill(0);
		const layerB: number[] = new Array(8 * 4).fill(0);
		const occluderBuf: number[] = new Array(8 * 4).fill(0);
		const currentABuf: number[] = new Array(8 * 4).fill(0);
		const currentBBuf: number[] = new Array(8 * 4).fill(0);
		const emitterABuf: number[] = new Array(8 * 4).fill(0);
		const emitterBBuf: number[] = new Array(8 * 4).fill(0);

		const updateProgram = new Program(gl, {
			vertex: VERT,
			fragment: UPDATE_FRAG,
			uniforms: {
				uVel: { value: velA.texture },
				uGridSize: { value: initialGrid },
				uAdvection: { value: advection },
				uDiffusion: { value: diffusion },
				uLayerA: { value: layerA },
				uLayerB: { value: layerB },
				uOccluderCount: { value: 0 },
				uOccluders: { value: occluderBuf },
				uCurrentCount: { value: 0 },
				uCurrentsA: { value: currentABuf },
				uCurrentsB: { value: currentBBuf },
				uEmitterCount: { value: 0 },
				uEmittersA: { value: emitterABuf },
				uEmittersB: { value: emitterBBuf }
			}
		});
		const updateMesh = new Mesh(gl, { geometry, program: updateProgram });

		const renderProgram = new Program(gl, {
			vertex: VERT,
			fragment: RENDER_FRAG,
			uniforms: {
				uVel: { value: velA.texture },
				uLut: { value: colorLutTex },
				uHueLut: { value: hueLutTex },
				uVisScale: { value: visScale },
				uGradientCurve: { value: gradientCurve },
				uGradientContrast: { value: gradientContrast },
				uTintAmount: { value: tintAmount }
			}
		});
		const renderMesh = new Mesh(gl, { geometry, program: renderProgram });

		// Seed velocity field with random noise.
		renderer.render({ scene: initMesh, target: velA });

		function packLayers(layers: NoiseLayer[], time: number) {
			const TAU = Math.PI * 2;
			for (let i = 0; i < 8; i++) {
				const ai = i * 4;
				if (i >= layers.length) {
					layerA[ai] = 0;
					layerA[ai + 1] = 0;
					layerA[ai + 2] = 10;
					layerA[ai + 3] = 0;
					layerB[ai] = 0;
					layerB[ai + 1] = 0;
					layerB[ai + 2] = 0;
					layerB[ai + 3] = 0;
					continue;
				}
				const layer = layers[i];
				const isWave = layer.pattern === 'wave';
				const scale = layer.scale || 10;
				layerA[ai] = layer.enabled ? 1 : 0;
				layerA[ai + 1] = isWave ? 1 : 0;
				layerA[ai + 2] = scale;
				layerA[ai + 3] = layer.strength;
				layerB[ai] = time * layer.speed;
				if (isWave) {
					const ang = ((layer.angle ?? 0) * Math.PI) / 180;
					layerB[ai + 1] = Math.cos(ang);
					layerB[ai + 2] = Math.sin(ang);
					layerB[ai + 3] = TAU / scale;
				} else {
					layerB[ai + 1] = 0;
					layerB[ai + 2] = 0;
					layerB[ai + 3] = 0;
				}
			}
		}

		function packOccluders(arr: Occluder[]) {
			const n = Math.min(arr.length, 8);
			for (let i = 0; i < 8; i++) {
				const bi = i * 4;
				if (i < n) {
					const o = arr[i];
					occluderBuf[bi] = o.x0;
					occluderBuf[bi + 1] = o.y0;
					occluderBuf[bi + 2] = o.x1;
					occluderBuf[bi + 3] = o.y1;
				} else {
					occluderBuf[bi] = 0;
					occluderBuf[bi + 1] = 0;
					occluderBuf[bi + 2] = 0;
					occluderBuf[bi + 3] = 0;
				}
			}
			return n;
		}
		function packCurrents(arr: Current[]) {
			const n = Math.min(arr.length, 8);
			for (let i = 0; i < 8; i++) {
				const bi = i * 4;
				if (i < n) {
					const c = arr[i];
					currentABuf[bi] = c.startX;
					currentABuf[bi + 1] = c.startY;
					currentABuf[bi + 2] = c.endX;
					currentABuf[bi + 3] = c.endY;
					currentBBuf[bi] = c.width || 1;
					currentBBuf[bi + 1] = c.strength;
					currentBBuf[bi + 2] = c.speed;
					currentBBuf[bi + 3] = c.taper;
				} else {
					for (let k = 0; k < 4; k++) {
						currentABuf[bi + k] = 0;
						currentBBuf[bi + k] = 0;
					}
				}
			}
			return n;
		}
		function packEmitters(arr: Emitter[]) {
			const n = Math.min(arr.length, 8);
			for (let i = 0; i < 8; i++) {
				const bi = i * 4;
				if (i < n) {
					const e = arr[i];
					emitterABuf[bi] = e.x;
					emitterABuf[bi + 1] = e.y;
					emitterABuf[bi + 2] = (e.angle * Math.PI) / 180;
					emitterABuf[bi + 3] = e.length;
					emitterBBuf[bi] = e.spread || 1;
					emitterBBuf[bi + 1] = e.strength;
					emitterBBuf[bi + 2] = e.speed;
					emitterBBuf[bi + 3] = e.taper;
				} else {
					for (let k = 0; k < 4; k++) {
						emitterABuf[bi + k] = 0;
						emitterBBuf[bi + k] = 0;
					}
				}
			}
			return n;
		}

		// Ping-pong refs (mutable so we can swap without reallocating).
		let velCurrent = velA;
		let velNext = velB;
		let noiseTime = 0;

		// Reallocate velocity FBOs when gridSize changes. Old RTs get GC'd.
		const setGridSize = (n: number) => {
			const next = Math.max(2, Math.floor(n));
			if (next === velCurrent.width) return;
			const newOpts = { ...rtOpts, width: next, height: next };
			const a = new RenderTarget(gl, newOpts);
			const b = new RenderTarget(gl, newOpts);
			renderer.render({ scene: initMesh, target: a });
			velCurrent = a;
			velNext = b;
		};

		const resize = () => {
			const { width, height } = containerRef.getBoundingClientRect();
			renderer.setSize(width, height);
		};
		const ro = new ResizeObserver(resize);
		ro.observe(containerRef);
		resize();

		let raf = 0;
		let visible = true;
		const tick = () => {
			if (visible && !document.hidden) {
				noiseTime += 0.005 * speed;
				packLayers(noiseLayers, noiseTime);
				updateProgram.uniforms.uOccluderCount.value = packOccluders(occluders);
				updateProgram.uniforms.uCurrentCount.value = packCurrents(currents);
				updateProgram.uniforms.uEmitterCount.value = packEmitters(emitters);
				updateProgram.uniforms.uVel.value = velCurrent.texture;
				updateProgram.uniforms.uGridSize.value = velCurrent.width;
				updateProgram.uniforms.uAdvection.value = advection;
				updateProgram.uniforms.uDiffusion.value = diffusion;
				renderer.render({ scene: updateMesh, target: velNext });
				const tmp = velCurrent;
				velCurrent = velNext;
				velNext = tmp;
				renderProgram.uniforms.uVel.value = velCurrent.texture;
				renderProgram.uniforms.uVisScale.value = visScale;
				renderProgram.uniforms.uGradientCurve.value = gradientCurve;
				renderProgram.uniforms.uGradientContrast.value = gradientContrast;
				renderProgram.uniforms.uTintAmount.value = tintAmount;
				renderer.render({ scene: renderMesh });
			}
			raf = requestAnimationFrame(tick);
		};

		const io = new IntersectionObserver(
			(entries) => { for (const e of entries) visible = e.isIntersecting; },
			{ rootMargin: '100px' }
		);
		io.observe(containerRef);

		raf = requestAnimationFrame(tick);
		gpu = { renderer, colorLutTex, hueLutTex, setGridSize };

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			io.disconnect();
			if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
			gpu = null;
		};
	});
</script>

<div
	bind:this={containerRef}
	class="cwf-root {className}"
	style:background-color={backgroundColor}
></div>

<style>
	.cwf-root { position: absolute; inset: 0; overflow: hidden; }
</style>
