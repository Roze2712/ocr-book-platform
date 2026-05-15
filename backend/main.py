from __future__ import annotations

import io
from pathlib import Path
from xml.sax.saxutils import escape

import pytesseract
import reportlab
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

app = FastAPI(title="OCR Book Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_VERA_REGISTERED = False


def _ensure_vera_font() -> None:
    global _VERA_REGISTERED
    if _VERA_REGISTERED:
        return
    fonts_dir = Path(reportlab.__file__).resolve().parent / "fonts"
    vera = fonts_dir / "Vera.ttf"
    if not vera.is_file():
        raise RuntimeError("Bundled Vera font not found; check reportlab install.")
    pdfmetrics.registerFont(TTFont("Vera", str(vera)))
    _VERA_REGISTERED = True


def text_to_pdf_bytes(text: str) -> bytes:
    _ensure_vera_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=72,
        rightMargin=72,
        topMargin=72,
        bottomMargin=72,
    )
    body = ParagraphStyle(
        name="Body",
        fontName="Vera",
        fontSize=11,
        leading=14,
    )
    story: list = []
    for line in text.splitlines():
        if line == "":
            story.append(Spacer(1, 6))
        else:
            story.append(Paragraph(escape(line), body))

    if not story:
        story.append(Spacer(1, 1))

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf


class PdfExportBody(BaseModel):
    text: str = Field("", max_length=500_000)


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, str]:
    """Accept an image, run OCR, and return extracted text."""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        image = Image.open(io.BytesIO(contents))
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="Unsupported or corrupt image.",
        ) from None

    if getattr(image, "mode", None) != "RGB":
        image = image.convert("RGB")

    try:
        text = pytesseract.image_to_string(image)
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Tesseract is not installed or not on PATH.",
        ) from exc
    finally:
        try:
            image.close()
        except Exception:
            pass

    normalized = "\n".join(line.rstrip() for line in text.splitlines())

    return {
        "message": "OK",
        "text": normalized,
    }


@app.post("/export/pdf")
async def export_pdf(body: PdfExportBody) -> StreamingResponse:
    """Build a PDF from plain text."""
    pdf_bytes = text_to_pdf_bytes(body.text)

    buf = io.BytesIO(pdf_bytes)
    headers = {"Content-Disposition": 'attachment; filename="ocr-export.pdf"'}
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers=headers,
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
