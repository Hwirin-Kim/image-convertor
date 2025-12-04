const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 4000;

// 업로드 임시 저장소
const upload = multer({ storage: multer.memoryStorage() });

// 정적 파일 서빙
app.use(express.static("public"));
app.use(express.json());

// 출력 폴더 기본값
let outputDir = path.join(__dirname, "converted");

// 출력 폴더 확인/생성
function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 출력 폴더 변경 API
app.post("/api/set-output", (req, res) => {
  const { outputPath } = req.body;
  if (outputPath) {
    outputDir = path.resolve(outputPath);
    ensureOutputDir(outputDir);
    res.json({ success: true, outputDir });
  } else {
    res.status(400).json({ error: "출력 경로가 필요합니다" });
  }
});

// 현재 출력 폴더 조회
app.get("/api/output-dir", (req, res) => {
  ensureOutputDir(outputDir);
  res.json({ outputDir });
});

// 이미지 변환 API
app.post("/api/convert", upload.array("images"), async (req, res) => {
  try {
    const { format, quality, compression } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "이미지 파일이 필요합니다" });
    }

    ensureOutputDir(outputDir);

    const results = [];

    for (const file of files) {
      // multer 한글 파일명 인코딩 문제 해결
      const decodedName = Buffer.from(file.originalname, "latin1").toString(
        "utf8"
      );
      const normalizedName = decodedName.normalize("NFC");
      const originalName = path.parse(normalizedName).name;
      const outputFileName = `${originalName}.${format}`;
      const outputPath = path.join(outputDir, outputFileName);

      let sharpInstance = sharp(file.buffer);

      // 포맷별 옵션 설정
      switch (format) {
        case "jpeg":
        case "jpg":
          sharpInstance = sharpInstance.jpeg({
            quality: parseInt(quality) || 80,
            mozjpeg: true, // 더 나은 압축률
          });
          break;

        case "png":
          sharpInstance = sharpInstance.png({
            quality: parseInt(quality) || 80,
            compressionLevel: parseInt(compression) || 6, // 0-9
            palette: parseInt(quality) < 50, // 낮은 품질일 때 팔레트 모드
          });
          break;

        case "webp":
          sharpInstance = sharpInstance.webp({
            quality: parseInt(quality) || 80,
            effort: parseInt(compression) || 4, // 0-6 (높을수록 더 좋은 압축, 느림)
            lossless: parseInt(quality) >= 100,
          });
          break;

        case "avif":
          sharpInstance = sharpInstance.avif({
            quality: parseInt(quality) || 50,
            effort: parseInt(compression) || 4, // 0-9
            lossless: parseInt(quality) >= 100,
          });
          break;

        case "tiff":
          sharpInstance = sharpInstance.tiff({
            quality: parseInt(quality) || 80,
            compression: "lzw",
          });
          break;

        case "gif":
          sharpInstance = sharpInstance.gif({
            effort: parseInt(compression) || 7, // 1-10
          });
          break;

        default:
          return res.status(400).json({ error: "지원하지 않는 포맷입니다" });
      }

      // 파일 저장
      const info = await sharpInstance.toFile(outputPath);

      results.push({
        original: normalizedName,
        converted: outputFileName,
        size: info.size,
        width: info.width,
        height: info.height,
        path: outputPath,
      });
    }

    res.json({
      success: true,
      count: results.length,
      outputDir,
      results,
    });
  } catch (error) {
    console.error("변환 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 출력 폴더 열기 (macOS)
app.post("/api/open-folder", (req, res) => {
  const { exec } = require("child_process");
  exec(`open "${outputDir}"`, (error) => {
    if (error) {
      res.status(500).json({ error: "폴더를 열 수 없습니다" });
    } else {
      res.json({ success: true });
    }
  });
});

// 서버 시작
app.listen(PORT, () => {
  ensureOutputDir(outputDir);
  console.log(`\n🖼️  이미지 컨버터 서버 실행 중`);
  console.log(`📂 출력 폴더: ${outputDir}`);
  console.log(`🌐 브라우저에서 열기: http://localhost:${PORT}\n`);
});
