import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType, type ImportParsePayload } from '@/lib/bullmq/types';

/**
 * Starts the import workflow by enqueuing the initial parse job.
 * Once parsed, this job dynamically chunks and commits the rows.
 */
export async function startImportWorkflow(payload: ImportParsePayload): Promise<string> {
  return enqueue(
    JobType.IMPORT_PARSE,
    payload,
    { tenantId: payload.tenantId }
  );
}
