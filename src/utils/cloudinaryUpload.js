const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = (fileBuffer, folderName, fileName = null) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = { 
      folder: folderName,
      resource_type: 'auto' // Automatically detect file type (image, video, raw, etc.)
    };

    // Add original filename if provided
    if (fileName) {
      uploadOptions.public_id = fileName.replace(/\.[^/.]+$/, ''); // Remove extension for public_id
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (result) {
          resolve(result.secure_url);
        } else {
          reject(error);
        }
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

module.exports = { uploadToCloudinary };
