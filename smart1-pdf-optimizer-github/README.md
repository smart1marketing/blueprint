# Smart 1 PDF Optimizer

A small FastAPI web app for optimizing uploaded PDF files.

## Features

- Upload a PDF from a browser
- Three optimization profiles
- Ghostscript image/font compression
- qPDF linearization
- Preserves searchable text/vector graphics where possible
- Does not return a file larger than the original
- Temporary files are deleted after the download response
- Health endpoint at `/health`
- 100 MB upload limit by default

## Recommended Render deployment

This project includes a `Dockerfile` because the optimizer needs the system packages
Ghostscript and qPDF.

1. Create a GitHub repository.
2. Upload all files from this project to the repository root.
3. In Render choose **New > Web Service**.
4. Connect the GitHub repository.
5. Set **Language/Runtime: Docker**.
6. The `Dockerfile` should be detected automatically.
7. Deploy.

For a Docker service, Render builds the Dockerfile automatically and starts the
container using the Dockerfile `CMD`. You do not need to enter separate Build
Command or Start Command fields.

The command used inside the container is:

    uvicorn app:app --host 0.0.0.0 --port $PORT

## Environment variables

Optional:

- `MAX_UPLOAD_MB=100`

## Optimization profiles

- `maximum`: 96 DPI color/grayscale, JPEG quality 65
- `web`: 150 DPI color/grayscale, JPEG quality 82
- `high`: 220 DPI color/grayscale, JPEG quality 90

## Notes

PDF compression varies significantly by source file. Image-heavy PDFs usually
shrink much more than PDFs that are already optimized or mostly vector/text.
