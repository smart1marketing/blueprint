# Smart 1 Image Optimizer

Small Flask web app that accepts GIF, JPG/JPEG, and PNG files and returns the same format at or below a target file size (150 KB by default).

## How it works

- JPEG: binary-searches JPEG quality, then reduces dimensions only if needed.
- PNG: uses lossless PNG optimization, then pngquant/palette reduction, then reduces dimensions only if needed.
- GIF: uses gifsicle `--optimize=3` plus progressive lossy compression, then reduces dimensions only if needed. Animation is preserved.
- Files already below the target are returned unchanged.

## Local run with Docker

```bash
docker build -t smart1-image-optimizer .
docker run --rm -p 10000:10000 smart1-image-optimizer
```

Open http://localhost:10000

## Deploy to Render

1. Create a GitHub repository and upload this project.
2. In Render choose **New > Web Service** and connect the GitHub repository.
3. Render detects the Dockerfile. Use the Docker runtime.
4. Health check path: `/health`.
5. Deploy.

The included `render.yaml` can also be used as a Render Blueprint.

## API

`POST /api/optimize`

Multipart fields:
- `file`: GIF, JPG, JPEG, or PNG
- `target_kb`: optional integer, defaults to `150`

The optimized image is returned as a download. Response headers include original bytes, optimized bytes, savings percent, and output dimensions.

## Cloudinary

Cloudinary is optional for this project. The optimizer itself should run on Render because a strict 150 KB cap requires checking the actual output bytes and retrying compression settings. Cloudinary is useful later if you want to upload final optimized files and return a hosted URL, maintain an asset library, or generate alternate delivery formats.
