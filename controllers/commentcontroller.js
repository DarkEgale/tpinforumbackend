import Comments from "../models/comments.js";

export const createComment = async (data) => {
    try {
        const { userId, postId, comment, parentId } = data;
        const newComment = await Comments.create({
            userId,
            postId,
            comment,
            parentId: parentId || null
        });
        return newComment;
    } catch (error) {
        console.error("Error in create comment: ", error);
        throw error;
    }
};

export const getComments = async (postId) => {
    try {
        const comments = await Comments.find({ postId }).populate('userId', 'name role profilePicture').sort({ createdAt: 1 });
        return comments;
    } catch (error) {
        console.error("Error fetching comments: ", error);
        throw error;
    }
};

export const deleteComment = async (commentId) => {
    try {
        const comment = await Comments.findByIdAndDelete(commentId);
        return comment;
    } catch (error) {
        console.error("Error deleting comment: ", error);
        throw error;
    }
};
