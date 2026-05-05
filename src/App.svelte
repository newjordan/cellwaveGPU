<script lang="ts">
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

	const cloneLayers = (): NoiseLayer[] => DEFAULT_NOISE_LAYERS.map((l) => ({ ...l }));
	const cloneStops = (s: ColorStop[]): ColorStop[] => s.map((x) => ({ ...x }));

	const DEFAULT_STOPS: ColorStop[] = [
		{ offset: 0, color: '#000000' },
		{ offset: 0.5, color: '#808080' },
		{ offset: 1, color: '#ffffff' }
	];

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
	let occluders = $state<Occluder[]>([]);
	let currents = $state<Current[]>([]);
	let emitters = $state<Emitter[]>([]);
	let activeTab = $state<'controls' | 'code'>('controls');

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
	}

	// ---- Forces helpers ----
	const MAX_FORCES = 8;
	function addCurrent() {
		if (currents.length >= MAX_FORCES) return;
		const g = gridSize;
		currents.push({
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
			x0,
			y0,
			x1: x0 + 5 + Math.floor(Math.random() * 12),
			y1: y0 + 5 + Math.floor(Math.random() * 12)
		});
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

	// ---- Layer helpers ----
	function setLayer<K extends keyof NoiseLayer>(i: number, key: K, value: NoiseLayer[K]) {
		noiseLayers[i][key] = value;
	}
	function setStopColor(i: number, color: string) { colorStops[i].color = color; }
	function setStopOffset(i: number, offset: number) {
		colorStops[i].offset = Math.max(0, Math.min(1, offset));
	}
	function removeStop(i: number) {
		if (colorStops.length <= 2) return;
		colorStops.splice(i, 1);
		if (selectedStop >= colorStops.length) selectedStop = colorStops.length - 1;
	}

	// ---- Gradient bar editor ----
	const MAX_STOPS = 8;
	let barEl: HTMLDivElement | null = $state(null);
	let dragIdx = $state(-1);
	let dragMoved = $state(false);
	let selectedStop = $state(0);

	const sortedStops = $derived(
		[...colorStops].map((s, i) => ({ s, i })).sort((a, b) => a.s.offset - b.s.offset)
	);
	const gradientCss = $derived(
		'linear-gradient(to right, ' +
			sortedStops.map(({ s }) => `${s.color} ${(s.offset * 100).toFixed(2)}%`).join(', ') +
			')'
	);

	function offsetFromX(clientX: number): number {
		if (!barEl) return 0;
		const rect = barEl.getBoundingClientRect();
		return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
	}

	function onHandlePointerDown(e: PointerEvent, idx: number) {
		e.stopPropagation();
		dragIdx = idx;
		dragMoved = false;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onHandlePointerMove(e: PointerEvent, idx: number) {
		if (dragIdx !== idx) return;
		dragMoved = true;
		setStopOffset(idx, offsetFromX(e.clientX));
	}
	function onHandlePointerUp(e: PointerEvent, idx: number) {
		if (dragIdx !== idx) return;
		const moved = dragMoved;
		dragIdx = -1;
		dragMoved = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		if (!moved) selectedStop = idx;
	}
	function onHandleDoubleClick(e: MouseEvent, idx: number) {
		e.stopPropagation();
		removeStop(idx);
	}
	function onBarClick(e: MouseEvent) {
		if (colorStops.length >= MAX_STOPS) return;
		const offset = offsetFromX(e.clientX);
		const sorted = [...colorStops].sort((a, b) => a.offset - b.offset);
		let color = sorted[sorted.length - 1].color;
		for (let i = 0; i < sorted.length - 1; i++) {
			if (offset >= sorted[i].offset && offset <= sorted[i + 1].offset) {
				const span = sorted[i + 1].offset - sorted[i].offset;
				const t = span > 0 ? (offset - sorted[i].offset) / span : 0;
				const a = parseInt(sorted[i].color.slice(1), 16);
				const b = parseInt(sorted[i + 1].color.slice(1), 16);
				const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
				const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
				const mr = (ar + (br - ar) * t) | 0;
				const mg = (ag + (bg - ag) * t) | 0;
				const mb = (ab + (bb - ab) * t) | 0;
				color = '#' + ((mr << 16) | (mg << 8) | mb).toString(16).padStart(6, '0');
				break;
			}
			if (offset < sorted[0].offset) { color = sorted[0].color; break; }
		}
		colorStops.push({ offset, color });
		selectedStop = colorStops.length - 1;
	}

	// ---- Code-tab — algorithm view-source ----
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
			colorStops, noiseLayers, currents, emitters, occluders
		};
		const fmtParams = JSON.stringify(params, (_k, v) => typeof v === 'number' ? +num(v) : v, 2);
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

	let copied = $state(false);
	async function copyUsage() {
		await navigator.clipboard.writeText(usage);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="app">
	<div class="hero">
		<div class="canvas-wrap">
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
			/>
		</div>
	</div>

	<div class="head">
		<div>
			<div class="title">CellWave Fluid</div>
			<div class="subtitle">GPU velocity-field simulation · live controls · paste-to-reproduce</div>
		</div>
		<div class="tabs" role="tablist">
			<button class="tab" role="tab" data-active={activeTab === 'controls'} onclick={() => (activeTab = 'controls')}>Controls</button>
			<button class="tab" role="tab" data-active={activeTab === 'code'} onclick={() => (activeTab = 'code')}>Code</button>
			<button class="tab" onclick={reset} title="Reset to defaults">Reset</button>
		</div>
	</div>

	{#if activeTab === 'code'}
		<div class="code">
			<button class="copy" onclick={copyUsage}>{copied ? 'Copied' : 'Copy'}</button>{usage}</div>
	{:else}
		<div class="grid">
			<div class="row-full section">Simulation</div>
			<div class="row">
				<label for="r-speed">Speed</label>
				<input id="r-speed" type="range" min="0" max="3" step="0.05" bind:value={speed} />
				<span class="value">{speed.toFixed(2)}</span>
			</div>
			<div class="row">
				<label for="r-grid">Grid Size</label>
				<input id="r-grid" type="range" min="20" max="200" step="1" bind:value={gridSize} />
				<span class="value">{gridSize}</span>
			</div>
			<div class="row">
				<label for="r-adv">Advection</label>
				<input id="r-adv" type="range" min="0" max="1" step="0.01" bind:value={advection} />
				<span class="value">{advection.toFixed(2)}</span>
			</div>
			<div class="row">
				<label for="r-diff">Diffusion</label>
				<input id="r-diff" type="range" min="0" max="0.4" step="0.005" bind:value={diffusion} />
				<span class="value">{diffusion.toFixed(3)}</span>
			</div>
			<div class="row">
				<label for="r-vis">Vis Scale</label>
				<input id="r-vis" type="range" min="0.1" max="5" step="0.05" bind:value={visScale} />
				<span class="value">{visScale.toFixed(2)}</span>
			</div>

			<div class="row-full section">Color &amp; Gradient</div>
			<div class="row">
				<label for="r-bg">Background</label>
				<input id="r-bg" type="color" bind:value={backgroundColor} />
			</div>

			<div class="grad-row">
				<div class="grad-hint">Drag to move · Click to select · Double-click to remove · Click bar to add</div>
				<div
					class="grad-bar"
					bind:this={barEl}
					onclick={onBarClick}
					style:background={gradientCss}
				>
					{#each colorStops as stop, i (i)}
						<button
							type="button"
							class="grad-handle"
							data-selected={selectedStop === i}
							style:left={`${stop.offset * 100}%`}
							style:background={stop.color}
							onpointerdown={(e) => onHandlePointerDown(e, i)}
							onpointermove={(e) => onHandlePointerMove(e, i)}
							onpointerup={(e) => onHandlePointerUp(e, i)}
							onclick={(e) => e.stopPropagation()}
							ondblclick={(e) => onHandleDoubleClick(e, i)}
							aria-label={`Stop ${i + 1} at ${(stop.offset * 100).toFixed(0)}%, ${stop.color}`}
						></button>
					{/each}
				</div>
			</div>

			{#if colorStops[selectedStop]}
				<div class="row">
					<label>Stop {selectedStop + 1} ({(colorStops[selectedStop].offset * 100).toFixed(0)}%)</label>
					<input
						type="color"
						value={colorStops[selectedStop].color}
						oninput={(e) => setStopColor(selectedStop, (e.currentTarget as HTMLInputElement).value)}
					/>
				</div>
			{/if}
			<div class="row">
				<label for="r-curve">Gradient Curve</label>
				<input id="r-curve" type="range" min="0.25" max="4" step="0.05" bind:value={gradientCurve} />
				<span class="value">{gradientCurve.toFixed(2)}</span>
			</div>
			<div class="row">
				<label for="r-cont">Contrast</label>
				<input id="r-cont" type="range" min="0" max="0.99" step="0.01" bind:value={gradientContrast} />
				<span class="value">{gradientContrast.toFixed(2)}</span>
			</div>

			<div class="row-full section">Directional Tint</div>
			<div class="row">
				<label for="r-amt">Amount</label>
				<input id="r-amt" type="range" min="0" max="1" step="0.05" bind:value={tintAmount} />
				<span class="value">{tintAmount.toFixed(2)}</span>
			</div>
			<div class="row">
				<label for="r-sat">Saturation</label>
				<input id="r-sat" type="range" min="0" max="1" step="0.05" bind:value={tintSaturation} />
				<span class="value">{tintSaturation.toFixed(2)}</span>
			</div>
			<div class="row">
				<label for="r-light">Lightness</label>
				<input id="r-light" type="range" min="0.1" max="0.9" step="0.05" bind:value={tintLightness} />
				<span class="value">{tintLightness.toFixed(2)}</span>
			</div>
			<div class="row">
				<label for="r-hoff">Hue Offset</label>
				<input id="r-hoff" type="range" min="0" max="360" step="5" bind:value={tintHueOffset} />
				<span class="value">{tintHueOffset}°</span>
			</div>
			<div class="row">
				<label for="r-hrng">Hue Range</label>
				<input id="r-hrng" type="range" min="0" max="360" step="5" bind:value={tintHueRange} />
				<span class="value">{tintHueRange}°</span>
			</div>

			<div class="row-full section">Forces — Currents</div>
			<div class="row row-full" style="justify-content: space-between">
				<span class="grad-hint">{currents.length} / {MAX_FORCES} active</span>
				<button class="btn" onclick={addCurrent} disabled={currents.length >= MAX_FORCES}>+ Add Current</button>
			</div>
			{#each currents as cur, i (i)}
				<div class="row-full subsection" style="display: flex; justify-content: space-between; align-items: baseline">
					<span>Current {i + 1}</span>
					<button class="btn" onclick={() => currents.splice(i, 1)}>Remove</button>
				</div>
				<div class="row">
					<label>Start X</label>
					<input type="range" min="0" max={gridSize} step="0.5" value={cur.startX} oninput={(e) => setCurrent(i, 'startX', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.startX.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Start Y</label>
					<input type="range" min="0" max={gridSize} step="0.5" value={cur.startY} oninput={(e) => setCurrent(i, 'startY', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.startY.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>End X</label>
					<input type="range" min="0" max={gridSize} step="0.5" value={cur.endX} oninput={(e) => setCurrent(i, 'endX', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.endX.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>End Y</label>
					<input type="range" min="0" max={gridSize} step="0.5" value={cur.endY} oninput={(e) => setCurrent(i, 'endY', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.endY.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Width</label>
					<input type="range" min="1" max="40" step="0.5" value={cur.width} oninput={(e) => setCurrent(i, 'width', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.width.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Strength</label>
					<input type="range" min="0" max="3" step="0.05" value={cur.strength} oninput={(e) => setCurrent(i, 'strength', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.strength.toFixed(2)}</span>
				</div>
				<div class="row">
					<label>Speed</label>
					<input type="range" min="0" max="3" step="0.05" value={cur.speed} oninput={(e) => setCurrent(i, 'speed', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.speed.toFixed(2)}</span>
				</div>
				<div class="row">
					<label>Taper</label>
					<input type="range" min="0.5" max="5" step="0.1" value={cur.taper} oninput={(e) => setCurrent(i, 'taper', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{cur.taper.toFixed(1)}</span>
				</div>
			{/each}

			<div class="row-full section">Forces — Emitters</div>
			<div class="row row-full" style="justify-content: space-between">
				<span class="grad-hint">{emitters.length} / {MAX_FORCES} active</span>
				<button class="btn" onclick={addEmitter} disabled={emitters.length >= MAX_FORCES}>+ Add Emitter</button>
			</div>
			{#each emitters as em, i (i)}
				<div class="row-full subsection" style="display: flex; justify-content: space-between; align-items: baseline">
					<span>Emitter {i + 1}</span>
					<button class="btn" onclick={() => emitters.splice(i, 1)}>Remove</button>
				</div>
				<div class="row">
					<label>X</label>
					<input type="range" min="0" max={gridSize} step="0.5" value={em.x} oninput={(e) => setEmitter(i, 'x', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.x.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Y</label>
					<input type="range" min="0" max={gridSize} step="0.5" value={em.y} oninput={(e) => setEmitter(i, 'y', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.y.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Angle</label>
					<input type="range" min="0" max="360" step="5" value={em.angle} oninput={(e) => setEmitter(i, 'angle', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.angle.toFixed(0)}°</span>
				</div>
				<div class="row">
					<label>Length</label>
					<input type="range" min="2" max={gridSize} step="0.5" value={em.length} oninput={(e) => setEmitter(i, 'length', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.length.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Spread</label>
					<input type="range" min="1" max="40" step="0.5" value={em.spread} oninput={(e) => setEmitter(i, 'spread', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.spread.toFixed(1)}</span>
				</div>
				<div class="row">
					<label>Strength</label>
					<input type="range" min="0" max="3" step="0.05" value={em.strength} oninput={(e) => setEmitter(i, 'strength', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.strength.toFixed(2)}</span>
				</div>
				<div class="row">
					<label>Speed</label>
					<input type="range" min="0" max="3" step="0.05" value={em.speed} oninput={(e) => setEmitter(i, 'speed', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.speed.toFixed(2)}</span>
				</div>
				<div class="row">
					<label>Taper</label>
					<input type="range" min="0.5" max="5" step="0.1" value={em.taper} oninput={(e) => setEmitter(i, 'taper', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{em.taper.toFixed(1)}</span>
				</div>
			{/each}

			<div class="row-full section">Forces — Occluders</div>
			<div class="row row-full" style="justify-content: space-between">
				<span class="grad-hint">{occluders.length} / {MAX_FORCES} active · solid blocks that zero out velocity</span>
				<button class="btn" onclick={addOccluder} disabled={occluders.length >= MAX_FORCES}>+ Add Occluder</button>
			</div>
			{#each occluders as occ, i (i)}
				<div class="row-full subsection" style="display: flex; justify-content: space-between; align-items: baseline">
					<span>Occluder {i + 1}</span>
					<button class="btn" onclick={() => occluders.splice(i, 1)}>Remove</button>
				</div>
				<div class="row">
					<label>X0</label>
					<input type="range" min="0" max={gridSize} step="1" value={occ.x0} oninput={(e) => setOccluder(i, 'x0', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{occ.x0}</span>
				</div>
				<div class="row">
					<label>Y0</label>
					<input type="range" min="0" max={gridSize} step="1" value={occ.y0} oninput={(e) => setOccluder(i, 'y0', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{occ.y0}</span>
				</div>
				<div class="row">
					<label>X1</label>
					<input type="range" min="0" max={gridSize} step="1" value={occ.x1} oninput={(e) => setOccluder(i, 'x1', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{occ.x1}</span>
				</div>
				<div class="row">
					<label>Y1</label>
					<input type="range" min="0" max={gridSize} step="1" value={occ.y1} oninput={(e) => setOccluder(i, 'y1', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{occ.y1}</span>
				</div>
			{/each}

			<div class="row-full section">Forcing Layers</div>
			{#each noiseLayers as layer, i (i)}
				<div class="row-full subsection">Layer {i + 1}</div>
				<div class="row">
					<label for={`l-en-${i}`}>Enabled</label>
					<span class="switch">
						<input id={`l-en-${i}`} type="checkbox" checked={layer.enabled} onchange={(e) => setLayer(i, 'enabled', (e.currentTarget as HTMLInputElement).checked)} />
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
				<div class="row">
					<label for={`l-sc-${i}`}>Scale</label>
					<input id={`l-sc-${i}`} type="range" min="2" max="100" step="1" value={layer.scale} oninput={(e) => setLayer(i, 'scale', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{layer.scale}</span>
				</div>
				<div class="row">
					<label for={`l-st-${i}`}>Strength</label>
					<input id={`l-st-${i}`} type="range" min="0" max="2" step="0.05" value={layer.strength} oninput={(e) => setLayer(i, 'strength', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{layer.strength.toFixed(2)}</span>
				</div>
				<div class="row">
					<label for={`l-sp-${i}`}>Speed</label>
					<input id={`l-sp-${i}`} type="range" min="0" max="3" step="0.05" value={layer.speed} oninput={(e) => setLayer(i, 'speed', +(e.currentTarget as HTMLInputElement).value)} />
					<span class="value">{layer.speed.toFixed(2)}</span>
				</div>
				<div class="row">
					<label for={`l-an-${i}`}>Angle</label>
					<input id={`l-an-${i}`} type="range" min="0" max="360" step="5" value={layer.angle ?? 0} oninput={(e) => setLayer(i, 'angle', +(e.currentTarget as HTMLInputElement).value)} disabled={layer.pattern !== 'wave'} />
					<span class="value">{layer.angle ?? 0}°</span>
				</div>
			{/each}
		</div>
	{/if}

	<div class="foot">
		Algorithm: GPU velocity-field fluid sim (advection + 4-neighbor Laplacian + layered simplex/wave forcing).
	</div>
</div>
