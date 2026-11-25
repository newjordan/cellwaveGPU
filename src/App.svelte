<script lang="ts">
	import { onMount } from 'svelte';
	import CellWaveFluid, {
		DEFAULT_NOISE_LAYERS,
		VERT_SOURCE,
		INIT_FRAG_SOURCE,
		UPDATE_FRAG_SOURCE,
		RENDER_FRAG_SOURCE,
		type ColorStop,
		type NoiseLayer,
		type Occluder,
		type Current,
		type Emitter
	} from './lib/CellWaveFluid.svelte';
	import { detectWebGPU } from './lib/gpuSupport';

	const cloneLayers = (): NoiseLayer[] => DEFAULT_NOISE_LAYERS.map((l) => ({ ...l }));
	const cloneStops = (s: ColorStop[]): ColorStop[] => s.map((x) => ({ ...x }));

	const DEFAULT_STOPS: ColorStop[] = [
		{ offset: 0, color: '#000000' },
		{ offset: 0.5, color: '#808080' },
		{ offset: 1, color: '#ffffff' }
	];

	type Preset = { name: string; stops: ColorStop[] };
	const PRESETS: Preset[] = [
		{
			name: 'Mono',
			stops: [
				{ offset: 0, color: '#000000' },
				{ offset: 0.5, color: '#808080' },
				{ offset: 1, color: '#ffffff' }
			]
		},
		{
			name: 'Quasar',
			stops: [
				{ offset: 0, color: '#000000' },
				{ offset: 0.18, color: '#ffeb3b' },
				{ offset: 0.34, color: '#ff1744' },
				{ offset: 0.52, color: '#ec00d2' },
				{ offset: 0.7, color: '#00e5ff' },
				{ offset: 0.85, color: '#76ff03' },
				{ offset: 1, color: '#2962ff' }
			]
		},
		{
			name: 'Lovable',
			stops: [
				{ offset: 0, color: '#0a0e2c' },
				{ offset: 0.45, color: '#ff3b6f' },
				{ offset: 0.78, color: '#ff7eb6' },
				{ offset: 1, color: '#1e3a8a' }
			]
		},
		{
			name: 'Bloom',
			stops: [
				{ offset: 0, color: '#1a0a1f' },
				{ offset: 0.45, color: '#ffd1e8' },
				{ offset: 1, color: '#a78bfa' }
			]
		},
		{
			name: 'Sunset',
			stops: [
				{ offset: 0, color: '#220011' },
				{ offset: 0.4, color: '#ff5500' },
				{ offset: 0.75, color: '#ff80a0' },
				{ offset: 1, color: '#ff00aa' }
			]
		},
		{
			name: 'Chrome',
			stops: [
				{ offset: 0, color: '#0a0820' },
				{ offset: 0.35, color: '#0066ff' },
				{ offset: 0.65, color: '#00e5ff' },
				{ offset: 0.85, color: '#ffe1c4' },
				{ offset: 1, color: '#ff8800' }
			]
		},
		{
			name: 'Spectrum',
			stops: [
				{ offset: 0, color: '#000000' },
				{ offset: 0.16, color: '#aa00ff' },
				{ offset: 0.32, color: '#0088ff' },
				{ offset: 0.48, color: '#00ffaa' },
				{ offset: 0.64, color: '#ffff00' },
				{ offset: 0.82, color: '#ff8800' },
				{ offset: 1, color: '#ff0044' }
			]
		},
		{
			name: 'Aurora',
			stops: [
				{ offset: 0, color: '#0a0e2c' },
				{ offset: 0.32, color: '#3b0d5e' },
				{ offset: 0.6, color: '#e91e63' },
				{ offset: 0.85, color: '#ff5722' },
				{ offset: 1, color: '#ffeb3b' }
			]
		},
		{
			name: 'Cyber',
			stops: [
				{ offset: 0, color: '#000022' },
				{ offset: 0.28, color: '#00ffaa' },
				{ offset: 0.5, color: '#00aaff' },
				{ offset: 0.75, color: '#ff00ff' },
				{ offset: 1, color: '#ffff00' }
			]
		},
		{
			name: 'Surge',
			stops: [
				{ offset: 0, color: '#1a0033' },
				{ offset: 0.32, color: '#ff5500' },
				{ offset: 0.55, color: '#ff0099' },
				{ offset: 0.8, color: '#3300ff' },
				{ offset: 1, color: '#ffaa00' }
			]
		},
		{
			name: 'Prism',
			stops: [
				{ offset: 0, color: '#000000' },
				{ offset: 0.2, color: '#ff0080' },
				{ offset: 0.4, color: '#ffaa00' },
				{ offset: 0.6, color: '#00e5ff' },
				{ offset: 0.8, color: '#aa66ff' },
				{ offset: 1, color: '#ffffff' }
			]
		}
	];

	function sameStops(a: ColorStop[], b: ColorStop[]): boolean {
		if (a.length !== b.length) return false;
		const as = [...a].sort((x, y) => x.offset - y.offset);
		const bs = [...b].sort((x, y) => x.offset - y.offset);
		return as.every(
			(stop, i) => stop.offset === bs[i].offset && stop.color.toLowerCase() === bs[i].color.toLowerCase()
		);
	}

	function applyPreset(p: Preset) {
		colorStops = p.stops.map((s) => ({ ...s }));
		selectedStop = 0;
	}
	function presetCss(stops: ColorStop[]): string {
		return (
			'linear-gradient(to right, ' +
			stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(2)}%`).join(', ') +
			')'
		);
	}

	const D = {
		gridSize: 90,
		advection: 0.15,
		diffusion: 0.04,
		visScale: 2.8,
		speed: 0.45,
		backgroundColor: '#000000',
		tintAmount: 0,
		tintSaturation: 1,
		tintLightness: 0.5,
		tintHueOffset: 0,
		tintHueRange: 360,
		gradientCurve: 2,
		gradientContrast: 0.66,
		colorStops: cloneStops(DEFAULT_STOPS),
		noiseLayers: cloneLayers(),
		occluders: [] as Occluder[],
		currents: [] as Current[],
		emitters: [] as Emitter[]
	};

	type WithId<T> = T & { id: string };
	type CurrentControl = WithId<Current>;
	type EmitterControl = WithId<Emitter>;
	type OccluderControl = WithId<Occluder>;
	type TabId = 'controls' | 'code';

	let gridSize = $state(D.gridSize);
	let advection = $state(D.advection);
	let diffusion = $state(D.diffusion);
	let visScale = $state(D.visScale);
	let speed = $state(D.speed);
	let backgroundColor = $state(D.backgroundColor);
	let tintAmount = $state(D.tintAmount);
	let tintSaturation = $state(D.tintSaturation);
	let tintLightness = $state(D.tintLightness);
	let tintHueOffset = $state(D.tintHueOffset);
	let tintHueRange = $state(D.tintHueRange);
	let gradientCurve = $state(D.gradientCurve);
	let gradientContrast = $state(D.gradientContrast);
	let colorStops = $state<ColorStop[]>(cloneStops(DEFAULT_STOPS));
	let noiseLayers = $state<NoiseLayer[]>(cloneLayers());
	let occluders = $state<OccluderControl[]>([]);
	let currents = $state<CurrentControl[]>([]);
	let emitters = $state<EmitterControl[]>([]);
	let activeTab = $state<TabId>('controls');
	let selectedStop = $state(0);
	let paused = $state(false);
	let prefersReducedMotion = $state(false);
	let webgpuSupported = $state<boolean | null>(null);
	let gpuBlocked = $state(false);

	let forceSerial = 1;
	function nextId(prefix: string) {
		forceSerial += 1;
		return `${prefix}-${forceSerial}`;
	}
	function withoutId<T extends { id: string }>(items: T[]): Omit<T, 'id'>[] {
		return items.map(({ id: _id, ...rest }) => rest);
	}

	function reset() {
		gridSize = D.gridSize;
		advection = D.advection;
		diffusion = D.diffusion;
		visScale = D.visScale;
		speed = D.speed;
		backgroundColor = D.backgroundColor;
		tintAmount = D.tintAmount;
		tintSaturation = D.tintSaturation;
		tintLightness = D.tintLightness;
		tintHueOffset = D.tintHueOffset;
		tintHueRange = D.tintHueRange;
		gradientCurve = D.gradientCurve;
		gradientContrast = D.gradientContrast;
		colorStops = cloneStops(DEFAULT_STOPS);
		noiseLayers = cloneLayers();
		occluders = [];
		currents = [];
		emitters = [];
		selectedStop = 0;
	}

	const MAX_FORCES = 8;
	function addCurrent() {
		if (currents.length >= MAX_FORCES) return;
		const g = gridSize;
		currents.push({
			id: nextId('current'),
			startX: g * (0.2 + Math.random() * 0.2),
			startY: g * (0.4 + Math.random() * 0.2),
			endX: g * (0.6 + Math.random() * 0.2),
			endY: g * (0.4 + Math.random() * 0.2),
			width: 5 + Math.random() * 10,
			strength: 0.5 + Math.random() * 0.5,
			speed: 0.5 + Math.random() * 0.5,
			taper: 1 + Math.random()
		});
	}
	function addEmitter() {
		if (emitters.length >= MAX_FORCES) return;
		const g = gridSize;
		emitters.push({
			id: nextId('emitter'),
			x: g * (0.3 + Math.random() * 0.4),
			y: g * (0.3 + Math.random() * 0.4),
			angle: Math.random() * 360,
			length: 10 + Math.random() * 15,
			spread: 5 + Math.random() * 8,
			strength: 0.7 + Math.random() * 0.6,
			speed: 0.4 + Math.random() * 0.4,
			taper: 1 + Math.random()
		});
	}
	function addOccluder() {
		if (occluders.length >= MAX_FORCES) return;
		const g = gridSize;
		const x0 = Math.floor(Math.random() * (g - 20));
		const y0 = Math.floor(Math.random() * (g - 20));
		occluders.push({
			id: nextId('occluder'),
			x0,
			y0,
			x1: x0 + 5 + Math.floor(Math.random() * 12),
			y1: y0 + 5 + Math.floor(Math.random() * 12)
		});
	}
	function removeCurrent(id: string) {
		currents = currents.filter((item) => item.id !== id);
	}
	function removeEmitter(id: string) {
		emitters = emitters.filter((item) => item.id !== id);
	}
	function removeOccluder(id: string) {
		occluders = occluders.filter((item) => item.id !== id);
	}
	function setCurrent<K extends keyof Current>(i: number, key: K, v: Current[K]) {
		currents[i][key] = v;
	}
	function setEmitter<K extends keyof Emitter>(i: number, key: K, v: Emitter[K]) {
		emitters[i][key] = v;
	}
	function setOccluder<K extends keyof Occluder>(i: number, key: K, v: Occluder[K]) {
		occluders[i][key] = v;
	}

	function setLayer<K extends keyof NoiseLayer>(i: number, key: K, value: NoiseLayer[K]) {
		noiseLayers[i][key] = value;
	}
	function setStopColor(i: number, color: string) {
		colorStops[i].color = color;
	}
	function setStopOffset(i: number, offset: number) {
		colorStops[i].offset = Math.max(0, Math.min(1, offset));
	}
	function removeStop(i: number) {
		if (colorStops.length <= 2) return;
		colorStops.splice(i, 1);
		if (selectedStop > i) selectedStop -= 1;
		else if (selectedStop >= colorStops.length) selectedStop = colorStops.length - 1;
	}

	const MAX_STOPS = 8;
	let barEl: HTMLDivElement | null = $state(null);
	let dragIdx = $state(-1);

	const sortedStops = $derived(
		[...colorStops].map((s, i) => ({ s, i })).sort((a, b) => a.s.offset - b.s.offset)
	);
	const gradientCss = $derived(
		'linear-gradient(to right, ' +
			sortedStops.map(({ s }) => `${s.color} ${(s.offset * 100).toFixed(2)}%`).join(', ') +
			')'
	);
	const activePreset = $derived(PRESETS.find((preset) => sameStops(preset.stops, colorStops))?.name ?? null);

	function offsetFromX(clientX: number): number {
		if (!barEl) return 0;
		const rect = barEl.getBoundingClientRect();
		if (rect.width <= 0) return 0;
		return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
	}

	function mixHex(aHex: string, bHex: string, t: number): string {
		const a = Number.parseInt(aHex.slice(1), 16);
		const b = Number.parseInt(bHex.slice(1), 16);
		if (Number.isNaN(a) || Number.isNaN(b)) return aHex;
		const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
		const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
		const mr = (ar + (br - ar) * t) | 0;
		const mg = (ag + (bg - ag) * t) | 0;
		const mb = (ab + (bb - ab) * t) | 0;
		return '#' + ((mr << 16) | (mg << 8) | mb).toString(16).padStart(6, '0');
	}
	function interpolateStopColor(offset: number): string {
		const sorted = [...colorStops].sort((a, b) => a.offset - b.offset);
		if (!sorted.length) return '#ffffff';
		if (offset <= sorted[0].offset) return sorted[0].color;
		const last = sorted[sorted.length - 1];
		if (offset >= last.offset) return last.color;
		for (let i = 0; i < sorted.length - 1; i++) {
			if (offset >= sorted[i].offset && offset <= sorted[i + 1].offset) {
				const span = sorted[i + 1].offset - sorted[i].offset;
				const t = span > 0 ? (offset - sorted[i].offset) / span : 0;
				return mixHex(sorted[i].color, sorted[i + 1].color, t);
			}
		}
		return last.color;
	}
	function addStopAt(offset: number) {
		if (colorStops.length >= MAX_STOPS) return;
		const clamped = Math.max(0, Math.min(1, offset));
		colorStops.push({ offset: clamped, color: interpolateStopColor(clamped) });
		selectedStop = colorStops.length - 1;
	}
	function addStopInLargestGap() {
		const sorted = [...colorStops].sort((a, b) => a.offset - b.offset);
		let best = 0.5;
		let gap = -1;
		for (let i = 0; i < sorted.length - 1; i++) {
			const size = sorted[i + 1].offset - sorted[i].offset;
			if (size > gap) {
				gap = size;
				best = (sorted[i].offset + sorted[i + 1].offset) / 2;
			}
		}
		addStopAt(best);
	}

	function onHandlePointerDown(e: PointerEvent, idx: number) {
		e.stopPropagation();
		dragIdx = idx;
		selectedStop = idx;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onHandlePointerMove(e: PointerEvent, idx: number) {
		if (dragIdx !== idx) return;
		setStopOffset(idx, offsetFromX(e.clientX));
	}
	function onHandlePointerUp(e: PointerEvent, idx: number) {
		if (dragIdx !== idx) return;
		dragIdx = -1;
		const handle = e.currentTarget as HTMLElement;
		if (handle.hasPointerCapture?.(e.pointerId)) handle.releasePointerCapture(e.pointerId);
	}
	function onHandleDoubleClick(e: MouseEvent, idx: number) {
		e.stopPropagation();
		e.preventDefault();
		removeStop(idx);
	}
	function onHandleKeydown(e: KeyboardEvent, idx: number) {
		const step = e.shiftKey ? 0.1 : 0.01;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			e.preventDefault();
			const dir = e.key === 'ArrowRight' ? 1 : -1;
			setStopOffset(idx, colorStops[idx].offset + dir * step);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setStopOffset(idx, 0);
		} else if (e.key === 'End') {
			e.preventDefault();
			setStopOffset(idx, 1);
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			removeStop(idx);
		}
	}
	function onBarPointerUp(e: PointerEvent) {
		if (e.target !== e.currentTarget) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		addStopAt(offsetFromX(e.clientX));
	}

	function num(n: number): string {
		const r = Math.round(n * 1e4) / 1e4;
		return Number.isInteger(r) ? String(r) : r.toString();
	}
	function dedent(s: string): string {
		const lines = s.replace(/^\n+|\n+$/g, '').split('\n');
		const min = lines.filter((l) => l.trim()).reduce((m, l) => Math.min(m, l.match(/^\s*/)![0].length), Infinity);
		return lines.map((l) => l.slice(min)).join('\n');
	}
	const usage = $derived.by(() => {
		const params = {
			gridSize, advection, diffusion, visScale, speed,
			gradientCurve, gradientContrast,
			tintAmount, tintSaturation, tintLightness, tintHueOffset, tintHueRange,
			backgroundColor,
			colorStops, noiseLayers,
			currents: withoutId(currents),
			emitters: withoutId(emitters),
			occluders: withoutId(occluders)
		};
		const fmtParams = JSON.stringify(params, (_k, v) => (typeof v === 'number' ? +num(v) : v), 2);
		return `// CellWave Fluid — algorithm snapshot
// Generated from cellwaveGPU · github.com/newjordan/cellwaveGPU
//
// What follows is the actual GPU pipeline running on screen right now,
// plus the parameters you've dialed in. Each frame, the update shader
// writes a new velocity field into a ping-pong RGBA16F texture
// (advection + diffusion + forcing layers + currents + emitters,
// then occluders zero out blocked cells). The render shader then
// samples speed, runs it through a tone curve and color LUT, and
// optionally blends in a directional hue tint.

// ─── Your parameters ─────────────────────────────────────────────
const params = ${fmtParams};

// ─── Vertex shader (fullscreen triangle) ─────────────────────────
const VERT = \`${dedent(VERT_SOURCE)}\`;

// ─── Init shader (seeds the velocity field with random noise) ────
const INIT_FRAG = \`${dedent(INIT_FRAG_SOURCE)}\`;

// ─── Update shader (the simulation step) ─────────────────────────
// advection: semi-Lagrangian back-trace
// diffusion: 4-neighbor (von Neumann) Laplacian
// forcing:   layered 3D simplex noise (Ashima/Stefan Gustavson) + sin waves
// currents:  directional force tubes between two points
// emitters:  cone-shaped fans from a point along an angle
// occluders: rect blocks that zero out velocity (applied last)
const UPDATE_FRAG = \`${dedent(UPDATE_FRAG_SOURCE)}\`;

// ─── Render shader (velocity → speed → tone → color → tint) ──────
const RENDER_FRAG = \`${dedent(RENDER_FRAG_SOURCE)}\`;`;
	});

	let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	const copyLabel = $derived(
		copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'
	);
	const copyStatus = $derived(
		copyState === 'copied'
			? 'Algorithm snapshot copied to the clipboard.'
			: copyState === 'failed'
				? 'Could not copy. Select the code and copy it manually.'
				: ''
	);
	async function copyUsage() {
		try {
			await navigator.clipboard.writeText(usage);
			copyState = 'copied';
		} catch {
			const area = document.querySelector('textarea.code');
			if (area instanceof HTMLTextAreaElement) {
				area.focus();
				area.select();
				copyState = document.execCommand('copy') ? 'copied' : 'failed';
			} else {
				copyState = 'failed';
			}
		}
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copyState = 'idle'), 2000);
	}

	function onTabListKeydown(e: KeyboardEvent) {
		const tabs: TabId[] = ['controls', 'code'];
		const index = Math.max(0, tabs.indexOf(activeTab));
		let next = index;
		if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		else return;
		e.preventDefault();
		activeTab = tabs[next];
		queueMicrotask(() => document.getElementById(`tab-${activeTab}`)?.focus());
	}

	function handleGpuUnavailable() {
		gpuBlocked = true;
	}

	onMount(() => {
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			prefersReducedMotion = motion.matches;
			if (motion.matches) paused = true;
		};
		syncMotion();
		motion.addEventListener('change', syncMotion);

		let cancelled = false;
		detectWebGPU().then((supported) => {
			if (!cancelled) webgpuSupported = supported;
		});

		return () => {
			cancelled = true;
			motion.removeEventListener('change', syncMotion);
			if (copyTimer) clearTimeout(copyTimer);
		};
	});
