import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

import { createPost, getAllPost, singlePost, deletePost } from "./controllers/postController.js";
import { toggleLike, getLike, getLikesCount } from "./controllers/likeController.js";
import { createComment, getComments, deleteComment } from "./controllers/commentcontroller.js";
import { createReport } from "./controllers/reportController.js";
import { registration, login } from "./controllers/authController.js";
import Chat from "./models/chat.js";
import User from "./models/user.js";
import Post from "./models/post.js";
import Notice from "./models/notice.js";
import Result from "./models/report.js";
import Comments from "./models/comments.js";
import Likes from "./models/likes.js";

const app = express();
const JWT_SECRET = process.env.SECRET_KEY || "your-secret-key-here-make-it-strong-in-production";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
});

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));



mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/tpiforum")
    .then(async () => {
        console.log("MongoDB connected");
        await ensureDefaultAdmin();
    })
    .catch(err => console.log("MongoDB error:", err));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: CLIENT_ORIGIN, credentials: true },
});

const publicUserFields = "-password";
const sanitizeUser = (user) => {
    if (!user) return null;
    const safeUser = user.toObject ? user.toObject() : { ...user };
    delete safeUser.password;
    return safeUser;
};

const requireAuth = async (req, res, next) => {
    try {
        const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
        if (!token) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select(publicUserFields);

        if (!user || user.status !== "active") {
            return res.status(403).json({ success: false, message: "Account is not active" });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: "Invalid token" });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: "Permission denied" });
    }
    next();
};

const canManagePost = (user, post) => {
    return user.role === "admin" || String(post.userId?._id || post.userId) === String(user._id);
};

app.get("/api/health", (req, res) => {
    res.json({ success: true, message: "TPINFORUM API is running" });
});

app.post("/api/uploads/cloud", requireAuth, upload.single("file"), async (req, res) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
            return res.status(501).json({
                success: false,
                message: "Cloud uploads are not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to backend/.env."
            });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "A file is required" });
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
        });

        const payload = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "tpinforum",
                    resource_type: "auto",
                    public_id: `${Date.now()}-${req.file.originalname.replace(/[^a-z0-9._-]/gi, "-")}`,
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        const responseData = {
            success: true,
            url: payload.secure_url,
            resourceType: payload.resource_type || (req.file.mimetype.startsWith("video/") ? "video" : "image"),
            publicId: payload.public_id,
        };

        // If a userField is specified (e.g. "profilePicture", "coverPhoto"),
        // automatically update the authenticated user's document with the uploaded URL
        const allowedUserFields = ["profilePicture", "coverPhoto"];
        if (req.body.userField && allowedUserFields.includes(req.body.userField)) {
            const updatedUser = await User.findByIdAndUpdate(
                req.user._id,
                { [req.body.userField]: payload.secure_url },
                { new: true, runValidators: true }
            ).select(publicUserFields);
            responseData.user = sanitizeUser(updatedUser);
        }

        res.status(201).json(responseData);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || "Upload failed" });
    }
});

// Auth
app.post("/api/auth/register", registration);
app.post("/api/auth/login", login);
app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true, message: "Logged out" });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({ success: true, user: sanitizeUser(req.user) });
});

app.put("/api/auth/profile", requireAuth, async (req, res) => {
    const allowed = ["name", "age", "phone", "department", "semester", "formNumber", "rollNumber", "bio", "profilePicture", "coverPhoto", "contactInfo"];
    const updates = {};
    allowed.forEach(key => {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select(publicUserFields);
    res.json({ success: true, user: sanitizeUser(user), message: "Profile updated" });
});

app.put("/api/auth/change-password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    const matches = await bcrypt.compare(currentPassword || "", user.password);
    if (!matches) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: "Password changed" });
});

// Users and role management
app.get("/api/users", requireAuth, async (req, res) => {
    const query = {};
    if (req.query.role) query.role = req.query.role;
    if (req.query.search) {
        query.$or = [
            { name: new RegExp(req.query.search, "i") },
            { email: new RegExp(req.query.search, "i") },
            { department: new RegExp(req.query.search, "i") },
        ];
    }

    if (req.user.role === "student") {
        query.role = { $in: ["student", "teacher"] };
    }

    const users = await User.find(query).select(publicUserFields).sort({ createdAt: -1 });
    res.json({ success: true, users });
});

app.get("/api/users/:userId", requireAuth, async (req, res) => {
    const profile = await User.findById(req.params.userId).select(publicUserFields);
    if (!profile) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user: sanitizeUser(profile) });
});

