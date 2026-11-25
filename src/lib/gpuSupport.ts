type GpuNavigator = Navigator & {
	gpu?: {
		requestAdapter: () => Promise<object | null>;
	};
};

/** True when this browser can obtain a WebGPU adapter. */
export async function detectWebGPU(): Promise<boolean> {
	try {
		const gpu = (navigator as GpuNavigator).gpu;
		if (!gpu) return false;
		const adapter = await gpu.requestAdapter();
		return adapter !== null;
	} catch {
		return false;
	}
}
