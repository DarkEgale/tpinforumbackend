import mongoose from "mongoose";

const likeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    postId: {
        type: mongoose.Types.ObjectId,
        required: true
    }
}, { timestamps: true })

const Likes = mongoose.model('Likes', likeSchema)
export default Likes;