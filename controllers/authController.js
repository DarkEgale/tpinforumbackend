import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import AccessToken from '../models/accessToken.js';

const JWT_SECRET = process.env.SECRET_KEY || 'your-secret-key-here-make-it-strong-in-production';


// Registration Controller

export const registration = async (req, res) => {
    try {
        const {
            name,
            email,
            age,
            phone,
            department,
            semester,
            formNumber,
            rollNumber,
            password
        } = req.body
        const user = await User.findOne({ email: email })
        if (user) {
            return res.status(400)
                .json({
                    success: false,
                    message: "User already exists"
                })
        }
        const checkPhone = await User.findOne({ phone: phone })
        if (checkPhone) {
            return res.status(400)
                .json({
                    success: false,
                    message: "Phone number is already in use"
                })
        }
        if (password.length < 6) {
            return res.status(400)
                .json({
                    success: false,
                    message: "Password can't less than 6 "
                })
        }
        const salt = await bcrypt.genSalt(10)
        const hash = await bcrypt.hash(password, salt)
        //create user in database
        const userData = await User.create({
            name: name,
            email: email,
            age: age,
            phone: phone,
            department: department,
            semester: semester || "1",
            rollNumber: rollNumber,
            formNumber: formNumber,
            password: hash,
            role: 'student'
        })
        //create jwt token 
        const token = jwt.sign({ id: userData._id }, JWT_SECRET, { expiresIn: '7d' })
        const cookieOptions = {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
        // save token in database
        await AccessToken.create({
            userid: userData._id,
            token: token
        })
        //response send
        const safeUser = userData.toObject();
        delete safeUser.password;

        return res.cookie('token', token, cookieOptions)
            .status(201)
            .json({
                success: true,
                message: "Registration successful",
                user: safeUser
            })
    } catch (error) {
        res.status(500)
            .json({
                success: false,
                message: "Internal Server Error"
            })
        console.error("Error in Registration Controller:", error)
    }
}



//Login Controller

export const login = async (req, res) => {
    try {
        const { email, password } = req.body
        let user = await User.findOne({
            $or: [
                { email: email },
                { phone: email }
            ]
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "wrong email/phone or password"
            });
        }
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) {
            return res.status(401)
                .json({
                    success: false,
                    message: "wrong email/phone or password"
                })
        }

        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: "Your account is not active"
            });
        }

        //create jwt token 
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })
        const cookieOptions = {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
        // save token in database
        await AccessToken.create({
            userid: user._id,
            token: token
        })
        //response send

        const safeUser = user.toObject();
        delete safeUser.password;

        return res.cookie('token', token, cookieOptions)
            .status(200)
            .json({
                success: true,
                message: "Login successful",
                user: safeUser
            })

    } catch (error) {
        res.status(500)
            .json({
                success: false,
                message: "Internal Server Error"
            })
        console.error("Error in Login controller:", error)
    }
}
