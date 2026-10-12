import { splitAnimationsAtTime } from "@/animation";
import { getSourceSpanAtClipTime } from "@/retime";
import { isRetimableElement } from "@/timeline";
import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	subMediaTime,
} from "@/wasm";

export interface MediaTimeRange {
	start: MediaTime;
	end: MediaTime;
}

/**
 * Removes the given timeline ranges from every track and closes the gaps,
 * keeping all tracks in sync (a multi-track ripple delete).
 *
 * `ranges` must be sorted and non-overlapping.
 */
export function removeTimeRangesFromTracks({
	tracks,
	ranges,
}: {
	tracks: SceneTracks;
	ranges: MediaTimeRange[];
}): SceneTracks {
	if (ranges.length === 0) return tracks;

	const cutTrack = <TTrack extends TimelineTrack>(track: TTrack): TTrack =>
		({
			...track,
			elements: track.elements.flatMap((element) =>
				cutElement({ element, ranges }),
			),
		}) as TTrack;

	return {
		overlay: tracks.overlay.map(cutTrack),
		main: cutTrack(tracks.main),
		audio: tracks.audio.map(cutTrack),
	};
}

function cutElement<TElement extends TimelineElement>({
	element,
	ranges,
}: {
	element: TElement;
	ranges: MediaTimeRange[];
}): TElement[] {
	const elementEnd = addMediaTime({ a: element.startTime, b: element.duration });
	const keptSpans = subtractRanges({
		span: { start: element.startTime, end: elementEnd },
		ranges,
	});

	return keptSpans.map((span, index) => {
		const slice = sliceElement({
			element,
			relativeStart: subMediaTime({ a: span.start, b: element.startTime }),
			relativeEnd: subMediaTime({ a: span.end, b: element.startTime }),
		});
		return {
			...slice,
			id: index === 0 ? element.id : generateUUID(),
			startTime: subMediaTime({
				a: span.start,
				b: getRemovedDurationBefore({ time: span.start, ranges }),
			}),
		};
	});
}

function subtractRanges({
	span,
	ranges,
}: {
	span: MediaTimeRange;
	ranges: MediaTimeRange[];
}): MediaTimeRange[] {
	const kept: MediaTimeRange[] = [];
	let cursor = span.start;
	for (const range of ranges) {
		if (range.end <= cursor) continue;
		if (range.start >= span.end) break;
		if (range.start > cursor) {
			kept.push({ start: cursor, end: range.start });
		}
		cursor = range.end > cursor ? range.end : cursor;
		if (cursor >= span.end) break;
	}
	if (cursor < span.end) {
		kept.push({ start: cursor, end: span.end });
	}
	return kept;
}

function getRemovedDurationBefore({
	time,
	ranges,
}: {
	time: MediaTime;
	ranges: MediaTimeRange[];
}): MediaTime {
	let removed = 0;
	for (const range of ranges) {
		if (range.start >= time) break;
		removed += Math.min(range.end, time) - range.start;
	}
	return roundMediaTime({ time: removed });
}

/** Keeps only `[relativeStart, relativeEnd)` of an element (clip-relative times). */
function sliceElement<TElement extends TimelineElement>({
	element,
	relativeStart,
	relativeEnd,
}: {
	element: TElement;
	relativeStart: MediaTime;
	relativeEnd: MediaTime;
}): TElement {
	const retime = isRetimableElement(element) ? element.retime : undefined;
	// Snap each source-side boundary once, same discipline as SplitElementsCommand.
	const toSourceSpan = (clipTime: MediaTime) =>
		roundMediaTime({ time: getSourceSpanAtClipTime({ clipTime, retime }) });
	const totalSourceSpan = toSourceSpan(element.duration);
	const sourceSpanToStart = toSourceSpan(relativeStart);
	const sourceSpanToEnd = toSourceSpan(relativeEnd);
	const duration = subMediaTime({ a: relativeEnd, b: relativeStart });

	let animations = element.animations;
	if (relativeStart > 0) {
		animations = splitAnimationsAtTime({
			animations,
			splitTime: relativeStart,
		}).rightAnimations;
	}
	if (relativeEnd < element.duration) {
		animations = splitAnimationsAtTime({
			animations,
			splitTime: duration,
		}).leftAnimations;
	}

	return {
		...element,
		duration,
		trimStart: addMediaTime({ a: element.trimStart, b: sourceSpanToStart }),
		trimEnd: addMediaTime({
			a: element.trimEnd,
			b: subMediaTime({ a: totalSourceSpan, b: sourceSpanToEnd }),
		}),
		animations,
	};
}