app.post("/api/admin/teachers", requireAuth, requireRole("admin"), async (req, res) => {
    const { name, email, age, phone, department, semester, password, contactInfo } = req.body;
    const exists = await User.findOne({ $or: [{ email }, { phone }] });
    if (exists) {
        return res.status(400).json({ success: false, message: "Email or phone already exists" });
    }

    const teacher = await User.create({
        name,
        email,
        age: age || "N/A",
        phone,
        department,
        semester: semester || "all",
        contactInfo: contactInfo || "",
        password: await bcrypt.hash(password || "teacher123", 10),
        role: "teacher",
    });

    res.status(201).json({ success: true, user: sanitizeUser(teacher), message: "Teacher created" });
});

app.put("/api/admin/users/:userId/status", requireAuth, requireRole("admin"), async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.userId,
        { status: req.body.status || "active" },
        { new: true, runValidators: true }
    ).select(publicUserFields);
    res.json({ success: true, user, message: "User status updated" });
});

app.put("/api/admin/users/:userId/role", requireAuth, requireRole("admin"), async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.userId,
        { role: req.body.role },
        { new: true, runValidators: true }
    ).select(publicUserFields);
    res.json({ success: true, user, message: "Role updated" });
});

app.delete("/api/admin/users/:userId", requireAuth, requireRole("admin"), async (req, res) => {
    await User.findByIdAndDelete(req.params.userId);
    res.json({ success: true, message: "User deleted" });
});

app.get("/api/admin/analytics", requireAuth, requireRole("admin"), async (req, res) => {
    const [students, teachers, admins, posts, notices, results, chats, calls] = await Promise.all([
        User.countDocuments({ role: "student" }),
        User.countDocuments({ role: "teacher" }),
        User.countDocuments({ role: "admin" }),
        Post.countDocuments(),
        Notice.countDocuments(),
        Result.countDocuments({ type: "result" }),
        Chat.countDocuments(),
        Chat.countDocuments({ fileType: /^call:/ }),
    ]);

    res.json({ success: true, analytics: { students, teachers, admins, posts, notices, results, chats, calls } });
});

// Posts
app.post("/api/create-post", requireAuth, async (req, res) => {
    try {
        const post = await createPost({ ...req.body, userId: req.user._id });
        const populated = await Post.findById(post._id).populate("userId", "name role department profilePicture");
        io.emit("newPost", populated);
        res.status(201).json({ success: true, post: populated });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to create post" });
    }
});

