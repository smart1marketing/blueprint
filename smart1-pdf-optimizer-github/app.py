import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

app = FastAPI(title="Smart 1 PDF Optimizer", version="1.0.0")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

PROFILES = {
    "maximum": {
        "color_dpi": 96,
        "gray_dpi": 96,
        "mono_dpi": 200,
        "jpeg_quality": 65,
    },
    "web": {
        "color_dpi": 150,
        "gray_dpi": 150,
        "mono_dpi": 300,
        "jpeg_quality": 82,
    },
    "high": {
        "color_dpi": 220,
        "gray_dpi": 220,
        "mono_dpi": 400,
        "jpeg_quality": 90,
    },
}


@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


def cleanup_temp_dir(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)


def run_command(command: list[str], timeout: int) -> None:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "Unknown processing error").strip()
        raise RuntimeError(message[-2000:])


@app.post("/optimize")
async def optimize_pdf(
    file: UploadFile = File(...),
    quality: str = Form("web"),
):
    if quality not in PROFILES:
        raise HTTPException(status_code=400, detail="Invalid optimization level.")

    filename = Path(file.filename or "document.pdf").name
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    temp_dir = tempfile.mkdtemp(prefix="smart1_pdf_")
    input_path = Path(temp_dir) / "input.pdf"
    gs_path = Path(temp_dir) / "ghostscript.pdf"
    output_path = Path(temp_dir) / "optimized.pdf"

    try:
        # Stream the upload to disk and enforce a size limit.
        total = 0
        with input_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF exceeds the {MAX_UPLOAD_MB} MB upload limit.",
                    )
                output.write(chunk)

        if total < 5:
            raise HTTPException(status_code=400, detail="The uploaded PDF is empty.")

        with input_path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF.")

        profile = PROFILES[quality]

        # Ghostscript does the heavy image/font compression while retaining
        # searchable text and vector content where possible.
        gs_command = [
            "gs",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.6",
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            "-dDetectDuplicateImages=true",
            "-dCompressFonts=true",
            "-dSubsetFonts=true",
            "-dAutoRotatePages=/None",
            "-dDownsampleColorImages=true",
            "-dColorImageDownsampleType=/Bicubic",
            f"-dColorImageResolution={profile['color_dpi']}",
            "-dDownsampleGrayImages=true",
            "-dGrayImageDownsampleType=/Bicubic",
            f"-dGrayImageResolution={profile['gray_dpi']}",
            "-dDownsampleMonoImages=true",
            "-dMonoImageDownsampleType=/Subsample",
            f"-dMonoImageResolution={profile['mono_dpi']}",
            f"-dJPEGQ={profile['jpeg_quality']}",
            f"-sOutputFile={gs_path}",
            str(input_path),
        ]
        run_command(gs_command, timeout=180)

        # qpdf linearizes and normalizes the output for efficient web delivery.
        try:
            run_command(
                [
                    "qpdf",
                    "--linearize",
                    "--object-streams=generate",
                    str(gs_path),
                    str(output_path),
                ],
                timeout=90,
            )
        except Exception:
            shutil.copy2(gs_path, output_path)

        original_size = input_path.stat().st_size
        optimized_size = output_path.stat().st_size

        # Never return a larger file than the original.
        if optimized_size >= original_size:
            shutil.copy2(input_path, output_path)
            optimized_size = original_size

        savings = 0.0
        if original_size:
            savings = ((original_size - optimized_size) / original_size) * 100

        output_name = f"{Path(filename).stem}-optimized.pdf"

        return FileResponse(
            path=output_path,
            media_type="application/pdf",
            filename=output_name,
            headers={
                "X-Original-Size": str(original_size),
                "X-Optimized-Size": str(optimized_size),
                "X-Savings-Percent": f"{savings:.1f}",
                "Access-Control-Expose-Headers": (
                    "Content-Disposition, X-Original-Size, "
                    "X-Optimized-Size, X-Savings-Percent"
                ),
            },
            background=BackgroundTask(cleanup_temp_dir, temp_dir),
        )

    except HTTPException:
        cleanup_temp_dir(temp_dir)
        raise
    except subprocess.TimeoutExpired:
        cleanup_temp_dir(temp_dir)
        raise HTTPException(status_code=408, detail="PDF optimization timed out.")
    except Exception as exc:
        cleanup_temp_dir(temp_dir)
        raise HTTPException(status_code=500, detail=f"Optimization failed: {exc}")
    finally:
        await file.close()
