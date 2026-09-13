import type {
  BatchItemStatus,
  BatchProgressReport,
  EnhanceImageOptions,
  ResolutionEnhancementProvider,
} from "./types";

export interface BatchItemInput {
  index: number;
  slotId: string;
  filename: string;
  options: EnhanceImageOptions;
}

export interface BatchProcessorOptions {
  provider: ResolutionEnhancementProvider;
  concurrency?: number;
  maxRetries?: number;
  onProgress?: (report: BatchProgressReport) => void;
  shouldCancel?: () => boolean;
}

/**
 * Executes batch resolution enhancement with bounded concurrency, retry handling,
 * cancellation, and partial-failure reporting.
 */
export async function processBatchEnhancement(
  items: BatchItemInput[],
  options: BatchProcessorOptions,
): Promise<BatchProgressReport> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const maxRetries = options.maxRetries ?? 2;

  const itemStatuses: BatchItemStatus[] = items.map((it) => ({
    index: it.index,
    slotId: it.slotId,
    filename: it.filename,
    status: "queued",
    progressPct: 0,
  }));

  const report: BatchProgressReport = {
    total: items.length,
    completed: 0,
    failed: 0,
    cancelled: 0,
    inProgress: 0,
    items: itemStatuses,
    isFinished: false,
  };

  const emitProgress = () => {
    options.onProgress?.({ ...report, items: [...itemStatuses] });
  };

  emitProgress();

  let queueIndex = 0;

  async function worker() {
    while (queueIndex < items.length) {
      if (options.shouldCancel?.()) {
        for (let i = queueIndex; i < items.length; i++) {
          if (itemStatuses[i].status === "queued") {
            itemStatuses[i].status = "cancelled";
            report.cancelled++;
          }
        }
        break;
      }

      const currentIndex = queueIndex++;
      const item = items[currentIndex];
      const status = itemStatuses[currentIndex];

      status.status = "processing";
      status.progressPct = 25;
      report.inProgress++;
      emitProgress();

      let attempts = 0;
      let success = false;

      while (attempts <= maxRetries && !success) {
        if (options.shouldCancel?.()) {
          status.status = "cancelled";
          report.inProgress--;
          report.cancelled++;
          emitProgress();
          return;
        }

        attempts++;
        try {
          status.progressPct = 50;
          emitProgress();

          const result = await options.provider.enhanceImage(item.options);

          status.result = result;
          status.status = "completed";
          status.progressPct = 100;
          report.completed++;
          report.inProgress--;
          success = true;
          emitProgress();
        } catch (err: any) {
          if (attempts > maxRetries) {
            status.error = err.message ?? String(err);
            status.status = "failed";
            status.progressPct = 100;
            report.failed++;
            report.inProgress--;
            emitProgress();
          } else {
            // Wait with backoff before next attempt
            await new Promise((r) => setTimeout(r, 200 * attempts));
          }
        }
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  report.isFinished = true;
  emitProgress();

  return report;
}
