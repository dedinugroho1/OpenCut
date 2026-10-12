import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { SilenceInterval } from "@/silence/types";

// Local-only endpoint: spawns the host's ffmpeg. Will not work on edge/serverless.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";

const NOISE_DB_RANGE = { min: -90, max: -5 };
const MIN_SILENCE_RANGE = { min: 0.1, max: 30 };

function parseBoundedNumber({
	value,
	min,
	max,
}: {
	value: string | null;
	min: number;
	max: number;
}): number | null {
	if (value === null) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
	return parsed;
}

function parseFfmpegDuration({ stderr }: { stderr: string }): number | null {
	const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
	if (!match) return null;
	const [, hours, minutes, seconds] = match;
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseSilences({
	stderr,
	sourceDuration,
}: {
	stderr: string;
	sourceDuration: number | null;
}): SilenceInterval[] {
	const silences: SilenceInterval[] = [];
	let openStart: number | null = null;

	for (const line of stderr.split("\n")) {
		const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
		if (startMatch) {
			openStart = Math.max(0, Number(startMatch[1]));
			continue;
		}
		const endMatch = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/);
		if (endMatch && openStart !== null) {
			silences.push({ start: openStart, end: Number(endMatch[1]) });
			openStart = null;
		}
	}

	// Trailing silence runs to end of file; ffmpeg never emits its silence_end.
	if (openStart !== null && sourceDuration !== null && sourceDuration > openStart) {
		silences.push({ start: openStart, end: sourceDuration });
	}

	return silences;
}

function runSilenceDetect({
	inputPath,
	noiseDb,
	minSilenceSeconds,
}: {
	inputPath: string;
	noiseDb: number;
	minSilenceSeconds: number;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const ffmpeg = spawn(FFMPEG_PATH, [
			"-hide_banner",
			"-nostats",
			"-i",
			inputPath,
			"-vn",
			"-sn",
			"-dn",
			"-af",
			`silencedetect=noise=${noiseDb}dB:d=${minSilenceSeconds}`,
			"-f",
			"null",
			"-",
		]);

		let stderr = "";
		ffmpeg.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		ffmpeg.on("error", reject);
		ffmpeg.on("close", (code) => {
			if (code === 0) {
				resolve(stderr);
				return;
			}
			reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
		});
	});
}

export async function POST(request: Request) {
	const { searchParams } = new URL(request.url);
	const noiseDb = parseBoundedNumber({
		value: searchParams.get("noiseDb"),
		...NOISE_DB_RANGE,
	});
	const minSilenceSeconds = parseBoundedNumber({
		value: searchParams.get("minSilence"),
		...MIN_SILENCE_RANGE,
	});
	const clientDuration = parseBoundedNumber({
		value: searchParams.get("duration"),
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
	});

	if (noiseDb === null || minSilenceSeconds === null) {
		return Response.json(
			{ error: "Invalid noiseDb or minSilence parameter" },
			{ status: 400 },
		);
	}
	if (!request.body) {
		return Response.json({ error: "Missing media body" }, { status: 400 });
	}

	const workDir = await mkdtemp(path.join(tmpdir(), "opencut-silence-"));
	const inputPath = path.join(workDir, "input");

	try {
		await pipeline(
			Readable.fromWeb(request.body as unknown as WebReadableStream<Uint8Array>),
			createWriteStream(inputPath),
		);

		const stderr = await runSilenceDetect({
			inputPath,
			noiseDb,
			minSilenceSeconds,
		});
		const sourceDuration = clientDuration ?? parseFfmpegDuration({ stderr });

		return Response.json({
			silences: parseSilences({ stderr, sourceDuration }),
			sourceDuration,
		});
	} catch (error) {
		const isMissingFfmpeg =
			error instanceof Error && "code" in error && error.code === "ENOENT";
		return Response.json(
			{
				error: isMissingFfmpeg
					? `ffmpeg not found at "${FFMPEG_PATH}". Install it (brew install ffmpeg) or set FFMPEG_PATH.`
					: error instanceof Error
						? error.message
						: "Silence detection failed",
			},
			{ status: 500 },
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
}
