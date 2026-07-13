import os
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer


MODEL_NAME = "intfloat/multilingual-e5-large"
SERVICE_TOKEN = os.getenv("EMBEDDING_SERVICE_TOKEN")
model = SentenceTransformer(MODEL_NAME)
app = FastAPI(title="Malang News Embedding Service")


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)
    prefix: Literal["query:"] = "query:"
    model: str = MODEL_NAME


def authorize(authorization: str | None) -> None:
    if SERVICE_TOKEN and authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_NAME, "dimensions": 1024}


@app.post("/embed")
def embed(payload: EmbedRequest, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    if payload.model != MODEL_NAME:
        raise HTTPException(status_code=400, detail="Embedding model tidak sesuai")

    vector = model.encode(
        [f"{payload.prefix} {payload.text.strip()}"],
        normalize_embeddings=True,
    )[0].tolist()

    return {
        "embedding": vector,
        "model": MODEL_NAME,
        "prefix": payload.prefix,
        "dimensions": len(vector),
        "normalized": True,
    }
