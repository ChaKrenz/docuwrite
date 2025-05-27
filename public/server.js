// server.js
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// Use CORS middleware to allow requests from your frontend origin
// IMPORTANT: Replace 'http://127.0.0.1:5500' with the actual origin of your editor.html
// For example, if hosted on Firebase, it might be 'https://your-project-id.web.app'
const allowedOrigins = [
    'https://wordwithai.web.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: allowedOrigins
}));
app.use(express.json()); // Enable JSON body parsing

const API_KEY = process.env.GEMINI_API_KEY; // Get API key from environment variable
const genAI = new GoogleGenerativeAI(API_KEY);

// Define the /ai-assist endpoint
app.post('/ai-assist', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required.' });
        }

        // For text-only input, use the gemini-pro model
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ assistedText: text });

    } catch (error) {
        console.error('Error during AI assistance:', error);
        if (error.response && error.response.status) {
            // Handle specific API errors
            res.status(error.response.status).json({
                error: `AI API Error: ${error.response.status} - ${error.message || 'An unknown error occurred with the AI API.'}`,
                details: error.response.data // Include more details if available
            });
        } else {
            res.status(500).json({ error: 'Failed to get AI assistance due to a server error.' });
        }
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});