app.get("/api/posts", requireAuth, async (req, res) => {
    try {
        const posts = await getAllPost(req.user._id);
        const postIds = posts.map(post => post._id);
        const [likes, comments] = await Promise.all([
            Likes.aggregate([{ $match: { postId: { $in: postIds } } }, { $group: { _id: "$postId", count: { $sum: 1 } } }]),
            Comments.aggregate([{ $match: { postId: { $in: postIds } } }, { $group: { _id: "$postId", count: { $sum: 1 } } }]),
        ]);
        const likeMap = new Map(likes.map(item => [String(item._id), item.count]));
        const commentMap = new Map(comments.map(item => [String(item._id), item.count]));

        res.json({
            success: true,
            posts: posts.map(post => ({
                ...post.toObject(),
                likesCount: likeMap.get(String(post._id)) || 0,
                commentsCount: commentMap.get(String(post._id)) || 0,
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch posts" });
    }
});

app.get("/api/posts/:postId", requireAuth, async (req, res) => {
    try {
        const post = await singlePost(req.params.postId);
        res.json({ success: true, post });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch post" });
    }
});

app.put("/api/posts/:postId", requireAuth, async (req, res) => {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    if (!canManagePost(req.user, post)) return res.status(403).json({ success: false, message: "Permission denied" });

    const updated = await Post.findByIdAndUpdate(
        req.params.postId,
        { caption: req.body.caption, images: req.body.images || [], video: req.body.video || "", visibility: req.body.visibility || "public" },
        { new: true, runValidators: true }
    ).populate("userId", "name role department profilePicture");
    res.json({ success: true, post: updated, message: "Post updated" });
});

app.delete("/api/posts/:postId", requireAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ success: false, message: "Post not found" });
        if (!canManagePost(req.user, post)) return res.status(403).json({ success: false, message: "Permission denied" });

        await deletePost(req.params.postId);
        await Comments.deleteMany({ postId: req.params.postId });
        await Likes.deleteMany({ postId: req.params.postId });
        res.json({ success: true, message: "Post deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete post" });
    }
});

app.post("/api/posts/:postId/share", requireAuth, async (req, res) => {
    const post = await Post.findByIdAndUpdate(req.params.postId, { $inc: { shares: 1 } }, { new: true });
    res.json({ success: true, post });
});

app.post("/api/posts/:postId/save", requireAuth, async (req, res) => {
    const user = await User.findById(req.user._id);
    const saved = user.savedPosts.some(id => String(id) === req.params.postId);
    user.savedPosts = saved
        ? user.savedPosts.filter(id => String(id) !== req.params.postId)
        : [...user.savedPosts, req.params.postId];
    await user.save();
    res.json({ success: true, saved: !saved, savedPosts: user.savedPosts });
});

// Likes
app.post("/api/likes/toggle", requireAuth, async (req, res) => {
    try {
        const result = await toggleLike(req.body.postId, req.user._id);
        const likesCount = await getLikesCount(req.body.postId);
        io.emit("likeUpdate", { postId: req.body.postId, liked: result.liked, count: likesCount.count });
        res.json({ success: true, ...result, count: likesCount.count });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to toggle like" });
    }
});

app.get("/api/likes/check", requireAuth, async (req, res) => {
    try {
        const like = await getLike(req.query.postId, req.user._id);
        res.json({ success: true, liked: !!like });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to check like" });
    }
});

app.get("/api/likes/count", requireAuth, async (req, res) => {
    try {
        const result = await getLikesCount(req.query.postId);
        res.json({ success: true, count: result.count });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to get likes count" });
    }
});

// Comments and replies
app.post("/api/comments", requireAuth, async (req, res) => {
    try {
        const newComment = await createComment({
            userId: req.user._id,
            postId: req.body.postId,
            comment: req.body.comment,
            parentId: req.body.parentId || null,
        });
        io.emit("newComment", { postId: req.body.postId, comment: newComment });
        res.status(201).json({ success: true, comment: newComment });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to create comment" });
    }
});

app.get("/api/comments", requireAuth, async (req, res) => {
    try {
        const comments = await getComments(req.query.postId);
        res.json({ success: true, comments });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch comments" });
    }
});

app.delete("/api/comments/:commentId", requireAuth, async (req, res) => {
    try {
        const comment = await Comments.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });
        if (req.user.role !== "admin" && String(comment.userId) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }
        await deleteComment(req.params.commentId);
        res.json({ success: true, message: "Comment deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete comment" });
    }
});

// Notices
app.post("/api/notices", requireAuth, requireRole("teacher", "admin"), async (req, res) => {
    const targetStudentId = req.body.targetStudentId || null;
    const notice = await Notice.create({
        publisher: req.user.name,
        userId: req.user._id,
        targetStudentId,
        title: req.body.title,
        notice: req.body.description || req.body.notice,
        department: req.body.department || "all",
        semester: req.body.semester || "all",
        attachment: req.body.attachment || "",
        publishDate: req.body.publishDate || new Date(),
    });
    const populatedNotice = await Notice.findById(notice._id)
        .populate("userId", "name department profilePicture")
        .populate("targetStudentId", "name rollNumber department semester");
    if (targetStudentId) {
        io.to(`user:${targetStudentId}`).emit("noticePublished", populatedNotice);
    } else {
        io.emit("noticePublished", populatedNotice);
    }
    res.status(201).json({ success: true, notice: populatedNotice, message: "Notice published" });
});

app.get("/api/notices", requireAuth, async (req, res) => {
    const query = {};
    if (req.user.role === "student") {
        query.$or = [
            { targetStudentId: req.user._id },
            {
                targetStudentId: null,
                $and: [
                    { $or: [{ department: "all" }, { department: req.user.department }] },
                    { $or: [{ semester: "all" }, { semester: req.user.semester }] },
                ],
            },
            {
                targetStudentId: { $exists: false },
                $and: [
                    { $or: [{ department: "all" }, { department: req.user.department }] },
                    { $or: [{ semester: "all" }, { semester: req.user.semester }] },
                ],
            },
        ];
    } else {
        if (req.query.department) query.department = req.query.department;
        if (req.query.semester) query.semester = req.query.semester;
    }
    const notices = await Notice.find(query)
        .populate("userId", "name department profilePicture")
        .populate("targetStudentId", "name rollNumber department semester")
        .sort({ publishDate: -1, createdAt: -1 });
    res.json({ success: true, notices });
});

