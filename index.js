import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import pdfToPrinter from "pdf-to-printer";
import PDFDocument from "pdfkit";

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
    console.log(`🖨️ Preparing ${filename}`);

    // Accept only images
    if (![".png", ".jpg", ".jpeg"].includes(ext)) {
      console.warn(`⚠️ Skipping unsupported file type: ${filename}`);
      isPrinting = false;
      return processQueue();
    }

    // Build a precise 4x6in PDF (points = 1/72")
    const pdfPath = filePath.replace(ext, ".pdf");
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [288, 432],   // 4in x 6in in points
        margins: { top: 0, left: 0, right: 0, bottom: 0 }
      });
      const out = fs.createWriteStream(pdfPath);
      out.on("finish", resolve);
      out.on("error", reject);
      doc.pipe(out);

      // Each strip is 2in x 6in -> 144 x 432 pt
      // Left strip
      doc.image(filePath, 0, 0, { fit: [144, 432], align: "left", valign: "top" } );
      // Right strip
      doc.image(filePath, 144, 0, { fit: [144, 432], align: "left", valign: "top" } );

      doc.end();
    });

    // Print the PDF (drivers are MUCH happier with PDFs)
    console.log(`🖨️ Printing PDF ${path.basename(pdfPath)}`);
    await print(pdfPath, {
      // optional: specify the printer if needed -> printer: "Your Printer Name",
      scale: "noscale"
    });

    console.log(`✅ Finished printing ${path.basename(pdfPath)}`);
  } catch (err) {
    console.error(`❌ Print error for ${filename}:`, err.message);
  } finally {
    // Optional cleanup: keep originals for audit, or delete after successful print
    // fs.unlink(filePath, () => {});
    // fs.unlink(pdfPath, () => {});
    isPrinting = false;
    processQueue();
  }
}

app.listen(8000, () => console.log("Print server running on port 8000"));
