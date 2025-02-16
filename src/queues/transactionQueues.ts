import { Job, JobJson, Queue, Worker } from "bullmq";
import { MonthlyQueueTitleType, WeeklyQueueTitleType } from "@/types";
import { CRON_JOB_BIWEEKLY_PATTERN, CRON_JOB_MONTHLY_PATTERN, CRON_JOB_WEEKLY_PATTERN } from "@/constants";
import shortUUID from "short-uuid";
import TransactionController from "@/controllers/transactionController";
import MainController from "@/controllers/mainController";


export default class TransactionsQueue {
    queue: Queue;

    constructor() {
        this.queue = new Queue("transactions", { connection: { host: "redis", port: 6379 } });
        this.workers()
    }

    private executeJob = async (job: JobJson) => {
        try {
            const name = job.name.split("@")[0]
            switch (name) {
                case "queueTransaction": {
                    await TransactionController.createQueuedTransaction(job)
                    console.log(`Job ${job.id} completed:`, job.name.split("@")[0]);

                    break;
                }
                case "queueRequestTransaction": {
                    await TransactionController.createRequestQueueedTransaction(job)
                    console.log(`Job ${job.id} completed:`, job.name.split("@")[0]);

                    break;
                }
                default: {
                    const prosessTransaction = await TransactionController.prosessTransaction(job)
                    if (prosessTransaction === "transactionStatusCompleted")
                        if (job.repeatJobKey)
                            this.removeJob(job.repeatJobKey, "completed")
                    break;
                }
            }

        } catch (error) {
            console.log({ executeJob: error });
        }
    }

    private workers = async () => {
        const worker = new Worker('transactions', async (job) => this.executeJob(job.asJSON()), {
            connection: { host: "redis", port: 6379 },
            settings: {
                backoffStrategy: (attemptsMade: number) => attemptsMade * 1000
            }
        });

        worker.on('completed', (job: Job) => {
            console.log('Job completed', job.repeatJobKey);
        })
    }

    createJobs = async ({ jobId, referenceData, jobName, jobTime, amount, userId, data }: { jobId: string, referenceData: any, userId: number, amount: number, jobName: string, jobTime: string, data: any }) => {
        switch (jobName) {
            case "weekly": {
                const job = await this.addJob(jobId, data, CRON_JOB_WEEKLY_PATTERN[jobTime as WeeklyQueueTitleType]);
                const transaction = await MainController.createQueue(Object.assign(job.asJSON(), {
                    queueType: "transaction",
                    jobTime,
                    jobName,
                    userId,
                    amount,
                    data,
                    referenceData
                }))

                return transaction
            }
            case "biweekly": {
                const job = await this.addJob(jobId, data, CRON_JOB_BIWEEKLY_PATTERN);
                const transaction = await MainController.createQueue(Object.assign(job.asJSON(), {
                    queueType: "transaction",
                    jobTime,
                    jobName,
                    userId,
                    amount,
                    data,
                    referenceData
                }))

                return transaction
            }
            case "monthly": {
                const job = await this.addJob(jobId, data, CRON_JOB_MONTHLY_PATTERN[jobTime as MonthlyQueueTitleType]);
                const transaction = await MainController.createQueue(Object.assign(job.asJSON(), {
                    queueType: "transaction",
                    jobTime,
                    jobName,
                    userId,
                    amount,
                    data,
                    referenceData
                }))

                return transaction
            }
            case "pendingTransaction": {
                const time = 1000 * 60 * 30 // 30 minutes
                await this.queue.add(jobId, data, {
                    jobId,
                    repeatJobKey: jobId,
                    delay: time,
                    repeat: { every: time, },
                    removeOnComplete: {
                        age: 1000 * 60 * 30 // 30 minutes
                    },
                    removeOnFail: {
                        age: 1000 * 60 * 60 * 24 // 24 hours
                    },
                });
                break;
            }
            case "queueTransaction":
            case "queueRequestTransaction": {
                const job = await this.queue.add(jobId, data, {
                    jobId,
                    removeOnComplete: {
                        age: 1000 * 60 * 30 // 30 minutes
                    },
                    removeOnFail: {
                        age: 1000 * 60 * 60 * 24 // 24 hours
                    },

                });
                return job.asJSON()
            }
            default: {
                return
            }
        }
    }

    addJob = async (jobName: string, data: string, pattern: string) => {
        const job = await this.queue.upsertJobScheduler(jobName, { tz: "EST", pattern }, { data });
        job.opts.removeOnComplete = { age: 1000 * 60 * 30 }
        job.opts.removeOnFail = { age: 1000 * 60 * 60 * 24 }
        return job
    }

    removeJob = async (repeatJobKey: string, newStatus: string = "cancelled") => {
        try {
            const job = await this.queue.removeJobScheduler(repeatJobKey)
            if (!job)
                throw "Job not found"

            const transaction = await MainController.inactiveTransaction(repeatJobKey, newStatus)
            return transaction;

        } catch (error: any) {
            throw error.toString()
        }
    }

    updateTransactionJob = async (repeatJobKey: string, jobName: string, jobTime: WeeklyQueueTitleType): Promise<any> => {
        try {
            const job = await this.queue.removeJobScheduler(repeatJobKey)

            if (!job)
                throw "error removing job"

            const queue = await MainController.inactiveTransaction(repeatJobKey, "cancelled")
            const newJob = await this.createJobs({
                jobId: `${jobName}@${jobTime}@${shortUUID.generate()}${shortUUID.generate()}`,
                amount: queue.amount,
                jobName,
                jobTime,
                userId: queue.userId,
                data: queue.data,
                referenceData: queue.referenceData
            })

            return newJob;

        } catch (error: any) {
            throw error.toString()
        }
    }
}