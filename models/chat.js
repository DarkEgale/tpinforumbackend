import mongoose from 'mongoose';


const chatSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true
    },
    senderId: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    receiverId: {
        type: String,
        default: ''
    },
    fileUrl: {
        type: String,
        default: ''
    },
    fileType: {
        type: String,
        default: ''
    },
    seenBy: [{
        type: String
    }]
}, { timestamps: true })


const Chat = mongoose.model('Chat', chatSchema)
export default Chat;
