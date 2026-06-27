import { Queue, Worker, Job } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const taskQueue = new Queue("tasks", {
  connection,
});

export function setupWorkers() {
  const worker = new Worker(
    "tasks",
    async (job: Job) => {
      const { type } = job.data;
      console.log(`[worker] Processing job ${job.id} type=${type}`);

      const { processTask } = await import("../modules/tasks/task.processor");
      await processTask(job);
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("completed", (job) =>
    console.log(`[worker] Job ${job.id} completed`)
  );

  worker.on("failed", (job, err) =>
    console.error(`[worker] Job ${job?.id} failed:`, err)
  );
}