# Smart 1 Image Optimizer

Embeddable Flask image optimizer for GIF, JPG/JPEG, and PNG. The default target is 150 KB and the original format is preserved. Animated GIFs remain animated.

## GitHub

Upload the contents of this folder to the root of a GitHub repository, for example `smart1-image-optimizer`.

## Render — recommended Docker setup

Create **New > Web Service**, connect the GitHub repository, then use:

- **Language / Runtime:** Docker
- **Branch:** main
- **Root Directory:** leave blank if these files are at the repo root
- **Dockerfile Path:** `./Dockerfile`
- **Docker Build Context Directory:** `.`
- **Build Command:** leave blank / not applicable for Docker
- **Start Command / Docker Command:** leave blank; the Dockerfile `CMD` starts Gunicorn
- **Health Check Path:** `/health`
- **Auto Deploy:** On Commit

The Dockerfile runs:

```bash
gunicorn app:app --bind 0.0.0.0:${PORT} --workers 2 --threads 4 --timeout 120
```

Render provides `PORT` automatically. The Dockerfile defaults it to `10000` for local use.

## Render environment variables

None are secret or strictly required. Recommended:

```env
MAX_UPLOAD_MB=40
DEFAULT_TARGET_KB=150
BRAND_NAME=Smart 1 Marketing
APP_NAME=Image Optimizer
```

Do **not** manually set `PORT` unless you have a specific reason.

## Local Docker test

```bash
docker build -t smart1-image-optimizer .
docker run --rm -p 10000:10000 smart1-image-optimizer
```

Then open `http://localhost:10000`.

## API

`POST /api/optimize`

Multipart fields:

- `file`: GIF, JPG, JPEG, or PNG
- `target_kb`: optional integer; defaults to `DEFAULT_TARGET_KB`

## Smart 1 Suite iframe

After Render deploys the app, embed the service URL in an HTML/code block:

```html
<iframe
  src="https://YOUR-SERVICE.onrender.com/"
  width="100%"
  height="650"
  style="border:0;border-radius:16px;overflow:hidden"
  loading="lazy"
></iframe>
```

## Cloudinary

Cloudinary is not required for strict 150 KB compression. Add it later only if you want permanent hosted assets, a media library, CDN delivery, or alternate derivative formats.
