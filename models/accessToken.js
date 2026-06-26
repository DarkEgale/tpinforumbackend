import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
    userid: {
        type: mongoose.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    token: {
        type: String,
        required: true
    }
}, { timestamps: true })

const AccessToken = mongoose.model('Tokens', tokenSchema)
export default AccessToken;