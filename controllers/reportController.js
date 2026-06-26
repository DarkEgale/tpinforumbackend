import Report from "../models/report.js";

export const createReport = async (data) => {
    try {
        const { userId, postId, reason } = data;
        const report = await Report.create({
            userId,
            postId,
            reason
        });
        return report;
    } catch (error) {
        console.error("Error in report create:", error);
        throw error;
    }
};
///dede