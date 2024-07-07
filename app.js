const express = require("express");
const multer = require("multer");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const upload = multer();
app.use(cors());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to generate a unique filename based on timestamp
const generateUniqueFileName = () => {
  const timestamp = Date.now();
  return `audio_${timestamp}.mp3`;
};

app.post("/api/downloadAudio", upload.none(), async (req, res) => {
  const videoUrl = decodeURIComponent(req.body?.url);
  console.log("Received URL:", videoUrl);

  try {
    const random = Math.floor(Math.random() * 1000); // Generate random number for filename uniqueness
    const videoPath = path.resolve(__dirname, `temp_video_${random}.mp4`);
    const audioPath = path.resolve(__dirname, generateUniqueFileName());

    // Download the video
    const response = await axios({
      url: videoUrl,
      method: "GET",
      responseType: "stream",
    });

    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);

    writer.on("finish", async () => {
      console.log("Video downloaded successfully");

      // Extract audio from video using fluent-ffmpeg
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .audioCodec("libmp3lame")
            .audioBitrate(128) // Specify the desired bitrate in kbps (e.g., 128 kbps)
            .output(audioPath)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });

        console.log("Audio extracted successfully");

        // Upload audio file to Cloudinary
        const cloudinaryUpload = await cloudinary.uploader.upload(audioPath, {
          folder: "audio",
          resource_type: "auto",
          bit_rate: 128000, // Specify the desired bitrate in bps (e.g., 128 kbps)
        });
        console.log(
          "Audio uploaded to Cloudinary:",
          cloudinaryUpload.secure_url
        );

        // Send the Cloudinary URL to the frontend
        res.status(200).json({
          url: cloudinaryUpload.secure_url,
          status: "success",
        });

        // Cleanup: Delete temporary files
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error in processing request");

        // Cleanup on error: Delete temporary files
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }
    });

    writer.on("error", (err) => {
      console.error("Error in writing file:", err);
      res.status(500).send("Error in downloading video");
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Error in processing request");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
