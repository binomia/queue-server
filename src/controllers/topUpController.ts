import shortUUID from "short-uuid";
import { ZERO_ENCRYPTION_KEY, ZERO_SIGN_PRIVATE_KEY } from "@/constants";
import { AccountModel, QueuesModel, TopUpCompanyModel, TopUpPhonesModel, TopUpsModel, UsersModel } from "@/models";
import { JobJson } from "bullmq";
import { Op } from "sequelize";
import { TopUpSchema } from "@/auth/topUpSchema";
import { topUpQueue } from "@/queues";
import { AES, HASH, RSA } from "cryptografia";


export default class TopUpController {
    static prosessTopUp = async ({ repeatJobKey }: JobJson): Promise<string> => {
        try {
            const queue = await QueuesModel.findOne({
                where: {
                    [Op.and]: [
                        { repeatJobKey },
                        { status: "active" }
                    ]
                }
            })

            if (!queue)
                throw "queue not found";

            const { jobName, jobTime, amount, signature, data } = queue.toJSON()

            const hash = await HASH.sha256Async(JSON.stringify({
                jobTime,
                jobName,
                amount,
                repeatJobKey,
                ZERO_ENCRYPTION_KEY
            }))


            const verify = await RSA.verify(hash, signature, ZERO_SIGN_PRIVATE_KEY)
            if (verify) {
                const decryptedData = await AES.decrypt(data, ZERO_ENCRYPTION_KEY)
                const topUpData = await TopUpSchema.createFromQueueTopUp.parseAsync(decryptedData)

                await TopUpsModel.create({
                    ...topUpData,
                    status: "pending",
                    referenceId: `${shortUUID().uuid()}`, // [TODO]: Implement topup externally 
                })

                await queue.update({
                    repeatedCount: queue.toJSON().repeatedCount + 1
                })
            }

            return "pending"


        } catch (error) {
            console.log({ prosessTransaction: error });
            throw error
        }
    }

    static pendingTopUp = async ({ data }: JobJson): Promise<string> => {
        try {
            const decryptedData = await AES.decrypt(JSON.parse(data), ZERO_ENCRYPTION_KEY)

            // [TODO]: implement pending transaction
            const newStatus = "completed"
            const { id } = JSON.parse(decryptedData)


            const toptup = await TopUpsModel.findOne({
                where: {
                    id
                }
            })

            if (!toptup)
                throw "toptup not found";

            if (newStatus !== toptup.toJSON().status) {
                await toptup.update({
                    status: newStatus
                })
            }

            await toptup.update({
                status: "completed"
            })

            return newStatus

        } catch (error) {
            console.log({ prosessTransaction: error });
            throw error
        }
    }

