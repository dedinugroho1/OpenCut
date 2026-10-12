import type {
	ClipSourceWindow,
	SilenceCutSettings,
	SilenceInterval,
	SilencePaddingSettings,
	TimeRangeSeconds,
} from "./types";

export const DEFAULT_SILENCE_CUT_SETTINGS: SilenceCutSettings = {
	noiseDb: -35,
	minSilenceSeconds: 1.5,
	paddingBeforeSpeechSeconds: 0.2,
	paddingAfterSpeechSeconds: 0.25,
};

// Cuts shorter than this aren't worth the extra edit point.
const MIN_CUT_SECONDS = 0.05;
const BOUNDARY_EPSILON_SECONDS = 0.001;

/**
 * Turns detected silences into timeline ranges to remove from one clip.
 *
 * Padding only applies on sides where speech is adjacent inside the clip: a
 * silence touching the clip's start or end edge is cut right up to that edge.
 */
export function buildSilenceCutRanges({
	silences,
	clip,
	padding,
	minSilenceSeconds,
}: {
	silences: SilenceInterval[];
	clip: ClipSourceWindow;
	padding: SilencePaddingSettings;
	minSilenceSeconds: number;
}): TimeRangeSeconds[] {
	const sourceStart = clip.trimStart;
	const sourceEnd = clip.trimStart + clip.duration * clip.rate;

	const ranges = silences.flatMap((silence): TimeRangeSeconds[] => {
		const start = Math.max(silence.start, sourceStart);
		const end = Math.min(silence.end, sourceEnd);
		if (end - start < minSilenceSeconds) return [];

		const hasSpeechBefore = start > sourceStart + BOUNDARY_EPSILON_SECONDS;
		const hasSpeechAfter = end < sourceEnd - BOUNDARY_EPSILON_SECONDS;
		const cutStart =
			start + (hasSpeechBefore ? padding.paddingAfterSpeechSeconds : 0);
		const cutEnd =
			end - (hasSpeechAfter ? padding.paddingBeforeSpeechSeconds : 0);
		if (cutEnd - cutStart < MIN_CUT_SECONDS) return [];

		return [
			{
				start: clip.startTime + (cutStart - sourceStart) / clip.rate,
				end: clip.startTime + (cutEnd - sourceStart) / clip.rate,
			},
		];
	});

	return mergeTimeRanges({ ranges });
}

export function mergeTimeRanges<TRange extends { start: number; end: number }>({
	ranges,
}: {
	ranges: TRange[];
}): TRange[] {
	const sorted = ranges
		.filter((range) => range.end > range.start)
		.sort((a, b) => a.start - b.start);
	const merged: TRange[] = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];
		if (previous && range.start <= previous.end) {
			previous.end = Math.max(previous.end, range.end);
			continue;
		}
		merged.push({ ...range });
	}
	return merged;
}

export function getTotalRangeDuration({
	ranges,
}: {
	ranges: { start: number; end: number }[];
}): number {
	return ranges.reduce((total, range) => total + (range.end - range.start), 0);
}
