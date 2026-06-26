import mongoose from 'mongoose';


const postSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Types.ObjectId,
        required: [true, 'UserId is required']
    },
    caption: {
        type: String
    },
    images: {
        type: [String]
    },
    video: {
        type: String
    },
    shares: {
        type: Number,
        default: 0
    },
    visibility: {
        type: String,
        enum: ['public', 'department'],
        default: 'public'
    }
}, { timestamps: true })

postSchema.index({
    createdAt: -1,
    userId: 1,
    caption: 1
})

const Post = mongoose.model('Posts', postSchema)
export default Post;
