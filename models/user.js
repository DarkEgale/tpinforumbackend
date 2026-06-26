import mongoose from "mongoose";



const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required']
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true
    },
    age: {
        type: String,
        required: [true, "Age is required"]
    },
    phone: {
        type: String,
        required: [true, "Phone is Required"],
        unique: [true, "Phone number is already in use"]
    },
    department: {
        type: String,
        required: [true, "Department is required"],
        enum: ["computer", "civil", "electrical", "mechanical", "textile"]
    },
    semester: {
        type: String,
        default: "1"
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    formNumber: {
        type: String,
    },
    rollNumber: {
        type: Number
    },
    role: {
        type: String,
        enum: ['student', 'admin', 'teacher'],
        default: 'student'
    },
    status: {
        type: String,
        enum: ['active', 'suspended', 'blocked'],
        default: 'active'
    },
    bio: {
        type: String,
        default: ''
    },
    profilePicture: {
        type: String,
        default: ''
    },
    coverPhoto: {
        type: String,
        default: ''
    },
    contactInfo: {
        type: String,
        default: ''
    },
    following: [{
        type: mongoose.Types.ObjectId,
        ref: 'Users'
    }],
    savedPosts: [{
        type: mongoose.Types.ObjectId,
        ref: 'Posts'
    }]
}, { timestamps: true })


const User = mongoose.model("Users", userSchema)
export default User;
