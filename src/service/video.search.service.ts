import { extractYouTubeVideoEmbeddings } from "../data-ingestion/generate_embedding/generate.embedding";
import { extractTimedTranscriptChunks } from "../data-ingestion/text-extraction/text.extraction";
import {
  saveChunksToQdrant,
  isVideoAlreadyIngested,
  getChunksCountForVideo,
  getFirstChunk,
  getAllChunksForVideo,
} from "../knowledgeBase/dao";
import { buildInstantSummary } from "./ask.service";
import {
  IngestionProgress,
  IngestVideoResult,
  VideoChunkPayload,
} from "../types/interface/video.search.interface";


/**
 * Ingests a YouTube video into the Qdrant vector database with timestamped chunks.
 * Reports live progress via onProgress callback.
 */
export async function ingestVideoService(
  videoUrl: string,
  onProgress?: (data: IngestionProgress) => void,
  force: boolean = false
): Promise<IngestVideoResult> {
  // Skip ingestion if the video has already been indexed
  if (!force) {
    const alreadyExists = await isVideoAlreadyIngested(videoUrl);
    if (alreadyExists) {
      const existingCount = await getChunksCountForVideo(videoUrl);
      const firstChunk = await getFirstChunk(videoUrl);
      const allChunks = await getAllChunksForVideo(videoUrl);
      const instantSummary = buildInstantSummary(allChunks);
      const payload = firstChunk?.payload as unknown as VideoChunkPayload | undefined;

      onProgress?.({
        step: 4,
        progress: 100,
        message: `Video already indexed in knowledge base (${existingCount} chunks). Skipping re-ingestion.`,
      });

      return {
        videoUrl,
        chunksCount: existingCount,
        alreadyIngested: true,
        summary: instantSummary,
        message: "Video already indexed in knowledge base. Ingestion skipped.",
        initialOverview: `This video is already indexed in Qdrant with ${existingCount} chunks. You can immediately chat and ask questions with interactive timestamps!`,
        sampleChunks: firstChunk
          ? [
              {
                text: payload?.rawText || payload?.text || "Video introduction segment.",
                start: payload?.start ?? 0,
                duration: payload?.duration ?? 30,
                score: 1.0,
              },
            ]
          : [],
      };
    }
  }

  // 1. Validate & fetch transcript
  onProgress?.({
    step: 0,
    progress: 15,
    message: "Validating YouTube URL & checking transcript availability...",
  });

  const timedChunks = await extractTimedTranscriptChunks(videoUrl, 700);
  onProgress?.({
    step: 1,
    progress: 40,
    message: "Transcript extracted successfully.",
  });

  // 2. Prepare text chunks
  const chunkTexts = timedChunks.map((c) => c.text);
  onProgress?.({
    step: 2,
    progress: 65,
    message: `Created ${timedChunks.length} semantic chunks.`,
  });

  // 3. Generate vector embeddings
  const videoEmbeddings = await extractYouTubeVideoEmbeddings(chunkTexts);
  onProgress?.({
    step: 3,
    progress: 85,
    message: "Generated semantic vector embeddings.",
  });

  // 4. Save to Qdrant
  await saveChunksToQdrant(videoUrl, timedChunks, videoEmbeddings);
  onProgress?.({
    step: 4,
    progress: 100,
    message: "Indexed all points into Qdrant knowledge base!",
  });

  const instantSummary = buildInstantSummary(
    timedChunks.map((c, i) => ({
      payload: {
        text: c.text,
        rawText: c.rawText,
        start: c.start,
        formattedTime: c.formattedTime,
        chunkIndex: i,
      },
    }))
  );

  return {
    videoUrl,
    chunksCount: timedChunks.length,
    summary: instantSummary,
    message: "Video indexed successfully in Qdrant.",
    initialOverview: `Successfully indexed video into Qdrant with ${timedChunks.length} chunks. You can now chat and ask questions with interactive timestamps!`,
    sampleChunks: [
      {
        text: timedChunks[0]?.rawText || "Video introduction segment.",
        start: timedChunks[0]?.start ?? 0,
        duration: timedChunks[0]?.duration ?? 30,
        score: 0.95,
      },
      ...(timedChunks[1]
        ? [
            {
              text: timedChunks[1].rawText,
              start: timedChunks[1].start,
              duration: timedChunks[1].duration,
              score: 0.92,
            },
          ]
        : []),
    ],
  };
}
