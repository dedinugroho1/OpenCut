"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RippleCutCommand } from "@/commands";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import { isRetimableElement } from "@/timeline";
import type {
	ElementRef,
	TimelineElement,
	UploadAudioElement,
	VideoElement,
} from "@/timeline/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import {
	buildSilenceCutRanges,
	DEFAULT_SILENCE_CUT_SETTINGS,
	detectSilences,
	getTotalRangeDuration,
	mergeTimeRanges,
	type SilenceCutSettings,
	type SilenceInterval,
} from "@/silence";

const SETTINGS_STORAGE_KEY = "opencut:silence-cut-settings";

type MediaClip = VideoElement | UploadAudioElement;

interface SilenceCutTarget {
	element: MediaClip;
	asset: MediaAsset;
}

interface AnalyzedTarget extends SilenceCutTarget {
	silences: SilenceInterval[];
}

type AnalysisState =
	| { status: "idle" }
	| { status: "analyzing"; done: number; total: number }
	| {
			status: "ready";
			results: AnalyzedTarget[];
			noiseDb: number;
			minSilenceSeconds: number;
	  }
	| { status: "error"; message: string };

function isMediaClip(element: TimelineElement): element is MediaClip {
	return (
		element.type === "video" ||
		(element.type === "audio" && element.sourceType === "upload")
	);
}

/** Selected media clips, or every clip on the main track when nothing is selected. */
function collectTargets({
	editor,
	selectedElements,
}: {
	editor: EditorCore;
	selectedElements: ElementRef[];
}): SilenceCutTarget[] {
	const elements =
		selectedElements.length > 0
			? editor.timeline
					.getElementsWithTracks({ elements: selectedElements })
					.map(({ element }) => element)
			: editor.scenes.getActiveScene().tracks.main.elements;
	const assets = editor.media.getAssets();

	return elements.filter(isMediaClip).flatMap((element) => {
		const asset = assets.find((candidate) => candidate.id === element.mediaId);
		const hasAudio = asset?.type === "audio" || asset?.hasAudio;
		return asset && hasAudio ? [{ element, asset }] : [];
	});
}

function loadSettings(): SilenceCutSettings {
	try {
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		return stored
			? { ...DEFAULT_SILENCE_CUT_SETTINGS, ...JSON.parse(stored) }
			: DEFAULT_SILENCE_CUT_SETTINGS;
	} catch {
		return DEFAULT_SILENCE_CUT_SETTINGS;
	}
}

function formatSeconds(seconds: number): string {
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const rest = (seconds % 60).toFixed(1).padStart(4, "0");
	return `${minutes}:${rest}`;
}

