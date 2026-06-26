import Likes from "../models/likes.js";

export const toggleLike = async (postId, userId) => {
    const existingLike = await Likes.findOne({
        postId,
        userId
    });

    if (existingLike) {
        await Likes.findOneAndDelete({
            postId,
            userId
        });
        return { liked: false, message: "Like removed" };
    }

    await Likes.create({
        postId,
        userId
    });

    return { liked: true, message: "Liked" };
};

export const getLike = async (postId, userId) => {
    return await Likes.findOne({
        postId,
        userId
    });
};

export const getLikesCount = async (postId) => {
    const count = await Likes.countDocuments({ postId });
    return { count };
};