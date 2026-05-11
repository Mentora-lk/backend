const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('🔧 Cloudinary Config:');
console.log('  Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✓ Set' : '✗ Missing');
console.log('  API Key:', process.env.CLOUDINARY_API_KEY ? '✓ Set' : '✗ Missing');
console.log('  API Secret:', process.env.CLOUDINARY_API_SECRET ? '✓ Set' : '✗ Missing');

const uploadToCloudinary = (fileBuffer, folderName, fileName = null) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = { 
      folder: folderName,
      resource_type: 'auto', // Automatically detect file type (image, video, raw, etc.)
      timeout: 60000 // 60 second timeout
    };

    // Add original filename if provided
    if (fileName) {
      uploadOptions.public_id = fileName.replace(/\.[^/.]+$/, ''); // Remove extension for public_id
    }

    console.log('📤 Starting Cloudinary upload to folder:', folderName);

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error.message);
          console.error('   Error code:', error.status);
          console.error('   Full error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload successful:', result.secure_url);
          resolve(result.secure_url);
        }
      }
    );

    stream.on('error', (err) => {
      console.error('❌ Stream error:', err.message);
      reject(err);
    });

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

module.exports = { uploadToCloudinary };