</script>

{#snippet rangeRow(
	id: string,
	label: string,
	value: number,
	min: number,
	max: number,
	step: number,
	text: string,
	commit: (next: number) => void,
	disabled: boolean = false
)}
	<div class="row">
		<label for={id}>{label}</label>
		<input
			{id}
			type="range"
			{min}
			{max}
			{step}
			{value}
			{disabled}
			aria-valuetext={text}
			oninput={(e) => commit(Number((e.currentTarget as HTMLInputElement).value))}
		/>
		<output class="value" for={id}>{text}</output>
	</div>
{/snippet}

<a class="skip" href="#playground-panels">Skip to controls</a>
<main class="app">
	<header class="head">
		<div>
			<h1 class="title">CellWave Fluid</h1>
			<p class="subtitle">GPU velocity-field simulation with live controls and a paste-ready snapshot.</p>
		</div>
		<div class="head-actions">
			<div class="tabs" role="tablist" aria-label="Playground sections" tabindex="-1" onkeydown={onTabListKeydown}>
				<button
					type="button"
					class="tab"
					id="tab-controls"
					role="tab"
					aria-selected={activeTab === 'controls'}
					aria-controls="panel-controls"
					tabindex={activeTab === 'controls' ? 0 : -1}
					onclick={() => (activeTab = 'controls')}
				>Controls</button>
				<button
					type="button"
					class="tab"
					id="tab-code"
					role="tab"
					aria-selected={activeTab === 'code'}
					aria-controls="panel-code"
					tabindex={activeTab === 'code' ? 0 : -1}
					onclick={() => (activeTab = 'code')}
				>Code</button>
			</div>
			<button type="button" class="btn" onclick={reset}>Reset</button>
		</div>
	</header>

	<section class="hero" aria-label="Simulation preview">
		<div class="canvas-wrap">
			{#if gpuBlocked}
				<div class="gpu-fallback" role="alert">
					{#if webgpuSupported === false}
						<h2>WebGPU isn't supported in this browser</h2>
						<p>
							CellWave can't start the live simulation. This browser doesn't expose WebGPU, and a
							WebGL2 canvas isn't available either. Use the latest Chrome, Edge, Firefox, or Safari
							with hardware acceleration turned on, then reload.
						</p>
					{:else}
						<h2>This browser couldn't start the GPU simulation</h2>
						<p>
							WebGL2 rendering isn't available, so the fluid preview can't run. Turn on hardware
							acceleration, or open the playground in the latest Chrome, Edge, Firefox, or Safari,
							then reload.
						</p>
					{/if}
					<p><a href="https://caniuse.com/webgpu" rel="noreferrer">Browser support for WebGPU</a></p>
				</div>
			{:else}
				<CellWaveFluid
					{gridSize}
					{advection}
					{diffusion}
					{visScale}
					{speed}
					{backgroundColor}
					{noiseLayers}
					{colorStops}
					{occluders}
					{currents}
					{emitters}
					{tintAmount}
					{tintSaturation}
					{tintLightness}
					{tintHueOffset}
					{tintHueRange}
					{gradientCurve}
					{gradientContrast}
					{paused}
					onUnavailable={handleGpuUnavailable}
				/>
				{#if webgpuSupported === false}
					<p class="gpu-banner" role="status">
						<strong>WebGPU isn't supported in this browser.</strong>
						The preview is running through WebGL2 instead.
						<a href="https://caniuse.com/webgpu" rel="noreferrer">See supported browsers</a>.
					</p>
				{/if}
				<div class="canvas-toolbar">
					{#if prefersReducedMotion && paused}
						<span class="overlay-note">Paused for reduced motion</span>
					{/if}
					<button
						type="button"
						class="overlay-btn"
						aria-pressed={paused}
						aria-label={paused ? 'Play simulation' : 'Pause simulation'}
						onclick={() => (paused = !paused)}
					>{paused ? 'Play' : 'Pause'}</button>
				</div>
			{/if}
		</div>
	</section>

	<div id="playground-panels">
		<div
			class="tab-panel"
			id="panel-controls"
			role="tabpanel"
			aria-labelledby="tab-controls"
			hidden={activeTab !== 'controls'}
		>
			<div class="grid">
				<h2 class="row-full section">Simulation</h2>
				<div class="row">
					<label for="r-speed">Speed</label>
					<input id="r-speed" type="range" min="0" max="3" step="0.05" bind:value={speed} aria-valuetext={speed.toFixed(2)} />
					<output class="value" for="r-speed">{speed.toFixed(2)}</output>
				</div>
				<div class="row">
					<label for="r-grid">Grid size</label>
					<input id="r-grid" type="range" min="20" max="200" step="1" bind:value={gridSize} aria-valuetext={String(gridSize)} />
					<output class="value" for="r-grid">{gridSize}</output>
				</div>
				<div class="row">
					<label for="r-adv">Advection</label>
					<input id="r-adv" type="range" min="0" max="1" step="0.01" bind:value={advection} aria-valuetext={advection.toFixed(2)} />
					<output class="value" for="r-adv">{advection.toFixed(2)}</output>
				</div>
				<div class="row">
					<label for="r-diff">Diffusion</label>
					<input id="r-diff" type="range" min="0" max="0.4" step="0.005" bind:value={diffusion} aria-valuetext={diffusion.toFixed(3)} />
					<output class="value" for="r-diff">{diffusion.toFixed(3)}</output>
				</div>
				<div class="row">
					<label for="r-vis">Vis scale</label>
					<input id="r-vis" type="range" min="0.1" max="5" step="0.05" bind:value={visScale} aria-valuetext={visScale.toFixed(2)} />
					<output class="value" for="r-vis">{visScale.toFixed(2)}</output>
				</div>

				<h2 class="row-full section">Presets</h2>
				<div class="presets row-full" role="group" aria-label="Color presets">
					{#each PRESETS as p (p.name)}
						<button
							type="button"
							class="preset"
							aria-pressed={activePreset === p.name}
							onclick={() => applyPreset(p)}
							style:background={presetCss(p.stops)}
						>
							<span class="preset-name">{p.name}</span>
						</button>
					{/each}
				</div>

				<h2 class="row-full section">Color and gradient</h2>
				<div class="row">
					<label for="r-bg">Background</label>
					<input id="r-bg" type="color" bind:value={backgroundColor} />
				</div>

				<div class="grad-row">
					<div class="grad-toolbar">
						<p id="grad-hint" class="hint">
							Drag a stop to move it. Focus a stop and use the arrow keys. Click the bar or Add stop to insert one.
						</p>
						<button
							type="button"
							class="btn"
							onclick={addStopInLargestGap}
							disabled={colorStops.length >= MAX_STOPS}
						>Add stop</button>
					</div>
					<div
						class="grad-bar"
						role="group"
						aria-label="Gradient stops"
						aria-describedby="grad-hint"
						bind:this={barEl}
						onpointerup={onBarPointerUp}
						style:background={gradientCss}
					>
						{#each colorStops as stop, i (i)}
							<button
								type="button"
								class="grad-handle"
								role="slider"
								data-selected={selectedStop === i}
								style:left={`${stop.offset * 100}%`}
								style:background={stop.color}
								aria-label={`Gradient stop ${i + 1}`}
								aria-orientation="horizontal"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={Math.round(stop.offset * 100)}
								aria-valuetext={`${Math.round(stop.offset * 100)} percent, ${stop.color}`}
								onpointerdown={(e) => onHandlePointerDown(e, i)}
								onpointermove={(e) => onHandlePointerMove(e, i)}
								onpointerup={(e) => onHandlePointerUp(e, i)}
								onpointercancel={(e) => onHandlePointerUp(e, i)}
								onkeydown={(e) => onHandleKeydown(e, i)}
								ondblclick={(e) => onHandleDoubleClick(e, i)}
								onfocus={() => (selectedStop = i)}
							></button>
						{/each}
					</div>
				</div>

				{#if colorStops[selectedStop]}
					<div class="row">
						<label for="stop-color">Stop {selectedStop + 1} color ({(colorStops[selectedStop].offset * 100).toFixed(0)}%)</label>
						<input
							id="stop-color"
							type="color"
							value={colorStops[selectedStop].color}
							oninput={(e) => setStopColor(selectedStop, (e.currentTarget as HTMLInputElement).value)}
						/>
						<button
							type="button"
							class="btn"
							onclick={() => removeStop(selectedStop)}
							disabled={colorStops.length <= 2}
						>Remove stop</button>
					</div>
				{/if}
				<div class="row">
					<label for="r-curve">Gradient curve</label>
					<input id="r-curve" type="range" min="0.25" max="4" step="0.05" bind:value={gradientCurve} aria-valuetext={gradientCurve.toFixed(2)} />
					<output class="value" for="r-curve">{gradientCurve.toFixed(2)}</output>
				</div>
				<div class="row">
					<label for="r-cont">Contrast</label>
					<input id="r-cont" type="range" min="0" max="0.99" step="0.01" bind:value={gradientContrast} aria-valuetext={gradientContrast.toFixed(2)} />
					<output class="value" for="r-cont">{gradientContrast.toFixed(2)}</output>
				</div>

				<h2 class="row-full section">Directional tint</h2>
				<p class="hint row-full tight">Blends a hue taken from the flow direction into the speed gradient.</p>
				<div class="row">
					<label for="r-amt">Amount</label>
					<input id="r-amt" type="range" min="0" max="1" step="0.05" bind:value={tintAmount} aria-valuetext={tintAmount.toFixed(2)} />
					<output class="value" for="r-amt">{tintAmount.toFixed(2)}</output>
				</div>
				<div class="row">
					<label for="r-sat">Saturation</label>
					<input id="r-sat" type="range" min="0" max="1" step="0.05" bind:value={tintSaturation} aria-valuetext={tintSaturation.toFixed(2)} />
					<output class="value" for="r-sat">{tintSaturation.toFixed(2)}</output>
				</div>
				<div class="row">
					<label for="r-light">Lightness</label>
					<input id="r-light" type="range" min="0.1" max="0.9" step="0.05" bind:value={tintLightness} aria-valuetext={tintLightness.toFixed(2)} />
					<output class="value" for="r-light">{tintLightness.toFixed(2)}</output>
				</div>
				<div class="row">
					<label for="r-hoff">Hue offset</label>
					<input id="r-hoff" type="range" min="0" max="360" step="5" bind:value={tintHueOffset} aria-valuetext={`${tintHueOffset} degrees`} />
					<output class="value" for="r-hoff">{tintHueOffset}°</output>
				</div>
				<div class="row">
					<label for="r-hrng">Hue range</label>
					<input id="r-hrng" type="range" min="0" max="360" step="5" bind:value={tintHueRange} aria-valuetext={`${tintHueRange} degrees`} />
					<output class="value" for="r-hrng">{tintHueRange}°</output>
				</div>

				<div class="section-row">
					<h2 class="section" id="currents-heading">Forces — currents</h2>
					<button type="button" class="btn" onclick={addCurrent} disabled={currents.length >= MAX_FORCES} aria-describedby="currents-count">Add current</button>
				</div>
				<p class="hint row-full tight" id="currents-count">{currents.length} of {MAX_FORCES} active. A current is a directional force between two points.</p>
				{#each currents as cur, i (cur.id)}
					<fieldset class="force-card" aria-labelledby={`current-title-${cur.id}`}>
						<div class="force-head">
							<h3 id={`current-title-${cur.id}`}>Current {i + 1}</h3>
							<button type="button" class="btn" aria-label={`Remove current ${i + 1}`} onclick={() => removeCurrent(cur.id)}>Remove</button>
						</div>
						{@render rangeRow(`cur-${cur.id}-sx`, 'Start X', cur.startX, 0, gridSize, 0.5, cur.startX.toFixed(1), (v) => setCurrent(i, 'startX', v))}
						{@render rangeRow(`cur-${cur.id}-sy`, 'Start Y', cur.startY, 0, gridSize, 0.5, cur.startY.toFixed(1), (v) => setCurrent(i, 'startY', v))}
						{@render rangeRow(`cur-${cur.id}-ex`, 'End X', cur.endX, 0, gridSize, 0.5, cur.endX.toFixed(1), (v) => setCurrent(i, 'endX', v))}
						{@render rangeRow(`cur-${cur.id}-ey`, 'End Y', cur.endY, 0, gridSize, 0.5, cur.endY.toFixed(1), (v) => setCurrent(i, 'endY', v))}
						{@render rangeRow(`cur-${cur.id}-w`, 'Width', cur.width, 1, 40, 0.5, cur.width.toFixed(1), (v) => setCurrent(i, 'width', v))}
						{@render rangeRow(`cur-${cur.id}-st`, 'Strength', cur.strength, 0, 3, 0.05, cur.strength.toFixed(2), (v) => setCurrent(i, 'strength', v))}
						{@render rangeRow(`cur-${cur.id}-sp`, 'Speed', cur.speed, 0, 3, 0.05, cur.speed.toFixed(2), (v) => setCurrent(i, 'speed', v))}
						{@render rangeRow(`cur-${cur.id}-tp`, 'Taper', cur.taper, 0.5, 5, 0.1, cur.taper.toFixed(1), (v) => setCurrent(i, 'taper', v))}
					</fieldset>
				{/each}

				<div class="section-row">
					<h2 class="section" id="emitters-heading">Forces — emitters</h2>
					<button type="button" class="btn" onclick={addEmitter} disabled={emitters.length >= MAX_FORCES} aria-describedby="emitters-count">Add emitter</button>
				</div>
				<p class="hint row-full tight" id="emitters-count">{emitters.length} of {MAX_FORCES} active. An emitter is a cone-shaped fan.</p>
				{#each emitters as em, i (em.id)}
					<fieldset class="force-card" aria-labelledby={`emitter-title-${em.id}`}>
						<div class="force-head">
							<h3 id={`emitter-title-${em.id}`}>Emitter {i + 1}</h3>
							<button type="button" class="btn" aria-label={`Remove emitter ${i + 1}`} onclick={() => removeEmitter(em.id)}>Remove</button>
						</div>
						{@render rangeRow(`em-${em.id}-x`, 'X', em.x, 0, gridSize, 0.5, em.x.toFixed(1), (v) => setEmitter(i, 'x', v))}
						{@render rangeRow(`em-${em.id}-y`, 'Y', em.y, 0, gridSize, 0.5, em.y.toFixed(1), (v) => setEmitter(i, 'y', v))}
						{@render rangeRow(`em-${em.id}-a`, 'Angle', em.angle, 0, 360, 5, `${em.angle.toFixed(0)}°`, (v) => setEmitter(i, 'angle', v))}
						{@render rangeRow(`em-${em.id}-l`, 'Length', em.length, 2, gridSize, 0.5, em.length.toFixed(1), (v) => setEmitter(i, 'length', v))}
						{@render rangeRow(`em-${em.id}-s`, 'Spread', em.spread, 1, 40, 0.5, em.spread.toFixed(1), (v) => setEmitter(i, 'spread', v))}
						{@render rangeRow(`em-${em.id}-st`, 'Strength', em.strength, 0, 3, 0.05, em.strength.toFixed(2), (v) => setEmitter(i, 'strength', v))}
						{@render rangeRow(`em-${em.id}-sp`, 'Speed', em.speed, 0, 3, 0.05, em.speed.toFixed(2), (v) => setEmitter(i, 'speed', v))}
						{@render rangeRow(`em-${em.id}-tp`, 'Taper', em.taper, 0.5, 5, 0.1, em.taper.toFixed(1), (v) => setEmitter(i, 'taper', v))}
					</fieldset>
				{/each}

				<div class="section-row">
					<h2 class="section" id="occluders-heading">Forces — occluders</h2>
					<button type="button" class="btn" onclick={addOccluder} disabled={occluders.length >= MAX_FORCES} aria-describedby="occluders-count">Add occluder</button>
				</div>
				<p class="hint row-full tight" id="occluders-count">{occluders.length} of {MAX_FORCES} active. Solid blocks that zero out velocity.</p>
				{#each occluders as occ, i (occ.id)}
					<fieldset class="force-card" aria-labelledby={`occluder-title-${occ.id}`}>
						<div class="force-head">
							<h3 id={`occluder-title-${occ.id}`}>Occluder {i + 1}</h3>
							<button type="button" class="btn" aria-label={`Remove occluder ${i + 1}`} onclick={() => removeOccluder(occ.id)}>Remove</button>
						</div>
						{@render rangeRow(`oc-${occ.id}-x0`, 'X0', occ.x0, 0, gridSize, 1, String(occ.x0), (v) => setOccluder(i, 'x0', v))}
						{@render rangeRow(`oc-${occ.id}-y0`, 'Y0', occ.y0, 0, gridSize, 1, String(occ.y0), (v) => setOccluder(i, 'y0', v))}
						{@render rangeRow(`oc-${occ.id}-x1`, 'X1', occ.x1, 0, gridSize, 1, String(occ.x1), (v) => setOccluder(i, 'x1', v))}
						{@render rangeRow(`oc-${occ.id}-y1`, 'Y1', occ.y1, 0, gridSize, 1, String(occ.y1), (v) => setOccluder(i, 'y1', v))}
					</fieldset>
				{/each}

				<h2 class="row-full section">Forcing layers</h2>
				{#each noiseLayers as layer, i (i)}
					<fieldset class="force-card" aria-labelledby={`layer-title-${i}`}>
						<div class="force-head">
							<h3 id={`layer-title-${i}`}>Layer {i + 1}</h3>
						</div>
						<div class="row">
							<label for={`l-en-${i}`}>Enabled</label>
							<span class="switch">
								<input id={`l-en-${i}`} type="checkbox" role="switch" checked={layer.enabled} onchange={(e) => setLayer(i, 'enabled', (e.currentTarget as HTMLInputElement).checked)} />
								<span class="track"></span>
								<span class="knob"></span>
							</span>
						</div>
						<div class="row">
							<label for={`l-pat-${i}`}>Pattern</label>
							<select id={`l-pat-${i}`} value={layer.pattern} onchange={(e) => setLayer(i, 'pattern', (e.currentTarget as HTMLSelectElement).value as NoiseLayer['pattern'])}>
								<option value="simplex">Simplex</option>
								<option value="wave">Wave</option>
							</select>
						</div>
						{@render rangeRow(`l-sc-${i}`, 'Scale', layer.scale, 2, 100, 1, String(layer.scale), (v) => setLayer(i, 'scale', v))}
						{@render rangeRow(`l-st-${i}`, 'Strength', layer.strength, 0, 2, 0.05, layer.strength.toFixed(2), (v) => setLayer(i, 'strength', v))}
						{@render rangeRow(`l-sp-${i}`, 'Speed', layer.speed, 0, 3, 0.05, layer.speed.toFixed(2), (v) => setLayer(i, 'speed', v))}
						{@render rangeRow(
							`l-an-${i}`,
							'Angle',
							layer.angle ?? 0,
							0,
							360,
							5,
							`${layer.angle ?? 0}°`,
							(v) => setLayer(i, 'angle', v),
							layer.pattern !== 'wave'
						)}
					</fieldset>
				{/each}
			</div>
		</div>

		<div
			class="tab-panel"
			id="panel-code"
			role="tabpanel"
			aria-labelledby="tab-code"
			hidden={activeTab !== 'code'}
		>
			<div class="code-toolbar">
				<p class="hint">Algorithm snapshot for the controls on screen.</p>
				<button type="button" class="btn" onclick={copyUsage}>{copyLabel}</button>
			</div>
			<textarea class="code" readonly aria-label="Algorithm snapshot" value={usage}></textarea>
			<p class="sr-only" aria-live="polite">{copyStatus}</p>
		</div>
	</div>

	<footer class="foot">
		<p>GPU velocity-field fluid simulation: advection, a 4-neighbor Laplacian, and layered simplex and wave forcing.</p>
		<p><a href="https://github.com/newjordan/cellwaveGPU" rel="noreferrer">View source on GitHub</a></p>
	</footer>
</main>
