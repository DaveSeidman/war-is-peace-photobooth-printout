import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { print, getPrinters } from 'unix-print';

const app = express();
const PRINT_DIR = path.resolve("./prints");
if (!fs.existsSync(PRINT_DIR)) fs.mkdirSync(PRINT_DIR);

// === Multer setup preserving original filenames and extensions ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRINT_DIR),
  filename: (req, file, cb) => {
    let filename = file.originalname || `print_${Date.now()}`;
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

app.get("/", async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json({
      status: "Print Server Online",
      printers,
      queueLength: queue.length,
      printing: isPrinting,
    });
  } catch (err) {
    res.json({ status: "Online", printers: [], error: err.message });
  }
});

app.post("/print", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("Missing file upload.");

  console.log(`📥 Received: ${req.file.originalname}`);
  queue.push(req.file.path);
  processQueue();

  res.json({ status: "queued", filename: req.file.originalname });
});

// === NEW: /test route to print the most recent file ===
app.get("/test", async (req, res) => {
  try {
    const files = fs.readdirSync(PRINT_DIR)
      .filter(f => f.match(/\.(png|jpg|jpeg)$/i))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(PRINT_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0)
      return res.status(404).json({ error: "No image files found in prints folder." });

    const latest = `prints/${files[0].name}`;
    console.log(`🧪 Test printing latest file: ${latest}`);

    await print(latest, undefined,
      [
        '-o', 'PageSize=dnp4x6',
      ]
    );

    console.log(`✅ Test print job sent: ${latest}`);
    res.json({ success: true, printed: latest });
  } catch (err) {
    console.error("❌ Error in /test route:", err);
    res.status(500).json({ error: err.message });
  }
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
      // const latest = `prints/${files[0].name}`;
      await print(`prints/${filename}`, undefined,
        [
          '-o', 'PageSize=dnp4x6',
        ]
      );
      console.log(`✅ Job sent to printer: ${filename}`);
    } else {
      console.warn(`⚠️ Skipping unsupported file type: ${filename}`);
    }
  } catch (err) {
    console.error(`❌ Print error for ${filename}:`, err);
  } finally {
    isPrinting = false;
    processQueue();
  }
}

app.listen(9000, () => console.log("Print server running on port 9000"));