export function SilenceCutDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	const [settings, setSettings] = useState<SilenceCutSettings>(
		DEFAULT_SILENCE_CUT_SETTINGS,
	);
	const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });

	useEffect(() => {
		setSettings(loadSettings());
	}, []);

	useEffect(() => {
		if (open) setAnalysis({ status: "idle" });
	}, [open]);

	const targets = useMemo(
		() => (open ? collectTargets({ editor, selectedElements }) : []),
		[open, editor, selectedElements],
	);

	const updateSetting = (key: keyof SilenceCutSettings, value: number) => {
		if (!Number.isFinite(value)) return;
		const next = { ...settings, [key]: value };
		setSettings(next);
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
	};

	// Padding is applied client-side, so tweaking it updates the preview instantly.
	const cutRanges = useMemo(() => {
		if (analysis.status !== "ready") return [];
		const ranges = analysis.results.flatMap(({ element, silences }) =>
			buildSilenceCutRanges({
				silences,
				clip: {
					startTime: mediaTimeToSeconds({ time: element.startTime }),
					duration: mediaTimeToSeconds({ time: element.duration }),
					trimStart: mediaTimeToSeconds({ time: element.trimStart }),
					rate: isRetimableElement(element) ? (element.retime?.rate ?? 1) : 1,
				},
				padding: settings,
				minSilenceSeconds: analysis.minSilenceSeconds,
			}),
		);
		return mergeTimeRanges({ ranges });
	}, [analysis, settings]);

	const isStale =
		analysis.status === "ready" &&
		(analysis.noiseDb !== settings.noiseDb ||
			analysis.minSilenceSeconds !== settings.minSilenceSeconds);
	const removedSeconds = getTotalRangeDuration({ ranges: cutRanges });
	const timelineSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});

	const handleAnalyze = async () => {
		const detection = {
			noiseDb: settings.noiseDb,
			minSilenceSeconds: settings.minSilenceSeconds,
		};
		setAnalysis({ status: "analyzing", done: 0, total: targets.length });
		try {
			const results: AnalyzedTarget[] = [];
			for (const target of targets) {
				const silences = await detectSilences({
					asset: target.asset,
					settings: detection,
				});
				results.push({ ...target, silences });
				setAnalysis({
					status: "analyzing",
					done: results.length,
					total: targets.length,
				});
			}
			setAnalysis({ status: "ready", results, ...detection });
		} catch (error) {
			setAnalysis({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	};

	const handleApply = () => {
		if (cutRanges.length === 0) return;
		editor.command.execute({
			command: new RippleCutCommand({
				ranges: cutRanges.map((range) => ({
					start: mediaTimeFromSeconds({ seconds: range.start }),
					end: mediaTimeFromSeconds({ seconds: range.end }),
				})),
			}),
		});
		toast.success(
			`Removed ${cutRanges.length} pauses (${formatSeconds(removedSeconds)})`,
			{ description: "Press Cmd+Z to undo." },
		);
		onOpenChange(false);
	};

	const settingFields: {
		key: keyof SilenceCutSettings;
		label: string;
		unit: string;
		step: number;
		scale: number;
	}[] = [
		{ key: "noiseDb", label: "Silence threshold", unit: "dB", step: 1, scale: 1 },
		{
			key: "minSilenceSeconds",
			label: "Min pause length",
			unit: "s",
			step: 0.1,
			scale: 1,
		},
		{
			key: "paddingBeforeSpeechSeconds",
			label: "Keep before speech",
			unit: "ms",
			step: 10,
			scale: 1000,
		},
		{
			key: "paddingAfterSpeechSeconds",
			label: "Keep after speech",
			unit: "ms",
			step: 10,
			scale: 1000,
		},
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Smart Silence Cut</DialogTitle>
					<DialogDescription>
						Detects pauses with local FFmpeg and removes them across all
						tracks. Uses the selected clips, or the main track if nothing is
						selected.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="grid grid-cols-2 gap-3">
						{settingFields.map((field) => (
							<div key={field.key} className="flex flex-col gap-1.5">
								<Label htmlFor={`silence-${field.key}`}>
									{field.label} ({field.unit})
								</Label>
								<Input
									id={`silence-${field.key}`}
									type="number"
									size="sm"
									step={field.step}
									value={Math.round(settings[field.key] * field.scale * 100) / 100}
									onChange={(event) =>
										updateSetting(
											field.key,
											Number(event.target.value) / field.scale,
										)
									}
								/>
							</div>
						))}
					</div>

					<div className="bg-accent/50 rounded-md p-3 text-sm">
						{targets.length === 0 ? (
							<p className="text-muted-foreground">
								No clips with audio found. Add a video to the main track or
								select an audio clip.
							</p>
						) : analysis.status === "idle" ? (
							<p className="text-muted-foreground">
								{targets.length} clip{targets.length > 1 ? "s" : ""} ready to
								analyze.
							</p>
						) : analysis.status === "analyzing" ? (
							<p>
								Analyzing audio… ({analysis.done}/{analysis.total})
							</p>
						) : analysis.status === "error" ? (
							<p className="text-destructive">{analysis.message}</p>
						) : (
							<div className="flex flex-col gap-1">
								<p>
									Found <strong>{cutRanges.length}</strong> pauses — removes{" "}
									<strong>{formatSeconds(removedSeconds)}</strong>.
								</p>
								<p className="text-muted-foreground">
									Timeline: {formatSeconds(timelineSeconds)} →{" "}
									{formatSeconds(Math.max(0, timelineSeconds - removedSeconds))}
								</p>
								{isStale && (
									<p className="text-caution">
										Detection settings changed — analyze again to update.
									</p>
								)}
							</div>
						)}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleAnalyze}
						disabled={targets.length === 0 || analysis.status === "analyzing"}
					>
						{analysis.status === "ready" ? "Analyze again" : "Analyze"}
					</Button>
					<Button
						onClick={handleApply}
						disabled={
							analysis.status !== "ready" || isStale || cutRanges.length === 0
						}
					>
						Cut {cutRanges.length > 0 ? cutRanges.length : ""} pauses
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
