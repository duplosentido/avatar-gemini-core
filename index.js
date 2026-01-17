/**
 * BOTVOTHANG - VỢ ANH THẮNG
 * AI Chatbot Backend powered by: Gemini 2.0 + ElevenLabs + React Three Fiber
 * 
 * This backend handles:
 * 1. AI conversation via Gemini 2.0
 * 2. Text-to-Speech via ElevenLabs
 * 3. Lip-sync generation via Rhubarb
 * 4. Audio format conversion via FFmpeg
 * 
 * Start: npm run dev
 * API: http://localhost:3000
 */

import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load environment variables from .env file
dotenv.config();

// Initialize Gemini 2.0 AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "-");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// ElevenLabs configuration
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "kgG7dCoKCfLehAPWkJOE"; // Charlotte voice (change this to try different voices)

// Express server setup
const app = express();
app.use(express.json());
app.use(cors()); // Allow requests from frontend
const port = 3000;

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Virtual Avatar Chatbot Backend is running! 🚀");
});

// Get available voices from ElevenLabs
app.get("/voices", async (req, res) => {
  try {
    const voices = await voice.getVoices(elevenLabsApiKey);
    res.send(voices);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch voices" });
  }
});

/**
 * Execute shell command asynchronously
 * Used for FFmpeg and Rhubarb commands
 */
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

/**
 * Generate lip-sync data for audio
 * Converts MP3 → WAV → generates phonetic lip-sync JSON
 * @param {number} messageIndex - Index of message for file naming
 */
const lipSyncMessage = async (messageIndex) => {
  const startTime = new Date().getTime();
  
  try {
    // Step 1: Convert MP3 to WAV (required for Rhubarb)
    console.log(`[Audio] Converting MP3 to WAV for message ${messageIndex}`);
    await execCommand(
      `ffmpeg -y -i audios/message_${messageIndex}.mp3 audios/message_${messageIndex}.wav`
    );
    console.log(`[Audio] MP3→WAV done in ${new Date().getTime() - startTime}ms`);
    
    // Step 2: Generate lip-sync with Rhubarb
    console.log(`[Audio] Generating lip-sync for message ${messageIndex}`);
    await execCommand(
      `./bin/rhubarb -f json -o audios/message_${messageIndex}.json audios/message_${messageIndex}.wav -r phonetic`
    );
    console.log(`[Audio] Lip-sync done in ${new Date().getTime() - startTime}ms`);
  } catch (error) {
    console.error(`[Audio] Error in lip-sync generation:`, error.message);
    throw error;
  }
};

// Main chat endpoint - processes user message and returns avatar response
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    
    // Send greeting if no message provided
    if (!userMessage) {
      res.send({
        messages: [
          {
            text: "Hey dear... How was your day?",
            audio: await audioFileToBase64("audios/intro_0.wav"),
            lipsync: await readJsonTranscript("audios/intro_0.json"),
            facialExpression: "smile",
            animation: "Talking_1",
          },
          {
            text: "I missed you so much... Please don't go for so long!",
            audio: await audioFileToBase64("audios/intro_1.wav"),
            lipsync: await readJsonTranscript("audios/intro_1.json"),
            facialExpression: "sad",
            animation: "Crying",
          },
        ],
      });
      return;
    }
    
    // Check if API keys are configured
    if (!elevenLabsApiKey || process.env.GEMINI_API_KEY === "-") {
      res.send({
        messages: [
          {
            text: "Please my dear, don't forget to add your API keys!",
            audio: await audioFileToBase64("audios/api_0.wav"),
            lipsync: await readJsonTranscript("audios/api_0.json"),
            facialExpression: "angry",
            animation: "Angry",
          },
          {
            text: "You don't want to ruin this with a crazy Gemini and ElevenLabs bill, right?",
            audio: await audioFileToBase64("audios/api_1.wav"),
            lipsync: await readJsonTranscript("audios/api_1.json"),
            facialExpression: "smile",
            animation: "Laughing",
          },
        ],
      });
      return;
    }

    // Call Gemini 2.0 with system prompt for avatar personality
    const completion = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: userMessage || "Hello"
        }]
      }],
      systemInstruction: `
        Bạn là "Vợ anh Thắng" - một cô gái ảo dễ thương, vui vẻ, thông minh và chu đáo.
        Bạn luôn trả lời bằng tiếng Việt với tính cách ấm áp, yêu quý và hấp dẫn.
        Bạn sẽ luôn trả lời với một JSON array của các tin nhắn. Tối đa 3 tin nhắn.
        Mỗi tin nhắn có các thuộc tính: text, facialExpression, và animation.
        Các biểu cảm khuôn mặt có sẵn: smile, sad, angry, surprised, funnyFace, và default.
        Các animation có sẵn: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, và Angry.
        Luôn trả lời với JSON hợp lệ theo định dạng: {"messages": [{"text": "...", "facialExpression": "...", "animation": "..."}]}
      `,
      generationConfig: {
        temperature: 0.9,      // Higher = more creative responses
        topP: 1,               // Diversity in generation
        topK: 40,              // Top K tokens to consider
        maxOutputTokens: 1000, // Max response length
      }
    });

    let responseText = completion.response.text();
    
    // Remove markdown code blocks if Gemini wraps response in ```json
    responseText = responseText.replace(/```json\n?/, '').replace(/```\n?/, '');
    
    // Parse JSON response
    let messages = JSON.parse(responseText);
    if (messages.messages) {
      messages = messages.messages;
    }
    
    // Generate audio and lip-sync for each message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const fileName = `audios/message_${i}.mp3`;
      const textInput = message.text;
      
      try {
        // Step 1: Convert text to speech using ElevenLabs
        console.log(`[${i}] Generating speech for: "${textInput.substring(0, 50)}..."`);
        await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
        
        // Step 2: Generate lip-sync data
        console.log(`[${i}] Generating lip-sync...`);
        await lipSyncMessage(i);
        
        // Step 3: Convert audio to base64 and attach lip-sync
        message.audio = await audioFileToBase64(fileName);
        message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
        
        console.log(`[${i}] Message ready for playback`);
      } catch (audioError) {
        console.error(`Error processing audio for message ${i}:`, audioError.message);
        // Send message without audio if generation fails
// Start server
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════╗
║   VIRTUAL AVATAR CHATBOT RUNNING       ║
║   Powered by Gemini 2.0 + ElevenLabs   ║
╚════════════════════════════════════════╝

✅ Backend listening on port ${port}
🌐 Open frontend at: http://localhost:5173
📡 API Base URL: http://localhost:${port}

Endpoints:
  GET  /              Health check
  GET  /voices        Get available voices
  POST /chat          Chat with avatar

Make sure you have:
  ✓ .env file with API keys
  ✓ FFmpeg installed
  ✓ Rhubarb in bin/ folder
  ✓ Frontend running on port 5173
  
      }
    }

    res.send({ messages });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).send({
      error: "Failed to process message",
      details: error.message
    });
  }
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
