import Post from '../models/post.js';
import Report from '../models/report.js';

export const createPost = async (postData) => {
    try {
        const post = await Post.create(postData);
        return post;
    } catch (error) {
        console.log(error);
        throw error;
    }
};

export const singlePost = async (postId) => {
    try {
        const post = await Post.findById(postId).populate('userId', 'name role department profilePicture');
        return post;
    } catch (error) {
        console.log(error);
        throw error;
    }
};

export const getAllPost = async (userId) => {
    try {
        // Get all posts except those reported by this user
        const reportedPosts = await Report.find({ userId }).select('postId');
        const reportedPostIds = reportedPosts.map(r => r.postId);

        const posts = await Post.find({
            _id: { $nin: reportedPostIds }
        }).populate('userId', 'name role department profilePicture').sort({ createdAt: -1 });

        return posts;
    } catch (error) {
        console.log(error);
        throw error;
    }
};

export const deletePost = async (postId) => {
    try {
        const post = await Post.findByIdAndDelete(postId);
        return post;
    } catch (error) {
        console.log(error);
        throw error;
    }
};
