import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { type MediaTimeRange, removeTimeRangesFromTracks } from "@/ripple";
import type { SceneTracks } from "@/timeline";

/** Removes time ranges from every track and closes the gaps in one undo step. */
export class RippleCutCommand extends Command {
	override readonly managesRipple = true;
	private savedState: SceneTracks | null = null;
	private readonly ranges: MediaTimeRange[];

	constructor({ ranges }: { ranges: MediaTimeRange[] }) {
		super();
		this.ranges = ranges;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		editor.timeline.updateTracks(
			removeTimeRangesFromTracks({
				tracks: this.savedState,
				ranges: this.ranges,
			}),
		);

		return {
			selection: {
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		};
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
