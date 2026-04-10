"""
ML Extractor service — dual-mode entry point.

Lambda mode  (ML_EXTRACTOR_MODE=lambda):
    Invoked directly by main backend Lambda via boto3.
    Handler receives { "pdf_bytes": "<base64>" } and returns extraction result.

HTTP mode (ML_EXTRACTOR_MODE=http, future ECS Fargate):
    Runs as a FastAPI app on port 8001.
    POST /extract accepts multipart PDF upload.
    Switch modes by changing ML_EXTRACTOR_MODE env var — zero code changes needed.
"""

import base64
import json
import os

from pdf_processor import extract as semantic_extract

# ── Lambda handler ─────────────────────────────────────────────────────────────

def handler(event, context):
    """AWS Lambda entry point."""
    try:
        pdf_b64 = event.get("pdf_bytes")
        if not pdf_b64:
            return {"statusCode": 400, "body": {"error": "pdf_bytes required"}}

        pdf_bytes = base64.b64decode(pdf_b64)
        result = semantic_extract(pdf_bytes)

        # Serialize date objects to ISO strings for JSON transport
        for key in ("invoice_date", "due_date"):
            if result.get(key) and hasattr(result[key], "isoformat"):
                result[key] = result[key].isoformat()

        return {"statusCode": 200, "body": result}

    except Exception as e:
        return {
            "statusCode": 500,
            "body": {
                "error": str(e),
                "confidence": 0.0,
                "line_items": [],
                "extractor": "semantic",
            },
        }


# ── HTTP / FastAPI mode (future ECS Fargate — no code changes needed) ──────────

def _build_fastapi_app():
    from fastapi import FastAPI, File, UploadFile

    app = FastAPI(title="ML Invoice Extractor", version="1.0.0")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/extract")
    async def extract_endpoint(file: UploadFile = File(...)):
        pdf_bytes = await file.read()
        result = semantic_extract(pdf_bytes)
        for key in ("invoice_date", "due_date"):
            if result.get(key) and hasattr(result[key], "isoformat"):
                result[key] = result[key].isoformat()
        return result

    return app


# Expose FastAPI app at module level so uvicorn can find it
app = _build_fastapi_app()

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
