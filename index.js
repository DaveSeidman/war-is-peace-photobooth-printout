import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { print } from "pdf-to-printer";

const app = express();
const PRINT_DIR = path.resolve("./prints");
if (!fs.existsSync(PRINT_DIR)) fs.mkdirSync(PRINT_DIR);

// Multer handles incoming image uploads
const upload = multer({ dest: PRINT_DIR });

// Simple print queue
const queue = [];
let isPrinting = false;

app.post("/print", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("Missing file upload.");

  // Push file info to queue
  queue.push(req.file.path);
  processQueue();

  res.json({ status: "queued", filename: req.file.originalname });
});

async function processQueue() {
  if (isPrinting || queue.length === 0) return;
  isPrinting = true;

  const filePath = queue.shift();

  try {
    console.log(`Printing ${filePath}`);
    await print(filePath, { scale: "noscale" });
    console.log(`Finished printing ${filePath}`);
  } catch (err) {
    console.error("Print error:", err);
  } finally {
    fs.unlink(filePath, () => { }); // cleanup
    isPrinting = false;
    processQueue(); // continue next job
  }
}

app.listen(9000, () => console.log("Print server running on port 9000"));
