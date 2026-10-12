import type { MediaAsset } from "@/media/types";
import type { SilenceDetectionSettings, SilenceInterval } from "./types";

interface SilenceDetectResponse {
	silences: SilenceInterval[];
	sourceDuration: number | null;
}

const cache = new Map<string, Promise<SilenceInterval[]>>();

function getCacheKey({
	asset,
	settings,
}: {
	asset: MediaAsset;
	settings: SilenceDetectionSettings;
}): string {
	return `${asset.id}|${settings.noiseDb}|${settings.minSilenceSeconds}`;
}

async function requestSilences({
	asset,
	settings,
}: {
	asset: MediaAsset;
	settings: SilenceDetectionSettings;
}): Promise<SilenceInterval[]> {
	const params = new URLSearchParams({
		noiseDb: String(settings.noiseDb),
		minSilence: String(settings.minSilenceSeconds),
	});
	if (asset.duration) {
		params.set("duration", String(asset.duration));
	}

	const response = await fetch(`/api/silence-detect?${params}`, {
		method: "POST",
		headers: { "Content-Type": "application/octet-stream" },
		body: asset.file,
	});
	const payload = (await response.json()) as
		| SilenceDetectResponse
		| { error: string };

	if (!response.ok || "error" in payload) {
		throw new Error(
			"error" in payload ? payload.error : `HTTP ${response.status}`,
		);
	}
	return payload.silences;
}

/** Runs ffmpeg silencedetect on the local API, memoized per asset + settings. */
export function detectSilences({
	asset,
	settings,
}: {
	asset: MediaAsset;
	settings: SilenceDetectionSettings;
}): Promise<SilenceInterval[]> {
	const key = getCacheKey({ asset, settings });
	const cached = cache.get(key);
	if (cached) return cached;

	const pending = requestSilences({ asset, settings });
	cache.set(key, pending);
	pending.catch(() => cache.delete(key));
	return pending;
}