app.put("/api/notices/:noticeId", requireAuth, requireRole("teacher", "admin"), async (req, res) => {
    const notice = await Notice.findById(req.params.noticeId);
    if (!notice) return res.status(404).json({ success: false, message: "Notice not found" });
    if (req.user.role !== "admin" && String(notice.userId) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: "Permission denied" });
    }
    Object.assign(notice, {
        title: req.body.title ?? notice.title,
        notice: req.body.description ?? req.body.notice ?? notice.notice,
        department: req.body.department ?? notice.department,
        semester: req.body.semester ?? notice.semester,
        attachment: req.body.attachment ?? notice.attachment,
        publishDate: req.body.publishDate ?? notice.publishDate,
    });
    await notice.save();
    res.json({ success: true, notice, message: "Notice updated" });
});

app.delete("/api/notices/:noticeId", requireAuth, requireRole("teacher", "admin"), async (req, res) => {
    const notice = await Notice.findById(req.params.noticeId);
    if (!notice) return res.status(404).json({ success: false, message: "Notice not found" });
    if (req.user.role !== "admin" && String(notice.userId) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: "Permission denied" });
    }
    await notice.deleteOne();
    res.json({ success: true, message: "Notice deleted" });
});

// Results, stored in the existing report collection with type=result for schema compatibility.
app.post("/api/results", requireAuth, requireRole("teacher", "admin"), async (req, res) => {
    const rollNumber = String(req.body.rollNumber || "").trim();
    if (!rollNumber) {
        return res.status(400).json({ success: false, message: "Roll number is required" });
    }

    const resultStatus = req.body.resultStatus === "failed" ? "failed" : "pass";
    const failedSubjects = resultStatus === "failed"
        ? (Array.isArray(req.body.failedSubjects) ? req.body.failedSubjects : String(req.body.failedSubjects || "").split(","))
            .map(subject => subject.trim())
            .filter(Boolean)
        : [];
    const matchedStudent = await User.findOne({
        role: "student",
        rollNumber: Number.isNaN(Number(rollNumber)) ? rollNumber : Number(rollNumber),
        department: req.body.department,
    }).select(publicUserFields);

    const result = await Result.create({
        userId: req.user._id,
        postId: "result",
        reason: "academic-result",
        type: "result",
        studentId: matchedStudent?._id,
        rollNumber,
        subject: req.body.subject,
        marks: req.body.marks,
        grade: req.body.grade,
        gpa: resultStatus === "pass" && req.body.gpa !== "" ? req.body.gpa : undefined,
        resultStatus,
        failedSubjects,
        semester: req.body.semester,
        department: req.body.department,
    });
    const populatedResult = await Result.findById(result._id).populate("studentId", "name rollNumber department semester");
    if (matchedStudent?._id) {
        io.to(`user:${matchedStudent._id}`).emit("newResult", { result: populatedResult, teacherName: req.user.name });
    }
    res.status(201).json({ success: true, result, message: "Result published" });
});

app.get("/api/results", requireAuth, async (req, res) => {
    const query = { type: "result" };
    if (req.user.role === "student") {
        query.$or = [{ studentId: req.user._id }];
        if (req.user.rollNumber) {
            query.$or.push({
                rollNumber: String(req.user.rollNumber),
                department: req.user.department,
            });
        }
    }
    if (req.user.role !== "student") {
        if (req.query.department) query.department = req.query.department;
        if (req.query.semester) query.semester = req.query.semester;
        if (req.query.studentId) query.studentId = req.query.studentId;
        if (req.query.rollNumber) query.rollNumber = String(req.query.rollNumber).trim();
    }
    const results = await Result.find(query).populate("studentId", "name rollNumber department semester status").sort({ createdAt: -1 });
    res.json({ success: true, results });
});

app.get("/api/results/search", requireAuth, async (req, res) => {
    const rollNumber = String(req.query.rollNumber || "").trim();
    const department = String(req.query.department || "").trim();

    if (!rollNumber || !department) {
        return res.status(400).json({ success: false, message: "Department and roll number are required" });
    }

    const matchedStudents = await User.find({
        role: "student",
        department,
        rollNumber: Number.isNaN(Number(rollNumber)) ? rollNumber : Number(rollNumber),
    }).select("_id");

    const results = await Result.find({
        type: "result",
        department,
        $or: [
            { rollNumber },
            { studentId: { $in: matchedStudents.map((student) => student._id) } },
        ],
    }).populate("studentId", "name rollNumber department semester status").sort({ createdAt: -1 });

    res.json({ success: true, results });
});