    static createTopUp = async (job: JobJson) => {
        try {
            const decryptedData = await AES.decrypt(JSON.parse(job.data), ZERO_ENCRYPTION_KEY)
            const { fullName, amount, companyId, phoneNumber, location, senderUsername, recurrenceData, userId, referenceId } = JSON.parse(decryptedData)

            const [phone] = await TopUpPhonesModel.findOrCreate({
                limit: 1,
                where: {
                    [Op.and]: [
                        { phone: phoneNumber },
                        { userId }
                    ]
                },
                defaults: {
                    fullName: fullName,
                    phone: phoneNumber,
                    userId,
                    companyId: companyId
                }
            })

            const senderAccount = await AccountModel.findOne({
                where: {
                    username: senderUsername
                }
            })

            if (!senderAccount)
                throw 'Sender account not found'

            const receiverAccount = await AccountModel.findOne({
                attributes: { exclude: ['username'] },
                where: {
                    username: "$binomia"
                }
            })

            if (!receiverAccount)
                throw 'Receiver account not found'

            if (senderAccount.toJSON().balance < amount)
                throw "insufficient balance";

            if (!senderAccount.toJSON().allowSend)
                throw "sender account is not allowed to send money";

            if (!receiverAccount.toJSON().allowReceive)
                throw "receiver account is not allowed to receive money"


            // [TODO]: Implement topup externally
            const topUp = await TopUpsModel.create({
                companyId: companyId,
                userId,
                location,
                phoneId: phone.toJSON().id,
                amount: amount,
                status: 'pending',
                referenceId, // [TODO]: Implement topup externally 
            })

            const newSenderBalance = Number(senderAccount.toJSON().balance - amount).toFixed(4)
            await senderAccount.update({
                balance: Number(newSenderBalance)
            })

            const newReceiverBalance = Number(receiverAccount.toJSON().balance + amount).toFixed(4)
            await receiverAccount.update({
                balance: Number(newReceiverBalance)
            })

            await phone.update({
                lastUpdated: Date.now()
            })

            await topUp.reload({
                include: [
                    {
                        model: TopUpCompanyModel,
                        as: 'company',
                    },
                    {
                        model: UsersModel,
                        as: 'user',
                    },
                    {
                        model: TopUpPhonesModel,
                        as: 'phone',
                    }
                ]
            })

            const encryptedData = await AES.encrypt(JSON.stringify({
                id: topUp.toJSON().id,
                phone: phoneNumber,
                amount: amount,
                referenceId: topUp.toJSON().referenceId,
                response: {}
            }), ZERO_ENCRYPTION_KEY)


            await topUpQueue.createJobs({
                jobId: `pendingTopUp@${shortUUID.generate()}${shortUUID.generate()}`,
                jobName: "pendingTopUp",
                jobTime: "everyThirtyMinutes",
                data: encryptedData
            });

            if (recurrenceData.time !== "oneTime") {
                const jobId = `${recurrenceData.title}@${recurrenceData.time}@${shortUUID.generate()}${shortUUID.generate()}`
                const responseData = {
                    jobId,
                    isRecurrence: true,
                    userId,
                    jobName: recurrenceData.title,
                    jobTime: recurrenceData.time,
                    amount,
                    queueType: "topUp",
                    status: "waiting",
                    referenceData: {
                        fullName,
                        logo: topUp.toJSON().company.logo,
                    },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }

                const encryptedRecurrenceData = await AES.encrypt(JSON.stringify({
                    id: topUp.toJSON().id,
                    phone: phoneNumber,
                    amount: amount,
                    referenceId: topUp.toJSON().referenceId,
                    response: responseData
                }), ZERO_ENCRYPTION_KEY)

                await topUpQueue.createJobs({
                    jobId,
                    jobName: recurrenceData.title,
                    jobTime: recurrenceData.time,
                    data: encryptedRecurrenceData
                });
            }

            return {
                referenceId,
                userId
            }


        } catch (error: any) {
            console.log({ createTopUp: error });

            throw error
        }
    }

    // static checkForFraudulentTransaction = async (location: any, userId: number) => {
    //     try {
    //         const RAPID_TRANSACTION_TIMEFRAME = 10000; // 10 seconds
    //         const MAX_RAPID_TRANSACTIONS = 5;
    //         const MAX_SPEED_THRESHOLD_KMH = 1000;
    //         const { to, from } = transaction

    //         // Blacklisted Account Check for receiver account
    //         if (from.blacklisted || from.status === 'flagged') {
    //             console.log(`Fraud Alert: Account ${to.id} is flagged or blacklisted.`);
    //             return true;
    //         }

    //         const toptups = await TopUpsModel.findAll({
    //             where: {
    //                 userId
    //             }
    //         })

    //         // Rapid Transactions Check for receiver account
    //         if (transactionHistory.length > 0) {
    //             const recentTransactionsFiltered = transactionHistory?.filter((trx) => {
    //                 const tx: z.infer<typeof TransactionJoiSchema.transaction> = trx.toJSON()

    //                 return new Date(Number(transaction.createdAt)).getTime() - new Date(Number(tx.createdAt)).getTime() <= RAPID_TRANSACTION_TIMEFRAME

    //             }) || [];

    //             if (recentTransactionsFiltered.length >= MAX_RAPID_TRANSACTIONS) {
    //                 console.log(`Fraud Alert: Too many rapid transactions for account ${to.user.username}.`);
    //                 return true;
    //             }
    //         }


    //         // Geolocation Mismatch Check
    //         const suspiciousTravel = transactionHistory?.some((trx) => {
    //             const tx: z.infer<typeof TransactionJoiSchema.transaction> = trx.toJSON()
    //             const distanceKm = calculateDistance(
    //                 tx.location.latitude, tx.location.longitude,
    //                 transaction.location.latitude, transaction.location.longitude
    //             );

    //             const timeDiffMs = new Date(Number(transaction.createdAt)).getTime() - new Date(Number(tx.createdAt)).getTime();
    //             const speedKmH = calculateSpeed(distanceKm, timeDiffMs);

    //             return speedKmH > MAX_SPEED_THRESHOLD_KMH;
    //         });

    //         if (suspiciousTravel) {
    //             console.log(`Fraud Alert: Suspicious travel detected for account ${to.user.username}.`);
    //             return true;
    //         }

    //         return false

    //     } catch (error) {
    //         return true
    //     }
    // }
} 