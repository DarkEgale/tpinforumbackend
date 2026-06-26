import mongoose, { Types } from "mongoose";

const noticeSchema = new mongoose.Schema({
    publisher: {
        type: String,
        required: [true, "Publisher name is required"]
    },
    userId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    targetStudentId: {
        type: mongoose.Types.ObjectId,
        ref: 'Users',
        default: null
    },
    notice: {
        type: String,
        required: true
    },
    title: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        enum: ["all", "computer", "civil", "electrical", "mechanical", "textile"],
        default: "all"
    },
    semester: {
        type: String,
        default: "all"
    },
    attachment: {
        type: String,
        default: ''
    },
    publishDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true })

const Notice = mongoose.model('Notice', noticeSchema)
export default Notice;
