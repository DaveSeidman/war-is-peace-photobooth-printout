import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import pdfToPrinter from "pdf-to-printer";

const { print } = pdfToPrinter;

const app = express();
const PRINT_DIR = path.resolve("./prints");
if (!fs.existsSync(PRINT_DIR)) fs.mkdirSync(PRINT_DIR);

// === Multer setup preserving original filenames and extensions ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRINT_DIR),
  filename: (req, file, cb) => {
    // preserve original filename if available
    let filename = file.originalname || `print_${Date.now()}`;
    // ensure it has a valid extension
    const mime = file.mimetype?.toLowerCase() || "";
    const ext = path.extname(filename).toLowerCase();

    if (!ext) {
      if (mime.includes("png")) filename += ".png";
      else if (mime.includes("jpeg") || mime.includes("jpg")) filename += ".jpg";
      else filename += ".bin";
    }

    cb(null, filename);
  },
});
const upload = multer({ storage });

// === Queue setup ===
const queue = [];
let isPrinting = false;

app.get("/", (req, res) => {
  res.send("Print Server Online");
});

app.post("/print", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("Missing file upload.");

  console.log(`📥 Received: ${req.file.originalname}`);
  queue.push(req.file.path);
  processQueue();

  res.json({ status: "queued", filename: req.file.originalname });
});

async function processQueue() {
  if (isPrinting || queue.length === 0) return;
  isPrinting = true;

  const filePath = queue.shift();
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();

  try {
    console.log(`🖨️ Printing ${filename}`);
    if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      await print(filePath, { 
        scale: "noscale",
        orientation: "portrait"
      });
    } else {
      console.warn(`⚠️ Skipping unsupported file type: ${filename}`);
    }
    console.log(`✅ Finished printing ${filename}`);
  } catch (err) {
    console.error(`❌ Print error for ${filename}:`, err.message);
  } finally {
    // optional cleanup after printing
    // fs.unlink(filePath, () => {});
    isPrinting = false;
    processQueue(); // move to next job
  }
}

app.listen(8000, () => console.log("Print server running on port 8000"));
