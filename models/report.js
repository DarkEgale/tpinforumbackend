import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    postId: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    studentId: {
        type: mongoose.Types.ObjectId,
        ref: 'Users'
    },
    rollNumber: {
        type: String,
        trim: true,
        default: ''
    },
    subject: {
        type: String,
        default: ''
    },
    marks: {
        type: Number
    },
    grade: {
        type: String,
        default: ''
    },
    gpa: {
        type: Number
    },
    resultStatus: {
        type: String,
        enum: ['pass', 'failed'],
        default: 'pass'
    },
    failedSubjects: [{
        type: String,
        trim: true
    }],
    semester: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['post-report', 'result'],
        default: 'post-report'
    }
}, { timestamps: true })

const Report = mongoose.model('Reports', reportSchema)
export default Report;