app.put("/api/results/:resultId", requireAuth, requireRole("teacher", "admin"), async (req, res) => {
    const rollNumber = String(req.body.rollNumber || "").trim();
    if (!rollNumber) {
        return res.status(400).json({ success: false, message: "Roll number is required" });
    }

    const resultStatus = req.body.resultStatus === "failed" ? "failed" : "pass";
    const failedSubjects = resultStatus === "failed"
        ? (Array.isArray(req.body.failedSubjects) ? req.body.failedSubjects : String(req.body.failedSubjects || "").split(","))
            .map(subject => subject.trim())
            .filter(Boolean)
        : [];
    const matchedStudent = await User.findOne({
        role: "student",
        rollNumber: Number.isNaN(Number(rollNumber)) ? rollNumber : Number(rollNumber),
        department: req.body.department,
    }).select(publicUserFields);

    const result = await Result.findOneAndUpdate(
        { _id: req.params.resultId, type: "result" },
        {
            studentId: matchedStudent?._id,
            rollNumber,
            subject: req.body.subject,
            marks: req.body.marks,
            grade: req.body.grade,
            gpa: resultStatus === "pass" && req.body.gpa !== "" ? req.body.gpa : undefined,
            resultStatus,
            failedSubjects,
            semester: req.body.semester,
            department: req.body.department,
        },
        { new: true, runValidators: true }
    );
    res.json({ success: true, result, message: "Result updated" });
});

app.delete("/api/results/:resultId", requireAuth, requireRole("teacher", "admin"), async (req, res) => {
    await Result.findOneAndDelete({ _id: req.params.resultId, type: "result" });
    res.json({ success: true, message: "Result deleted" });
});

// Reports
app.post("/api/reports", requireAuth, async (req, res) => {
    try {
        await createReport({ userId: req.user._id, postId: req.body.postId, reason: req.body.reason, type: "post-report" });
        res.json({ success: true, message: "Report submitted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to submit report" });
    }
});

// Chat
app.get("/api/chats/:roomId", requireAuth, async (req, res) => {
    const messages = await Chat.find({ roomId: req.params.roomId }).sort({ createdAt: 1 }).limit(200);
    res.json({ success: true, messages });
});

app.post("/api/chats/:roomId/seen", requireAuth, async (req, res) => {
    await Chat.updateMany({ roomId: req.params.roomId, seenBy: { $ne: String(req.user._id) } }, { $addToSet: { seenBy: String(req.user._id) } });
    io.to(req.params.roomId).emit("messagesSeen", { roomId: req.params.roomId, userId: req.user._id });
    res.json({ success: true });
});

// Socket.IO
const onlineUsers = new Map();

io.on("connection", (socket) => {
    socket.on("userOnline", (userId) => {
        if (!userId) return;
        onlineUsers.set(String(userId), socket.id);
        socket.userId = String(userId);
        socket.join(`user:${userId}`);
        io.emit("presenceUpdate", { userId: String(userId), online: true });
    });

    socket.on("joinRoom", (roomId) => {
        socket.join(roomId);
    });

    socket.on("typing", (data) => {
        socket.to(data.roomId).emit("typing", data);
    });

    socket.on("sendMessage", async (data) => {
        try {
            const message = await Chat.create({
                roomId: data.roomId,
                senderId: data.senderId,
                receiverId: data.receiverId || "",
                message: data.message,
                fileUrl: data.fileUrl || "",
                fileType: data.fileType || "",
                seenBy: [String(data.senderId)],
            });
            io.to(data.roomId).emit("receiveMessage", message);
        } catch (error) {
            console.error("Error sending message:", error);
        }
    });

    ["callUser", "callAccepted", "callRejected", "callEnded", "webrtcOffer", "webrtcAnswer", "webrtcIceCandidate"].forEach(eventName => {
        socket.on(eventName, (payload) => {
            const targetSocketId = onlineUsers.get(String(payload.to));
            if (targetSocketId) {
                io.to(targetSocketId).emit(eventName, { ...payload, fromSocketId: socket.id });
            }
        });
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            onlineUsers.delete(socket.userId);
            io.emit("presenceUpdate", { userId: socket.userId, online: false });
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
