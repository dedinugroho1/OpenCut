/** A silent stretch of a media file, in source seconds. */
export interface SilenceInterval {
	start: number;
	end: number;
}

/** A span on the timeline, in seconds. */
export interface TimeRangeSeconds {
	start: number;
	end: number;
}

export interface SilenceDetectionSettings {
	/** Anything quieter than this counts as silence. */
	noiseDb: number;
	/** Only pauses longer than this are cut. */
	minSilenceSeconds: number;
}

export interface SilencePaddingSettings {
	/** Audio kept before speech resumes, so the first syllable isn't clipped. */
	paddingBeforeSpeechSeconds: number;
	/** Audio kept after speech ends, so the last word can decay naturally. */
	paddingAfterSpeechSeconds: number;
}

export type SilenceCutSettings = SilenceDetectionSettings &
	SilencePaddingSettings;

/** Where a clip's visible content sits, both on the timeline and in its source. */
export interface ClipSourceWindow {
	startTime: number;
	duration: number;
	trimStart: number;
	rate: number;
}
