from __future__ import annotations


class OllamaError(Exception):
    """Base exception for all Ollama LLM integration errors."""


class OllamaConnectionError(OllamaError):
    """Raised when the Ollama daemon cannot be reached or rejects connection."""


class OllamaTimeoutError(OllamaError):
    """Raised when an Ollama chat or generation request exceeds the configured timeout."""


class OllamaModelNotFoundError(OllamaError):
    """Raised when the requested model is not found in the local Ollama repository."""


class OllamaResponseError(OllamaError):
    """Raised when Ollama returns an HTTP error or malformed payload."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class OllamaValidationError(OllamaError):
    """Raised when the model output fails Pydantic schema validation after retries."""

    def __init__(self, message: str, raw_content: str | None = None) -> None:
        super().__init__(message)
        self.raw_content = raw_content

