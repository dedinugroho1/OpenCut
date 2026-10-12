import { describe, expect, test } from "bun:test";
import {
	buildSilenceCutRanges,
	getTotalRangeDuration,
	mergeTimeRanges,
} from "../cut-ranges";

const padding = {
	paddingBeforeSpeechSeconds: 0.2,
	paddingAfterSpeechSeconds: 0.25,
};
const clip = { startTime: 0, duration: 60, trimStart: 0, rate: 1 };

function round(ranges: { start: number; end: number }[]) {
	return ranges.map(({ start, end }) => ({
		start: Math.round(start * 1000) / 1000,
		end: Math.round(end * 1000) / 1000,
	}));
}

describe("buildSilenceCutRanges", () => {
	test("keeps padding around speech on both sides of a mid-clip pause", () => {
		const ranges = buildSilenceCutRanges({
			silences: [{ start: 10, end: 13 }],
			clip,
			padding,
			minSilenceSeconds: 1.5,
		});
		expect(round(ranges)).toEqual([{ start: 10.25, end: 12.8 }]);
	});

	test("ignores pauses shorter than the minimum", () => {
		const ranges = buildSilenceCutRanges({
			silences: [{ start: 10, end: 11.2 }],
			clip,
			padding,
			minSilenceSeconds: 1.5,
		});
		expect(ranges).toEqual([]);
	});

	test("cuts right up to clip edges where no speech is adjacent", () => {
		const ranges = buildSilenceCutRanges({
			silences: [
				{ start: 0, end: 3 },
				{ start: 55, end: 60 },
			],
			clip,
			padding,
			minSilenceSeconds: 1.5,
		});
		expect(round(ranges)).toEqual([
			{ start: 0, end: 2.8 },
			{ start: 55.25, end: 60 },
		]);
	});

	test("maps source time to timeline time through trim and position", () => {
		const ranges = buildSilenceCutRanges({
			silences: [{ start: 30, end: 34 }],
			clip: { startTime: 5, duration: 20, trimStart: 20, rate: 1 },
			padding,
			minSilenceSeconds: 1.5,
		});
		// source 30.25..33.8 -> clip offset 10.25..13.8 -> timeline 15.25..18.8
		expect(round(ranges)).toEqual([{ start: 15.25, end: 18.8 }]);
	});

	test("clips silences to the visible window and drops ones outside it", () => {
		const ranges = buildSilenceCutRanges({
			silences: [
				{ start: 2, end: 8 },
				{ start: 40, end: 50 },
			],
			clip: { startTime: 0, duration: 10, trimStart: 5, rate: 1 },
			padding,
			minSilenceSeconds: 1.5,
		});
		// visible source 5..15; silence 2..8 becomes 5..8, touching the clip start
		expect(round(ranges)).toEqual([{ start: 0, end: 2.8 }]);
	});

	test("accounts for playback rate", () => {
		const ranges = buildSilenceCutRanges({
			silences: [{ start: 10, end: 14 }],
			clip: { startTime: 0, duration: 30, trimStart: 0, rate: 2 },
			padding,
			minSilenceSeconds: 1.5,
		});
		expect(round(ranges)).toEqual([{ start: 5.125, end: 6.9 }]);
	});
});

describe("mergeTimeRanges", () => {
	test("sorts and merges overlapping ranges", () => {
		const merged = mergeTimeRanges({
			ranges: [
				{ start: 5, end: 7 },
				{ start: 1, end: 2 },
				{ start: 6, end: 9 },
			],
		});
		expect(merged).toEqual([
			{ start: 1, end: 2 },
			{ start: 5, end: 9 },
		]);
		expect(getTotalRangeDuration({ ranges: merged })).toBe(5);
	});
});
