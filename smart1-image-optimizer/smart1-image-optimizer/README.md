# Smart 1 Image Optimizer & Resizer

A drop-in Flask/Render image utility that:

- Uploads PNG, JPG/JPEG, and GIF files
- Includes an interactive drag-to-crop tool
- Supports freeform, square, 16:9, 4:5, and 1.91:1 crop presets
- Resizes by width and height
- Locks aspect ratio
- Includes common size presets
- Saves as PNG, JPG, or GIF
- Optimizes toward a target size, defaulting to 150 KB
- Preserves animated GIFs when output is GIF
- Flattens transparent images onto white when converting to JPG

## Render settings

- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app`
- Health check: `/health`

The included `render.yaml` can configure these automatically.

## Replace the existing deployment

1. Back up the existing GitHub repository.
2. Copy these files into the repository root.
3. Commit and push.
4. In Render, redeploy the latest commit.
5. Confirm `/health` returns `{"status":"ok"}`.
6. Test PNG, JPG, static GIF, and animated GIF output.

## Notes

A strict 150 KB limit cannot always be met without changing image dimensions. When optimization is enabled, the app first adjusts JPG quality, then progressively reduces dimensions when needed. PNG and GIF compression may also require dimension reduction.
