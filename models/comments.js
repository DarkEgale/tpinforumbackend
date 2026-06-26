import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    postId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    comment: {
        type: String,
        required: true
    },
    parentId: {
        type: mongoose.Types.ObjectId,
        default: null
    }
}, { timestamps: true })


const Comments = mongoose.model('Comments', commentSchema)

export default Comments;
